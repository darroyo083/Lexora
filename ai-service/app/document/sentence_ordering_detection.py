import logging
import re
import time
from dataclasses import dataclass, field
from statistics import median

import cv2

from app.document.normalization import normalize_bbox
from app.schemas.page_analysis import (
    BBox,
    PageAnalysis,
    SentenceOrderingDetectionMetadata,
    SentenceOrderingInteraction,
    SentenceOrderingItem,
    TextSpan,
)


logger = logging.getLogger("uvicorn.error")
DETECTION_METHOD = "sentence-ordering-v1"

SEPARATOR_CHARS = "\u2022\u00b7"  # printed bullet / middle dot between fragments
TERMINAL_PUNCTUATION = ".!?"
# Sentence-final abbreviations whose trailing period is part of the word and
# must NOT be lifted into prompt-level terminal punctuation. "z.B." / "d.h."
# are handled separately by the "stem ends with a period" rule.
ABBREVIATION_STEMS = frozenset(
    {"usw", "bzw", "etc", "evtl", "u", "d", "s", "z", "b", "nr", "ca", "uä"}
)
ROW_NUMBER_PATTERN = re.compile(r"^\d{1,2}(?=\D)")


@dataclass(frozen=True)
class DetectionThresholds:
    adaptive_block_width: float = 0.022
    adaptive_constant: int = 15
    min_separators: int = 2
    min_fragments: int = 3
    min_block_lines: int = 2
    min_block_fragment_cv: float = 0.30
    block_line_gap_scale: float = 2.5
    block_line_gap_min: float = 0.012
    block_gap_absolute_max: float = 0.08
    continuation_gap_ratio: float = 0.75
    continuation_gap_fallback: float = 0.006
    continuation_align_ratio: float = 0.6
    column_align_ratio: float = 0.5
    fragment_column_tolerance: float = 0.02
    column_tolerance: float = 0.06
    row_number_pattern: str = r"^\d{1,2}\s+"
    dot_min_size: int = 5
    dot_max_size: int = 14
    dot_min_area: int = 25
    dot_min_fill: float = 0.55
    dot_mid_band: tuple = (0.35, 0.65)
    min_fragment_gap_ratio: float = 0.005
    score_target_lines: int = 4
    score_target_fragments: float = 5.0


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


def _split_fragments(text: str) -> list[str]:
    """Split an OCR line into non-empty fragment texts by printed separators."""
    return [piece.strip() for piece in re.split(f"[{SEPARATOR_CHARS}]", text) if piece.strip()]


def _split_terminal_punctuation(fragments: list[str]) -> list[str]:
    """Split sentence-ending ``.``/``?``/``!`` into their own orderable items.

    In these scrambled-sentence exercises punctuation is part of the scramble
    itself: the learner must explicitly place it. Both OCR readings — a mark
    glued to a lexical fragment (``mitnehmen?``) and a standalone mark
    (``mitnehmen • ?``) — normalize to the same items ``["mitnehmen", "?"]``.

    Other punctuation is NOT blindly split: commas, colons, semicolons and
    abbreviation periods (``z.B.``, ``usw.``, ``d.h.``) stay attached unless
    OCR already produced them as standalone fragments. Only ``.``/``?``/``!``
    representing sentence-ordering punctuation are split.
    """
    normalized: list[str] = []
    for fragment in fragments:
        match = re.search(r"[.!?]+$", fragment)
        if match is None:
            normalized.append(fragment)
            continue
        stem = fragment[: match.start()]
        if not stem or _is_abbreviation(stem):
            normalized.append(fragment)
            continue
        normalized.append(stem)
        normalized.append(match.group(0))
    return normalized


def _is_abbreviation(stem: str) -> bool:
    """Whether a fragment stem looks like an abbreviation, whose trailing
    period must not be lifted as sentence-ending punctuation.

    Multi-part abbreviations (``z.B.``, ``d.h.``, ``u.a.``) keep an internal
    period in the stem; single-part ones (``usw.``) are matched by name.
    """
    return "." in stem or stem.lower() in ABBREVIATION_STEMS


def _separator_count(text: str) -> int:
    return sum(1 for char in text if char in SEPARATOR_CHARS)


def _band_binary(band, image_width: int) -> "cv2.typing.MatLike":
    block_size = max(
        3, round(image_width * THRESHOLDS.adaptive_block_width)
    )
    if block_size % 2 == 0:
        block_size += 1
    return cv2.adaptiveThreshold(
        band,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        block_size,
        THRESHOLDS.adaptive_constant,
    )


def _separator_dots(
    band,
    x_offset: int,
) -> list[float]:
    """Compact mid-height ink blobs inside a line band (printed separator dots).

    Returns sorted center-x pixel positions (absolute, including x_offset).
    The filter targets small, roughly filled round blobs vertically centered in
    the band, which distinguishes the printed bullet separators from letter
    parts, umlauts and baseline periods.
    """
    band_height, band_width = band.shape[:2]
    if band_width < 8 or band_height < 5:
        return []
    n, _, stats, _ = cv2.connectedComponentsWithStats(band)
    dots: list[float] = []
    for index in range(1, n):
        x, y, width, height, area = stats[index]
        if not (
            THRESHOLDS.dot_min_size <= width <= THRESHOLDS.dot_max_size
            and THRESHOLDS.dot_min_size <= height <= THRESHOLDS.dot_max_size
            and area >= THRESHOLDS.dot_min_area
            and area / (width * height) >= THRESHOLDS.dot_min_fill
        ):
            continue
        center_y = y + height / 2
        low, high = THRESHOLDS.dot_mid_band
        if not (low * band_height <= center_y <= high * band_height):
            continue
        dots.append(x_offset + x + width / 2)
    return sorted(dots)


def _proportional_boundaries(
    fragments: list[str],
    x0: int,
    x1: int,
) -> list[float]:
    total = sum(len(fragment) for fragment in fragments)
    if total == 0:
        return []
    width = x1 - x0
    boundaries: list[float] = []
    cumulative = 0
    for fragment in fragments[:-1]:
        cumulative += len(fragment)
        boundaries.append(x0 + (cumulative / total) * width)
    return boundaries


def _fragment_boundaries(
    fragments: list[str],
    dots: list[float],
    x0: int,
    x1: int,
) -> list[float]:
    """Greedy assignment of separator dots to fragment boundaries.

    Each boundary starts from a proportional text-length estimate and snaps to
    the nearest remaining dot to its right. Dots that cannot be assigned
    (trailing separators, separators OCR merged into a fragment) are skipped,
    so the estimated geometry never crosses text order.
    """
    proportional = _proportional_boundaries(fragments, x0, x1)
    if not proportional:
        return []
    min_gap = max(10, round((x1 - x0) * THRESHOLDS.min_fragment_gap_ratio))
    boundaries: list[float] = []
    available = list(dots)
    cursor = x0 + min_gap
    for estimate in proportional:
        candidates = [
            dot for dot in available
            if dot > cursor and dot < x1 - min_gap
        ]
        if not candidates:
            boundaries.append(max(estimate, cursor))
            continue
        nearest = min(candidates, key=lambda dot: abs(dot - estimate))
        available.remove(nearest)
        boundaries.append(nearest)
        cursor = nearest + min_gap
    return boundaries


@dataclass
class _PromptLine:
    span: TextSpan
    fragments: list[str]
    item_bboxes: list[BBox]
    x0_px: int
    x1_px: int
    y0_px: int
    y1_px: int
    extra_spans: list[TextSpan] = field(default_factory=list)
    has_row_number: bool = False


def _item_bboxes(
    fragments: list[str],
    boundaries: list[float],
    x0: int,
    x1: int,
    y0: int,
    y1: int,
    image_width: int,
    image_height: int,
) -> list[BBox]:
    edges = [x0, *boundaries, x1]
    bboxes: list[BBox] = []
    for index, fragment in enumerate(fragments):
        bboxes.append(
            _normalized_bbox(
                edges[index], y0, edges[index + 1], y1, image_width, image_height
            )
        )
    return bboxes


def _fragment_length_cv(fragments: list[str]) -> float:
    """Coefficient of variation of fragment text lengths.

    Ordering prompts mix short words with longer phrases (high CV), while
    uniform word banks — a different exercise idiom — consist of similar-length
    single words (low CV). Used at block level to reject word banks.
    """
    lengths = [len(fragment) for fragment in fragments]
    if len(lengths) < 2:
        return 1.0
    mean = sum(lengths) / len(lengths)
    if mean <= 0:
        return 1.0
    variance = sum((length - mean) ** 2 for length in lengths) / len(lengths)
    return (variance ** 0.5) / mean


def _candidate_score(
    block_line_count: int,
    average_fragments: float,
    separator_min: int,
    separator_max: int,
) -> float:
    lines_score = min(
        block_line_count / THRESHOLDS.score_target_lines, 1.0
    )
    fragments_score = min(
        average_fragments / THRESHOLDS.score_target_fragments, 1.0
    )
    consistency = (
        separator_min / separator_max if separator_max > 0 else 0.0
    )
    return round(
        0.45 * lines_score + 0.35 * fragments_score + 0.20 * consistency,
        4,
    )


def _strip_merged_row_numbers(
    columns: list[list[_PromptLine]],
    image_width: int,
) -> None:
    """Drop a row number OCR merged into the first fragment of a margin line.

    Some rows render the prompt number directly before the first fragment and
    OCR folds them into one span. The number sits at the margin column, left of
    the fragment column used by the other rows of the same column. The margin
    reference is computed per column, so a merged number on a left-column row
    is never judged against right-column geometry and vice versa.
    """
    for column in columns:
        fragment_xs = [line.x0_px for line in column]
        if len(fragment_xs) < 2:
            continue
        margin_left = median(fragment_xs) - THRESHOLDS.fragment_column_tolerance * image_width
        for line in column:
            if line.x0_px >= margin_left:
                continue
            first = line.fragments[0]
            stripped = re.sub(THRESHOLDS.row_number_pattern, "", first, count=1)
            if stripped != first:
                line.fragments[0] = stripped


def _digit_spans(analysis: PageAnalysis) -> list[TextSpan]:
    """Small standalone numeric tokens (prompt row numbers) at the margin."""
    return [
        span
        for span in analysis.textSpans
        if re.fullmatch(r"\d{1,2}", span.text.strip())
        and span.bbox.width <= 0.04
    ]


def _detect_columns(
    block: list[_PromptLine],
    image_width: int,
) -> list[list[_PromptLine]]:
    """Cluster a block's lines into left-to-right columns by their left edge.

    A column is a vertical stack of prompt rows sharing an x position. The
    tolerance must exceed the within-column indent spread (margin lines, wrapped
    indents) while staying far below the inter-column gap of printed layouts.

    An x-cluster only becomes a real column when its lines share print rows
    (vertical band overlap) with lines of another cluster. Indented dialogue
    rows and margin lines keep the block as a single column, because their
    bands never overlap a neighbouring cluster's lines.
    """
    if not block:
        return []
    sorted_lines = sorted(block, key=lambda line: line.x0_px)
    groups: list[list[_PromptLine]] = [[sorted_lines[0]]]
    tolerance = image_width * THRESHOLDS.column_tolerance
    for line in sorted_lines[1:]:
        if line.x0_px - groups[-1][-1].x0_px > tolerance:
            groups.append([])
        groups[-1].append(line)
    if len(groups) == 1:
        return groups
    if not _groups_share_print_rows(groups):
        return [block]
    return groups


def _groups_share_print_rows(groups: list[list[_PromptLine]]) -> bool:
    """Whether any two x-clusters have lines printed on the same row band."""
    for left_index, left in enumerate(groups):
        for right in groups[left_index + 1:]:
            for a in left:
                for b in right:
                    overlap = _band_overlap(a, b)
                    required = THRESHOLDS.column_align_ratio * min(
                        a.y1_px - a.y0_px,
                        b.y1_px - b.y0_px,
                    )
                    if overlap >= required:
                        return True
    return False


def _band_overlap(line: _PromptLine, other: _PromptLine) -> int:
    return min(line.y1_px, other.y1_px) - max(line.y0_px, other.y0_px)


def _aligns_with_numbered_line(
    line: _PromptLine,
    column_index: int,
    columns: list[list[_PromptLine]],
) -> bool:
    """Whether a line's printed band overlaps a numbered row in another column.

    In a two-column exercise the book prints both columns on the same row
    grid: a wrapped continuation of column C sits exactly on the print row of a
    numbered prompt in the neighbouring column. Band overlap is the layout
    evidence that the unnumbered line is a continuation rather than a
    standalone prompt. Numbered lines are never candidates, so ordinary rows
    of a fully numbered two-column exercise never trigger this rule.
    """
    for other_index, column in enumerate(columns):
        if other_index == column_index:
            continue
        for other in column:
            if not other.has_row_number:
                continue
            overlap = _band_overlap(line, other)
            required = THRESHOLDS.continuation_align_ratio * min(
                line.y1_px - line.y0_px,
                other.y1_px - other.y0_px,
            )
            if overlap >= required:
                return True
    return False


def _merge_line(previous: _PromptLine, line: _PromptLine) -> None:
    previous.fragments.extend(line.fragments)
    previous.item_bboxes.extend(line.item_bboxes)
    previous.extra_spans.append(line.span)
    previous.x0_px = min(previous.x0_px, line.x0_px)
    previous.x1_px = max(previous.x1_px, line.x1_px)
    previous.y0_px = min(previous.y0_px, line.y0_px)
    previous.y1_px = max(previous.y1_px, line.y1_px)


def _assign_continuations(
    block: list[_PromptLine],
    digit_spans: list[TextSpan],
    image_width: int,
    image_height: int,
    columns: list[list[_PromptLine]],
) -> list[list[_PromptLine]]:
    """Merge wrapped continuation lines into their prompt, per column.

    Row numbers are attributed greedily within each column: a margin digit only
    labels a line of its own column, so a right-column continuation can never
    steal a left-column number. Numbered rows are never continuations.

    An unnumbered line is a continuation when it sits far closer to the
    previous line of its OWN column than the column's ordinary prompt spacing
    (0.75 x median positive gap), or when its printed band aligns with a
    numbered row in another column (two-column wrapped lines). Lines without a
    number that keep a normal prompt gap stay standalone prompts (some
    exercises simply omit printed numbers for later rows). A line that opens
    its own column (e.g. a deeply indented wrap) falls back to the previous
    line of the whole block.
    """
    column_of: dict[int, int] = {}
    for index, column in enumerate(columns):
        for line in column:
            column_of[id(line)] = index
    column_x0_px = [min(line.x0_px for line in column) for column in columns]
    digit_pools = [list(digit_spans) for _ in columns]
    margin_zone = image_width * THRESHOLDS.column_tolerance

    for line in block:
        column_index = column_of[id(line)]
        span = line.span
        line_center_y = span.bbox.y + span.bbox.height / 2
        best: TextSpan | None = None
        best_diff: float | None = None
        for digit in digit_pools[column_index]:
            digit_center_y = digit.bbox.y + digit.bbox.height / 2
            if abs(digit_center_y - line_center_y) > max(
                span.bbox.height * 2.0, 0.008
            ):
                continue
            if not (digit.bbox.x + digit.bbox.width < span.bbox.x - 0.004):
                continue
            digit_mid_px = (
                digit.bbox.x + digit.bbox.width / 2
            ) * image_width
            if not (column_x0_px[column_index] - margin_zone <= digit_mid_px):
                continue
            diff = abs(digit_center_y - line_center_y)
            if best is None or diff < best_diff:
                best, best_diff = digit, diff
        if best is not None:
            digit_pools[column_index].remove(best)
            line.has_row_number = True
            continue
        if line.fragments and ROW_NUMBER_PATTERN.match(line.fragments[0]):
            line.has_row_number = True

    tight_limits: list[float] = []
    for column in columns:
        positive_gaps = [
            column[i].y0_px - column[i - 1].y1_px
            for i in range(1, len(column))
            if column[i].y0_px - column[i - 1].y1_px > 0
        ]
        if positive_gaps:
            tight_limits.append(
                THRESHOLDS.continuation_gap_ratio * median(positive_gaps)
            )
        else:
            tight_limits.append(image_height * THRESHOLDS.continuation_gap_fallback)

    merged_columns: list[list[_PromptLine]] = [[] for _ in columns]
    last_merged: _PromptLine | None = None
    for line in block:
        column_index = column_of[id(line)]
        if merged_columns[column_index]:
            previous = merged_columns[column_index][-1]
        elif len(columns[column_index]) == 1:
            # A line that opens its own column (e.g. a deeply indented wrap)
            # merges against the previous line of the whole block; the first
            # line of a multi-line column never merges across columns.
            previous = last_merged
        else:
            previous = None
        if previous is not None and not line.has_row_number:
            gap = line.y0_px - previous.y1_px
            if (
                gap <= tight_limits[column_index]
                or _aligns_with_numbered_line(line, column_index, columns)
            ):
                _merge_line(previous, line)
                continue
        merged_columns[column_index].append(line)
        last_merged = line
    return merged_columns


def detect_sentence_orderings(
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
        "Sentence ordering detection started page=%s image=%s",
        analysis.pageNumber,
        image_path,
    )
    if image.ndim == 2:
        gray = image
    elif image.shape[2] == 4:
        gray = cv2.cvtColor(image, cv2.COLOR_BGRA2GRAY)
    else:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    raw_candidates: list[_PromptLine] = []
    for span in analysis.textSpans:
        if _separator_count(span.text) < THRESHOLDS.min_separators:
            continue
        raw_fragments = _split_fragments(span.text)
        if len(raw_fragments) < THRESHOLDS.min_fragments:
            continue
        fragments = _split_terminal_punctuation(raw_fragments)
        x0 = round(span.bbox.x * image_width)
        x1 = round((span.bbox.x + span.bbox.width) * image_width)
        y0 = round(span.bbox.y * image_height)
        y1 = round((span.bbox.y + span.bbox.height) * image_height)
        band = gray[y0:y1, x0:x1]
        binary = _band_binary(band, image_width)
        dots = _separator_dots(binary, x0)
        boundaries = _fragment_boundaries(fragments, dots, x0, x1)
        item_bboxes = _item_bboxes(
            fragments, boundaries, x0, x1, y0, y1,
            image_width, image_height,
        )
        raw_candidates.append(
            _PromptLine(
                span=span,
                fragments=fragments,
                item_bboxes=item_bboxes,
                x0_px=x0,
                x1_px=x1,
                y0_px=y0,
                y1_px=y1,
            )
        )

    ordered = sorted(raw_candidates, key=lambda line: (line.span.bbox.y, line.span.bbox.x))
    blocks: list[list[_PromptLine]] = []
    for line in ordered:
        if blocks:
            previous = blocks[-1][-1]
            previous_bottom = previous.y1_px
            gap = line.y0_px - previous_bottom
            line_height = previous.y1_px - previous.y0_px
            max_gap = max(
                line_height * THRESHOLDS.block_line_gap_scale,
                image_height * THRESHOLDS.block_line_gap_min,
            )
            max_gap = min(max_gap, image_height * THRESHOLDS.block_gap_absolute_max)
            if gap <= max_gap:
                blocks[-1].append(line)
                continue
        blocks.append([line])

    digit_spans = _digit_spans(analysis)
    accepted_blocks: list[list[list[_PromptLine]]] = []
    for block in blocks:
        columns = _detect_columns(block, image_width)
        merged_columns = _assign_continuations(
            block, digit_spans, image_width, image_height, columns
        )
        merged_block = [
            line for column in merged_columns for line in column
        ]
        if len(merged_block) < THRESHOLDS.min_block_lines:
            continue
        if (
            sum(_fragment_length_cv(line.fragments) for line in merged_block)
            / len(merged_block)
            < THRESHOLDS.min_block_fragment_cv
        ):
            continue
        _strip_merged_row_numbers(merged_columns, image_width)
        accepted_blocks.append(merged_columns)

    interactions: list[SentenceOrderingInteraction] = []
    for block_index, block_columns in enumerate(accepted_blocks, start=1):
        exercise_id = f"sentence-order-exercise-{analysis.pageNumber}-{block_index}"
        block = [line for column in block_columns for line in column]
        separator_counts = [_separator_count(line.span.text) for line in block]
        average_fragments = sum(len(line.fragments) for line in block) / len(block)
        score = _candidate_score(
            len(block),
            average_fragments,
            min(separator_counts),
            max(separator_counts),
        )
        prompt_index = 0
        for column in block_columns:
            for line in column:
                prompt_index += 1
                interaction_id = (
                    f"sentence-ordering-{analysis.pageNumber}-"
                    f"{block_index}-{prompt_index}"
                )
                items = [
                    SentenceOrderingItem(
                        id=f"{interaction_id}-item-{index}",
                        text=fragment,
                        bbox=line.item_bboxes[index - 1],
                        originalIndex=index,
                    )
                    for index, fragment in enumerate(line.fragments, start=1)
                ]
                interactions.append(
                    SentenceOrderingInteraction(
                        id=interaction_id,
                        bbox=_normalized_bbox(
                            line.x0_px, line.y0_px, line.x1_px, line.y1_px,
                            image_width, image_height,
                        ),
                        exerciseId=exercise_id,
                        promptIndex=prompt_index,
                        candidateScore=score,
                        nearbyTextSpanIds=[
                            line.span.id,
                            *[span.id for span in line.extra_spans],
                        ],
                        items=items,
                    )
                )

    elapsed_ms = int((time.monotonic() - started) * 1000)
    result = analysis.model_copy(
        update={
            "sentenceOrderings": interactions,
            "sentenceOrderingDetection": SentenceOrderingDetectionMetadata(
                detectionMethod=DETECTION_METHOD,
                rawCandidateCount=len(raw_candidates),
                acceptedCount=len(interactions),
                groupCount=len(accepted_blocks),
                durationMs=elapsed_ms,
            ),
        }
    )
    logger.info(
        "Sentence ordering detection completed page=%s raw=%s accepted=%s groups=%s duration_ms=%s",
        analysis.pageNumber,
        len(raw_candidates),
        len(interactions),
        len(accepted_blocks),
        elapsed_ms,
    )
    return result
