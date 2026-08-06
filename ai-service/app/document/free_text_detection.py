import logging
import time
from dataclasses import dataclass
from statistics import median

import cv2

from app.document.normalization import denormalize_bbox, normalize_bbox
from app.schemas.page_analysis import (
    BBox,
    FreeTextDetectionMetadata,
    FreeTextInteraction,
    FreeTextLine,
    PageAnalysis,
    TextSpan,
)


logger = logging.getLogger("uvicorn.error")
DETECTION_METHOD = "free-text-v1"
# Mirrors the FillBlank detector: OCR garbage (printed dot glyphs OCR cannot
# classify) is never used as prompt evidence.
MIN_SPAN_CONFIDENCE = 0.5


@dataclass(frozen=True)
class DetectionThresholds:
    """All free-text-v1 detector parameters, relative to page geometry.

    A FreeText response area is a vertical stack of long horizontal writing
    lines that stand alone in their print rows: no other ink on the row, no
    text directly above or below a line, no table border crossing it. The
    learner writes their own response on these lines; nothing in the printed
    structure selects or orders content for them.
    """

    adaptive_block_width: float = 0.022
    adaptive_constant: int = 15
    morphology_kernel_width: float = 0.015
    # Long writing lines span most of the writing column. Lines shorter than
    # 0.30 of the page width belong to FillBlank-style structures (sentence
    # blanks, short answer rows) and stay with horizontal-line-v1.
    min_line_width: float = 0.30
    max_line_width: float = 0.97
    max_line_thickness: float = 0.012
    min_aspect_ratio: float = 20.0
    surrounding_margin: float = 0.004
    light_pixel_threshold: int = 235
    min_surrounding_light_fraction: float = 0.82
    # A writing line's row is empty: ink within the row band beyond the line
    # edges (or in tight bands above/below it) means the line belongs to
    # printed text, a table, or an underline instead.
    side_band_ratio: float = 0.05
    row_band_ratio: float = 0.004
    max_side_ink: float = 0.03
    above_band_ratio: float = 0.006
    max_above_ink: float = 0.06
    below_band_ratio: float = 0.006
    max_below_ink: float = 0.08
    vertical_strip_min_height_ratio: float = 0.03
    # Parallel writing lines of one response area cluster with a tight
    # vertical gap and horizontal overlap (same column).
    stack_max_gap: float = 0.025
    stack_min_x_overlap: float = 0.5
    # Three clean parallel lines are self-evident writing rows. One or two
    # lines need a printed prompt above them (a lone rule or a decorative
    # double rule without a prompt is never an answer area).
    stack_min_promptless_lines: int = 3
    # The prompt must be NEAR the stack: exercise instructions sit directly
    # above their writing lines, while unrelated page content (headings,
    # grid headers, paragraphs) is typically much farther away.
    prompt_max_distance: float = 0.18
    prompt_x_margin: float = 0.05
    prompt_min_span_height: float = 0.004
    # Score composition: line evidence dominates, prompt presence confirms.
    score_lines_weight: float = 0.45
    score_width_weight: float = 0.35
    score_prompt_weight: float = 0.20
    score_target_line_count: float = 2.0
    score_target_width: float = 0.60
    min_score: float = 0.55
    # FillBlank suppression: a FreeText response line and its FillBlank
    # lineBbox come from the same contour, so their boxes are near-identical.
    blank_suppression_iou: float = 0.5


THRESHOLDS = DetectionThresholds()


def _normalized_bbox(
    left: float,
    top: float,
    right: float,
    bottom: float,
    image_width: int,
    image_height: int,
) -> BBox:
    left = min(max(left, 0), image_width)
    top = min(max(top, 0), image_height)
    right = min(max(right, left), image_width)
    bottom = min(max(bottom, top), image_height)
    x, y, width, height = normalize_bbox(
        left, top, right, bottom, image_width, image_height
    )
    return BBox(x=x, y=y, width=width, height=height)


def _ink_fraction(binary, x0: int, x1: int, y0: int, y1: int) -> float:
    if x1 <= x0 or y1 <= y0:
        return 0.0
    region = binary[y0:y1, x0:x1]
    return float((region > 0).mean())


def _has_light_surroundings(
    gray,
    x: int,
    y: int,
    width: int,
    height: int,
) -> bool:
    image_height = gray.shape[0]
    margin = max(2, round(image_height * THRESHOLDS.surrounding_margin))
    top = gray[max(0, y - margin):y, x:x + width]
    bottom = gray[y + height:min(image_height, y + height + margin), x:x + width]
    pixel_count = top.size + bottom.size
    if pixel_count == 0:
        return False
    light_count = int((top >= THRESHOLDS.light_pixel_threshold).sum())
    light_count += int((bottom >= THRESHOLDS.light_pixel_threshold).sum())
    return light_count / pixel_count >= THRESHOLDS.min_surrounding_light_fraction


def _vertical_strips(
    binary, image_height: int, image_width: int
) -> list[tuple[int, int, int, int]]:
    kernel_height = max(
        3, round(image_height * THRESHOLDS.vertical_strip_min_height_ratio)
    )
    vertical = cv2.morphologyEx(
        binary, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, kernel_height))
    )
    contours, _ = cv2.findContours(vertical, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    return [
        cv2.boundingRect(c)
        for c in contours
        if cv2.boundingRect(c)[3] >= image_height * THRESHOLDS.vertical_strip_min_height_ratio
    ]


def _crosses_vertical_strip(
    strips: list[tuple[int, int, int, int]],
    x: int,
    y: int,
    width: int,
    height: int,
) -> bool:
    for vx, vy, vw, vh in strips:
        if not (max(vx, x) < min(vx + vw, x + width)):
            continue
        if not (max(vy, y) < min(vy + vh, y + height)):
            continue
        return True
    return False


def _is_isolated_writing_line(
    binary,
    strips: list[tuple[int, int, int, int]],
    x: int,
    y: int,
    width: int,
    height: int,
    image_height: int,
    image_width: int,
) -> bool:
    """A long thin line whose print row contains nothing else."""
    row_half = max(2, round(image_height * THRESHOLDS.row_band_ratio))
    top = max(0, y - row_half)
    bottom = min(image_height, y + height + row_half)
    side = max(2, round(image_width * THRESHOLDS.side_band_ratio))
    left = _ink_fraction(binary, max(0, x - side), x, top, bottom)
    right = _ink_fraction(binary, x + width, min(image_width, x + width + side), top, bottom)
    if max(left, right) > THRESHOLDS.max_side_ink:
        return False
    above_band = max(2, round(image_height * THRESHOLDS.above_band_ratio))
    above = _ink_fraction(binary, x, x + width, max(0, y - above_band), y)
    if above > THRESHOLDS.max_above_ink:
        return False
    below_band = max(2, round(image_height * THRESHOLDS.below_band_ratio))
    below = _ink_fraction(
        binary, x, x + width, y + height, min(image_height, y + height + below_band)
    )
    if below > THRESHOLDS.max_below_ink:
        return False
    if _crosses_vertical_strip(strips, x, y, width, height):
        return False
    return True


def _prompt_spans(
    stack: list[tuple[int, int, int, int]],
    analysis: PageAnalysis,
    image_height: int,
    image_width: int,
) -> list[TextSpan]:
    """OCR spans directly above the stack that could be the printed prompt."""
    if not stack:
        return []
    line_left = min(item[0] for item in stack)
    line_right = max(item[0] + item[2] for item in stack)
    stack_top = min(item[1] for item in stack)
    margin = image_width * THRESHOLDS.prompt_x_margin
    max_distance = image_height * THRESHOLDS.prompt_max_distance
    prompts: list[TextSpan] = []
    for span in analysis.textSpans:
        if span.confidence < MIN_SPAN_CONFIDENCE:
            continue
        if span.bbox.height < THRESHOLDS.prompt_min_span_height:
            continue
        left, top, right, bottom = denormalize_bbox(
            span.bbox.x,
            span.bbox.y,
            span.bbox.width,
            span.bbox.height,
            analysis.width,
            analysis.height,
        )
        center_x = (left + right) / 2
        if not (line_left - margin <= center_x <= line_right + margin):
            continue
        if not (bottom <= stack_top):
            continue
        if stack_top - top > max_distance:
            continue
        prompts.append(span)
    return sorted(prompts, key=lambda span: (span.bbox.y, span.bbox.x))


def _candidate_score(
    stack: list[tuple[int, int, int, int]],
    has_prompt: bool,
    image_width: int,
) -> float:
    line_count_score = min(
        len(stack) / THRESHOLDS.score_target_line_count, 1.0
    )
    mean_width = median(item[2] for item in stack) / image_width
    width_score = min(mean_width / THRESHOLDS.score_target_width, 1.0)
    prompt_score = 1.0 if has_prompt else 0.0
    return round(
        THRESHOLDS.score_lines_weight * line_count_score
        + THRESHOLDS.score_width_weight * width_score
        + THRESHOLDS.score_prompt_weight * prompt_score,
        4,
    )


def _union_bbox(
    lines: list[tuple[int, int, int, int]],
    image_width: int,
    image_height: int,
) -> BBox:
    left = min(item[0] for item in lines)
    top = min(item[1] for item in lines)
    right = max(item[0] + item[2] for item in lines)
    bottom = max(item[1] + item[3] for item in lines)
    return _normalized_bbox(left, top, right, bottom, image_width, image_height)


def detect_free_texts(
    image_path: str,
    analysis: PageAnalysis,
) -> PageAnalysis:
    started = time.monotonic()
    image = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if image is None:
        raise ValueError(f"Unable to read image: {image_path}")
    image_height, image_width = image.shape[:2]
    if (image_width, image_height) != (analysis.width, analysis.height):
        raise ValueError(
            "Image dimensions do not match analysis: "
            f"image={image_width}x{image_height}, "
            f"analysis={analysis.width}x{analysis.height}"
        )
    logger.info(
        "FreeText detection started page=%s image=%s",
        analysis.pageNumber,
        image_path,
    )
    if image.ndim == 2:
        gray = image
    elif image.shape[2] == 4:
        gray = cv2.cvtColor(image, cv2.COLOR_BGRA2GRAY)
    else:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    adaptive_block_size = max(
        3, round(image_width * THRESHOLDS.adaptive_block_width)
    )
    if adaptive_block_size % 2 == 0:
        adaptive_block_size += 1
    binary = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        adaptive_block_size,
        THRESHOLDS.adaptive_constant,
    )
    kernel_width = max(3, round(image_width * THRESHOLDS.morphology_kernel_width))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_width, 1))
    horizontal = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    contours, _ = cv2.findContours(
        horizontal, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    raw_lines: list[tuple[int, int, int, int]] = []
    for contour in contours:
        x, y, width, height = cv2.boundingRect(contour)
        if width < kernel_width:
            continue
        width_ratio = width / image_width
        thickness_ratio = height / image_height
        if not (
            THRESHOLDS.min_line_width <= width_ratio <= THRESHOLDS.max_line_width
            and thickness_ratio <= THRESHOLDS.max_line_thickness
            and width / max(height, 1) >= THRESHOLDS.min_aspect_ratio
        ):
            continue
        if not _has_light_surroundings(gray, x, y, width, height):
            continue
        raw_lines.append((x, y, width, height))

    strips = _vertical_strips(binary, image_height, image_width)
    isolated: list[tuple[int, int, int, int]] = []
    for x, y, width, height in raw_lines:
        if _is_isolated_writing_line(
            binary,
            strips,
            x,
            y,
            width,
            height,
            image_height,
            image_width,
        ):
            isolated.append((x, y, width, height))

    # Cluster isolated lines into writing stacks. Lines of one response area
    # share a column (horizontal overlap) and a tight vertical gap; two
    # side-by-side stacks with interleaved rows must never merge.
    isolated.sort(key=lambda line: (line[0], line[1]))
    x_groups: list[list[tuple[int, int, int, int]]] = []
    for line in isolated:
        if x_groups:
            group = x_groups[-1]
            prev = group[-1]
            overlap = max(
                0,
                min(prev[0] + prev[2], line[0] + line[2]) - max(prev[0], line[0]),
            )
            min_width = min(prev[2], line[2])
            same_column = overlap >= THRESHOLDS.stack_min_x_overlap * min_width
            if not same_column:
                x_groups.append([line])
            else:
                group.append(line)
        else:
            x_groups.append([line])
    stacks: list[list[tuple[int, int, int, int]]] = []
    for group in x_groups:
        group.sort(key=lambda line: (line[1], line[0]))
        current: list[tuple[int, int, int, int]] = []
        for line in group:
            if current:
                prev = current[-1]
                gap = line[1] - (prev[1] + prev[3])
                if gap > image_height * THRESHOLDS.stack_max_gap:
                    stacks.append(current)
                    current = [line]
                else:
                    current.append(line)
            else:
                current = [line]
        if current:
            stacks.append(current)

    accepted: list[tuple[list[tuple[int, int, int, int]], list[TextSpan]]] = []
    for stack in stacks:
        prompts = _prompt_spans(stack, analysis, image_height, image_width)
        if len(stack) < THRESHOLDS.stack_min_promptless_lines and not prompts:
            continue
        score = _candidate_score(stack, bool(prompts), image_width)
        if score < THRESHOLDS.min_score:
            continue
        accepted.append((stack, prompts))

    accepted.sort(key=lambda candidate: (candidate[0][0][1], candidate[0][0][0]))
    interactions: list[FreeTextInteraction] = []
    for interaction_index, (stack, prompts) in enumerate(accepted, start=1):
        interaction_id = f"free-text-{analysis.pageNumber}-{interaction_index}"
        lines: list[FreeTextLine] = []
        for line_index, (x, y, width, height) in enumerate(stack, start=1):
            lines.append(
                FreeTextLine(
                    id=f"{interaction_id}-line-{line_index}",
                    bbox=_normalized_bbox(
                        x, y, x + width, y + height, image_width, image_height
                    ),
                )
            )
        interactions.append(
            FreeTextInteraction(
                id=interaction_id,
                bbox=_union_bbox(stack, image_width, image_height),
                candidateScore=_candidate_score(
                    stack, bool(prompts), image_width
                ),
                nearbyTextSpanIds=[span.id for span in prompts],
                responseLines=lines,
            )
        )

    # Coexistence with FillBlank: a FreeText response line and its FillBlank
    # lineBbox come from the same contour, so their boxes are near-identical.
    # Such blanks are the writing rows of the FreeText area, not inline
    # sentence blanks; drop them from exerciseBlanks (everything else stays).
    claimed: set[tuple[int, int, int, int]] = set()
    for interaction in interactions:
        for line in interaction.responseLines:
            left, top, right, bottom = denormalize_bbox(
                line.bbox.x,
                line.bbox.y,
                line.bbox.width,
                line.bbox.height,
                analysis.width,
                analysis.height,
            )
            claimed.add((left, top, right - left, bottom - top))
    kept_blanks: list = []
    for blank in analysis.exerciseBlanks:
        left, top, right, bottom = denormalize_bbox(
            blank.lineBbox.x,
            blank.lineBbox.y,
            blank.lineBbox.width,
            blank.lineBbox.height,
            analysis.width,
            analysis.height,
        )
        blank_width = right - left
        blank_height = bottom - top
        suppressed = False
        for x, y, width, height in claimed:
            intersection_x = max(
                0, min(x + width, left + blank_width) - max(x, left)
            )
            intersection_y = max(
                0, min(y + height, top + blank_height) - max(y, top)
            )
            intersection_area = intersection_x * intersection_y
            union_area = (
                width * height + blank_width * blank_height - intersection_area
            )
            if union_area > 0 and intersection_area / union_area >= THRESHOLDS.blank_suppression_iou:
                suppressed = True
                break
        if not suppressed:
            kept_blanks.append(blank)

    elapsed_ms = int((time.monotonic() - started) * 1000)
    result = analysis.model_copy(
        update={
            "exerciseBlanks": kept_blanks,
            "freeTextInteractions": interactions,
            "freeTextDetection": FreeTextDetectionMetadata(
                detectionMethod=DETECTION_METHOD,
                rawCandidateCount=len(raw_lines),
                acceptedCount=len(interactions),
                groupCount=len(accepted),
                durationMs=elapsed_ms,
            ),
        }
    )
    logger.info(
        "FreeText detection completed page=%s raw=%s stacks=%s accepted=%s "
        "suppressed_blanks=%s duration_ms=%s",
        analysis.pageNumber,
        len(raw_lines),
        len(stacks),
        len(interactions),
        len(analysis.exerciseBlanks) - len(kept_blanks),
        elapsed_ms,
    )
    return result
