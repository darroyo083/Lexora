import logging
import time
from dataclasses import dataclass
from statistics import median

import cv2

from app.document.normalization import denormalize_bbox, normalize_bbox
from app.schemas.page_analysis import (
    BBox,
    BlankDetectionMetadata,
    ExerciseBlank,
    PageAnalysis,
    TextSpan,
)


logger = logging.getLogger("uvicorn.error")
DETECTION_METHOD = "horizontal-line-v1"
SUFFIX_DETECTION_METHOD = "short-suffix-line-v1"


@dataclass(frozen=True)
class DetectionThresholds:
    adaptive_block_width: float = 0.022
    adaptive_constant: int = 15
    morphology_kernel_width: float = 0.015
    min_line_width: float = 0.025
    max_line_width: float = 0.45
    max_line_thickness: float = 0.012
    min_aspect_ratio: float = 8.0
    max_horizontal_gap: float = 0.06
    max_vertical_gap: float = 0.006
    nearby_vertical_height_scale: float = 1.5
    interaction_height_scale: float = 1.25
    interaction_baseline_position: float = 0.82
    score_target_width: float = 0.12
    score_target_aspect_ratio: float = 30.0
    score_target_evidence_count: int = 2
    short_line_width: float = 0.05
    embedded_suffix_max_width: float = 0.04
    max_overlap_rejection_width: float = 0.065
    max_text_overlap_ratio: float = 0.35
    surrounding_margin: float = 0.004
    light_pixel_threshold: int = 235
    min_surrounding_light_fraction: float = 0.82
    suffix_min_width: float = 0.02
    suffix_max_width: float = 0.06
    suffix_above_ink_max: float = 0.05
    suffix_side_ink_min: float = 0.03
    occupied_above_ink_min: float = 0.10
    above_band_ratio: float = 0.015
    side_band_ratio: float = 0.10
    row_band_ratio: float = 0.018
    structural_vnear_ratio: float = 0.09
    vertical_strip_min_height_ratio: float = 0.03
    parallel_overlap_min: float = 0.6


THRESHOLDS = DetectionThresholds()


def _nearby_spans(
    x: int,
    y: int,
    width: int,
    height: int,
    analysis: PageAnalysis,
) -> list[TextSpan]:
    line_left = x
    line_right = x + width
    line_center_y = y + (height / 2)
    nearby: list[TextSpan] = []

    for span in analysis.textSpans:
        left, top, right, bottom = denormalize_bbox(
            span.bbox.x,
            span.bbox.y,
            span.bbox.width,
            span.bbox.height,
            analysis.width,
            analysis.height,
        )
        span_center_y = (top + bottom) / 2
        vertical_limit = max(
            (bottom - top) * THRESHOLDS.nearby_vertical_height_scale,
            analysis.height * THRESHOLDS.max_vertical_gap,
        )
        horizontal_gap = max(left - line_right, line_left - right, 0)
        if (
            abs(span_center_y - line_center_y) <= vertical_limit
            and horizontal_gap <= analysis.width * THRESHOLDS.max_horizontal_gap
        ):
            nearby.append(span)

    return sorted(nearby, key=lambda span: (span.bbox.x, span.id))


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


def _candidate_score(
    width: int,
    height: int,
    image_width: int,
    nearby_count: int,
) -> float:
    width_score = min(
        width / (image_width * THRESHOLDS.score_target_width), 1.0
    )
    aspect_score = min(
        (width / max(height, 1)) / THRESHOLDS.score_target_aspect_ratio,
        1.0,
    )
    evidence_score = min(
        nearby_count / THRESHOLDS.score_target_evidence_count, 1.0
    )
    return round(0.45 * width_score + 0.30 * aspect_score + 0.25 * evidence_score, 4)


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


def _ink_fraction(binary, x0: int, x1: int, y0: int, y1: int) -> float:
    if x1 <= x0 or y1 <= y0:
        return 0.0
    region = binary[y0:y1, x0:x1]
    return float((region > 0).mean())


def _vertical_strips(binary, image_height: int, image_width: int) -> list[tuple[int, int, int, int]]:
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


def _nearest_vertical_strip(
    strips: list[tuple[int, int, int, int]],
    x: int,
    y: int,
    width: int,
    height: int,
    image_height: int,
) -> int:
    nearest = None
    for vx, vy, vw, vh in strips:
        if max(vy, y) >= min(vy + vh, y + height + 90):
            continue
        gap = min(abs(vx - x), abs(vx + vw - (x + width)))
        if nearest is None or gap < nearest:
            nearest = gap
    return int(nearest) if nearest is not None else 10**9


def _has_parallel_line(
    raw_candidates: list[tuple[int, int, int, int]],
    x: int,
    y: int,
    width: int,
    image_height: int,
) -> bool:
    gap = max(2, round(image_height * THRESHOLDS.row_band_ratio))
    for x2, y2, w2, _h2 in raw_candidates:
        if (x2, y2) == (x, y):
            continue
        if abs(y2 - y) > gap:
            continue
        overlap = max(0, min(x + width, x2 + w2) - max(x, x2))
        if overlap >= THRESHOLDS.parallel_overlap_min * min(width, w2):
            return True
    return False


def _is_text_occupied_table_line(
    binary,
    strips: list[tuple[int, int, int, int]],
    raw_candidates: list[tuple[int, int, int, int]],
    x: int,
    y: int,
    width: int,
    height: int,
    image_height: int,
    image_width: int,
) -> bool:
    band = max(2, round(image_height * THRESHOLDS.above_band_ratio))
    above = _ink_fraction(binary, x, x + width, max(0, y - band), y)
    if above < THRESHOLDS.occupied_above_ink_min:
        return False
    vnear = _nearest_vertical_strip(strips, x, y, width, height, image_height)
    if vnear <= image_width * THRESHOLDS.structural_vnear_ratio:
        return True
    return _has_parallel_line(raw_candidates, x, y, width, image_height)


def _is_suffix_candidate(
    binary,
    strips: list[tuple[int, int, int, int]],
    raw_candidates: list[tuple[int, int, int, int]],
    x: int,
    y: int,
    width: int,
    height: int,
    nearby: list[TextSpan],
    image_height: int,
    image_width: int,
) -> bool:
    width_ratio = width / image_width
    if not (THRESHOLDS.suffix_min_width <= width_ratio < THRESHOLDS.suffix_max_width):
        return False
    if not nearby:
        return False
    band = max(2, round(image_height * THRESHOLDS.above_band_ratio))
    above = _ink_fraction(binary, x, x + width, max(0, y - band), y)
    if above > THRESHOLDS.suffix_above_ink_max:
        return False
    row_half = max(2, round(image_height * THRESHOLDS.row_band_ratio))
    side = max(2, round(image_width * THRESHOLDS.side_band_ratio))
    top = max(0, y - row_half)
    bottom = min(image_height, y + height + row_half)
    left = _ink_fraction(binary, max(0, x - side), x, top, bottom)
    right = _ink_fraction(binary, x + width, min(image_width, x + width + side), top, bottom)
    if max(left, right) < THRESHOLDS.suffix_side_ink_min:
        return False
    vnear = _nearest_vertical_strip(strips, x, y, width, height, image_height)
    if vnear <= image_width * THRESHOLDS.structural_vnear_ratio:
        return False
    return not _has_parallel_line(raw_candidates, x, y, width, image_height)


def _has_text_context(
    x: int,
    y: int,
    width: int,
    height: int,
    nearby: list[TextSpan],
    analysis: PageAnalysis,
) -> bool:
    line_left = x
    line_right = x + width
    line_center_y = y + height / 2
    has_left = False
    has_right = False
    overlaps_text = False

    for span in nearby:
        left, top, right, bottom = denormalize_bbox(
            span.bbox.x,
            span.bbox.y,
            span.bbox.width,
            span.bbox.height,
            analysis.width,
            analysis.height,
        )
        overlap = max(0, min(line_right, right) - max(line_left, left))
        overlap_ratio = overlap / max(1, min(width, right - left))
        vertical_distance = abs(line_center_y - (top + bottom) / 2)
        overlaps_text = overlaps_text or (
            width / analysis.width < THRESHOLDS.max_overlap_rejection_width
            and overlap_ratio > THRESHOLDS.max_text_overlap_ratio
            and vertical_distance <= (bottom - top) * 1.2
        )
        has_left = has_left or right <= line_left
        has_right = has_right or left >= line_right

    width_ratio = width / analysis.width
    if has_left and has_right and (
        not overlaps_text
        or width_ratio < THRESHOLDS.embedded_suffix_max_width
    ):
        return True
    if overlaps_text:
        return False
    return width_ratio >= THRESHOLDS.max_overlap_rejection_width or (
        width_ratio >= THRESHOLDS.short_line_width
        and (has_left or has_right)
    )


def detect_exercise_blanks(
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
        "Blank detection started page=%s image=%s", analysis.pageNumber, image_path
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

    raw_candidates: list[tuple[int, int, int, int]] = []
    for contour in contours:
        x, y, width, height = cv2.boundingRect(contour)
        if width >= kernel_width:
            raw_candidates.append((x, y, width, height))

    strips = _vertical_strips(binary, image_height, image_width)
    accepted: list[tuple[int, int, int, int, list[TextSpan], str]] = []
    for x, y, width, height in raw_candidates:
        width_ratio = width / image_width
        thickness_ratio = height / image_height
        within_width = (
            THRESHOLDS.suffix_min_width <= width_ratio <= THRESHOLDS.max_line_width
        )
        if not (
            within_width
            and thickness_ratio <= THRESHOLDS.max_line_thickness
            and width / max(height, 1) >= THRESHOLDS.min_aspect_ratio
        ):
            continue
        if not _has_light_surroundings(gray, x, y, width, height):
            continue
        if _is_text_occupied_table_line(
            binary,
            strips,
            raw_candidates,
            x,
            y,
            width,
            height,
            image_height,
            image_width,
        ):
            continue
        nearby = _nearby_spans(x, y, width, height, analysis)
        detection_method: str | None = None
        if nearby and _has_text_context(x, y, width, height, nearby, analysis):
            detection_method = DETECTION_METHOD
        elif _is_suffix_candidate(
            binary,
            strips,
            raw_candidates,
            x,
            y,
            width,
            height,
            nearby,
            image_height,
            image_width,
        ):
            detection_method = SUFFIX_DETECTION_METHOD
        if detection_method is None:
            continue
        accepted.append((x, y, width, height, nearby, detection_method))

    accepted.sort(key=lambda candidate: (candidate[1], candidate[0]))
    blanks: list[ExerciseBlank] = []
    for index, (x, y, width, height, nearby, detection_method) in enumerate(
        accepted, start=1
    ):
        nearby_heights = [span.bbox.height * image_height for span in nearby]
        interaction_height = median(nearby_heights) * THRESHOLDS.interaction_height_scale
        line_y = y + (height / 2)
        interaction_top = (
            line_y
            - interaction_height * THRESHOLDS.interaction_baseline_position
        )
        blanks.append(
            ExerciseBlank(
                id=f"blank-{analysis.pageNumber}-{index}",
                detectionMethod=detection_method,
                lineBbox=_normalized_bbox(
                    x, y, x + width, y + height, image_width, image_height
                ),
                interactionBbox=_normalized_bbox(
                    x,
                    interaction_top,
                    x + width,
                    interaction_top + interaction_height,
                    image_width,
                    image_height,
                ),
                candidateScore=_candidate_score(
                    width, height, image_width, len(nearby)
                ),
                nearbyTextSpanIds=[span.id for span in nearby],
            )
        )

    elapsed_ms = int((time.monotonic() - started) * 1000)
    result = analysis.model_copy(
        update={
            "exerciseBlanks": blanks,
            "blankDetection": BlankDetectionMetadata(
                detectionMethod=DETECTION_METHOD,
                rawCandidateCount=len(raw_candidates),
                acceptedCount=len(blanks),
                durationMs=elapsed_ms,
            ),
        }
    )
    logger.info(
        "Blank detection completed page=%s raw=%s accepted=%s duration_ms=%s",
        analysis.pageNumber,
        len(raw_candidates),
        len(blanks),
        elapsed_ms,
    )
    return result
