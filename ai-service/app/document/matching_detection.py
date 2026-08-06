import logging
import re
import time
from dataclasses import dataclass, field
from statistics import median

import cv2

from app.document.normalization import normalize_bbox
from app.schemas.page_analysis import (
    BBox,
    MatchingDetectionMetadata,
    MatchingInteraction,
    MatchingItem,
    PageAnalysis,
    TextSpan,
)


logger = logging.getLogger("uvicorn.error")
DETECTION_METHOD = "matching-v1"

LEFT_DIGIT_PATTERN = re.compile(r"^\d{1,2}\.?$")
LEADING_DIGIT_PATTERN = re.compile(r"^(\d{1,2})\.?\s+")
TRAILING_DIGIT_PATTERN = re.compile(r"\s+(\d{1,2})\.?$")
RIGHT_LETTER_PATTERN = re.compile(r"^[A-ZÄÖÜ]$")
NON_ALNUM_PREFIX = re.compile(r"^[^A-Za-z0-9ÄÖÜäöüß]+")
# OCR reliably reads the real item text; printed marks and dot glyphs it
# cannot classify come back as short low-confidence garbage spans.
MIN_SPAN_CONFIDENCE = 0.5


@dataclass(frozen=True)
class DetectionThresholds:
    """All matching-v1 detector parameters, relative to page geometry.

    Anchor dots are the printed connection markers of a matching exercise.
    They must be small filled roughly-round blobs, isolated between the two
    item columns. Sizes are page-relative so the same detector works across
    raster densities.
    """

    dot_min_diameter: float = 0.0012
    dot_max_diameter: float = 0.0055
    dot_min_area: int = 12
    dot_min_fill: float = 0.55
    # Real connection anchors are isolated marks in the whitespace between
    # the two columns. Punctuation like ``?`` or ``!`` bottom dots sit inside
    # their glyph and always have ink within this margin.
    dot_isolation_margin: float = 0.005
    # Cluster step must not exceed the spread limit, otherwise stray dots
    # between the two anchor columns chain into a real column and widen it.
    column_x_tolerance: float = 0.003
    column_max_spread: float = 0.003
    # Two dots suffice for a column: a missing anchor (print/OCR variance)
    # can leave an otherwise clean side with only two survivors, and the
    # min_rows gate still rejects weak two-row candidates.
    column_min_dots: int = 2
    column_x_range: tuple = (0.08, 0.92)
    pair_min_gap: float = 0.02
    pair_y_tolerance: float = 0.0015
    min_rows: int = 3
    row_split_ratio: float = 1.8
    row_split_min_gap: float = 0.025
    min_items: int = 3
    max_item_mismatch: int = 1
    min_text_ratio: float = 0.75
    min_paired_ratio: float = 0.50
    min_score: float = 0.62
    min_text_length: int = 2
    column_dedupe_tolerance: float = 0.004


THRESHOLDS = DetectionThresholds()


@dataclass(frozen=True)
class _Dot:
    x: float
    y: float
    bbox: BBox


@dataclass
class _DotColumn:
    x: float
    dots: list[_Dot] = field(default_factory=list)

    def sorted_by_y(self) -> list[_Dot]:
        return sorted(self.dots, key=lambda dot: dot.y)


@dataclass
class _Row:
    y: float
    left_dot: _Dot | None
    right_dot: _Dot | None


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


def _dot_candidates(
    binary,
    image_width: int,
    image_height: int,
) -> list[_Dot]:
    """Isolated small filled blobs that could be printed connection anchors.

    A real anchor sits alone in the whitespace between the two item columns.
    Glyph punctuation (``?``/``!`` bottom dots, i-dots) always has ink from
    its own letter within the isolation margin and is rejected here.
    """
    min_diameter = THRESHOLDS.dot_min_diameter * min(image_width, image_height)
    max_diameter = THRESHOLDS.dot_max_diameter * min(image_width, image_height)
    margin = round(THRESHOLDS.dot_isolation_margin * min(image_width, image_height))
    n, _, stats, cents = cv2.connectedComponentsWithStats(binary, 8)
    dots: list[_Dot] = []
    for index in range(1, n):
        x, y, width, height, area = stats[index]
        if not (min_diameter <= width <= max_diameter):
            continue
        if not (min_diameter <= height <= max_diameter):
            continue
        if area < THRESHOLDS.dot_min_area:
            continue
        if area / (width * height) < THRESHOLDS.dot_min_fill:
            continue
        region_x0 = max(0, x - margin)
        region_y0 = max(0, y - margin)
        region = binary[
            region_y0:min(image_height, y + height + margin),
            region_x0:min(image_width, x + width + margin),
        ].copy()
        region[
            y - region_y0:y - region_y0 + height,
            x - region_x0:x - region_x0 + width,
        ] = 0
        if region.sum() > 0:
            continue
        cx, cy = cents[index]
        dots.append(
            _Dot(
                x=cx / image_width,
                y=cy / image_height,
                bbox=_normalized_bbox(
                    x, y, x + width, y + height, image_width, image_height
                ),
            )
        )
    return dots


def _dot_columns(dots: list[_Dot], image_width: int) -> list[_DotColumn]:
    """Tight vertical x-columns of at least three dots.

    A matching exercise prints its anchor dots on two perfectly aligned
    vertical lines, one per side. Letter fragments and punctuation (periods,
    i-dots) scatter horizontally; a tight x-spread requirement rejects them.
    """
    tolerance = THRESHOLDS.column_x_tolerance * image_width
    sorted_dots = sorted(dots, key=lambda dot: dot.x)
    clusters: list[list[_Dot]] = []
    for dot in sorted_dots:
        if clusters and (dot.x - clusters[-1][-1].x) * image_width <= tolerance:
            clusters[-1].append(dot)
        else:
            clusters.append([dot])
    columns: list[_DotColumn] = []
    for cluster in clusters:
        if len(cluster) < THRESHOLDS.column_min_dots:
            continue
        xs = [dot.x for dot in cluster]
        x_min, x_max = min(xs), max(xs)
        if x_max - x_min > THRESHOLDS.column_max_spread:
            continue
        center = x_min + (x_max - x_min) / 2
        if not (THRESHOLDS.column_x_range[0] <= center <= THRESHOLDS.column_x_range[1]):
            continue
        columns.append(_DotColumn(x=center, dots=cluster))
    return sorted(columns, key=lambda column: column.x)


def _pair_rows(left: _DotColumn, right: _DotColumn) -> list[_Row]:
    """Rows from the union of both columns' dots, ordered by y.

    Paired rows carry both anchors; rows where one anchor is missing (OCR or
    print variance) keep the surviving anchor and are validated later by text
    evidence. The y tolerance is tight because both anchors of a printed row
    share the same print band; printed number periods and letter fragments
    never align with their row anchors that closely.
    """
    tolerance = THRESHOLDS.pair_y_tolerance
    left_dots = left.sorted_by_y()
    right_dots = right.sorted_by_y()
    rows: list[_Row] = []
    used_right: set[int] = set()
    for ldot in left_dots:
        nearest: tuple[float, int] | None = None
        for index, rdot in enumerate(right_dots):
            if index in used_right:
                continue
            diff = abs(ldot.y - rdot.y)
            if diff > tolerance:
                continue
            if nearest is None or diff < nearest[0]:
                nearest = (diff, index)
        if nearest is None:
            rows.append(_Row(y=ldot.y, left_dot=ldot, right_dot=None))
            continue
        rdot = right_dots[nearest[1]]
        used_right.add(nearest[1])
        rows.append(
            _Row(
                y=(ldot.y + rdot.y) / 2,
                left_dot=ldot,
                right_dot=rdot,
            )
        )
    for index, rdot in enumerate(right_dots):
        if index not in used_right:
            rows.append(_Row(y=rdot.y, left_dot=None, right_dot=rdot))
    rows.sort(key=lambda row: row.y)
    return rows


def _split_row_groups(rows: list[_Row]) -> list[list[_Row]]:
    """Split a column pair's rows into separate exercises.

    Exercises stacked on the same page share their anchor columns but are
    separated by a title line: the gap between the last row of one exercise
    and the first row of the next is far larger than the intra-exercise row
    spacing.
    """
    if len(rows) < THRESHOLDS.min_rows:
        return [rows] if rows else []
    gaps = [
        rows[i].y - rows[i - 1].y
        for i in range(1, len(rows))
        if rows[i].y - rows[i - 1].y > 0
    ]
    if not gaps:
        return [rows]
    reference = median(gaps)
    split_gap = max(
        THRESHOLDS.row_split_ratio * reference,
        THRESHOLDS.row_split_min_gap,
    )
    groups: list[list[_Row]] = []
    current: list[_Row] = [rows[0]]
    for row in rows[1:]:
        gap = row.y - current[-1].y
        if gap >= split_gap:
            groups.append(current)
            current = [row]
        else:
            current.append(row)
    groups.append(current)
    return groups


def _span_center_x(span: TextSpan) -> float:
    return span.bbox.x + span.bbox.width / 2


def _span_center_y(span: TextSpan) -> float:
    return span.bbox.y + span.bbox.height / 2


def _band_edges(rows: list[_Row], index: int) -> tuple[float, float]:
    gaps = [
        rows[i].y - rows[i - 1].y
        for i in range(1, len(rows))
        if rows[i].y - rows[i - 1].y > 0
    ]
    reference = median(gaps) if gaps else 0.0
    top = (
        rows[index - 1].y + (rows[index].y - rows[index - 1].y) / 2
        if index > 0
        else rows[index].y - reference / 2
    )
    bottom = (
        rows[index + 1].y - (rows[index + 1].y - rows[index].y) / 2
        if index < len(rows) - 1
        else rows[index].y + reference / 2
    )
    return top, bottom


def _left_label(spans: list[TextSpan]) -> tuple[str, list[TextSpan]]:
    """Printed numeric label of a left item, if present.

    Prefers a standalone digit span (``1`` or ``1.``); falls back to a digit
    OCR glued at the start or end of the item's text. Labels are supportive
    metadata, never matchable content.
    """
    for span in spans:
        if LEFT_DIGIT_PATTERN.match(span.text.strip()):
            label = re.sub(r"\.$", "", span.text.strip())
            return label, [s for s in spans if s is not span]
    ordered = sorted(spans, key=lambda s: (s.bbox.y, s.bbox.x))
    if not ordered:
        return "", spans
    first = ordered[0]
    leading = LEADING_DIGIT_PATTERN.match(first.text.strip())
    if leading:
        label = leading.group(1)
        remainder = first.text.strip()[leading.end():]
        if remainder:
            first = first.model_copy(update={"text": remainder})
            rest = [first, *ordered[1:]]
        else:
            rest = ordered[1:]
        return label, rest
    last = ordered[-1]
    trailing = TRAILING_DIGIT_PATTERN.search(last.text.strip())
    if trailing:
        label = trailing.group(1)
        remainder = last.text.strip()[: trailing.start()]
        if remainder:
            last = last.model_copy(update={"text": remainder})
            rest = [*ordered[:-1], last]
        else:
            rest = ordered[:-1]
        return label, rest
    return "", spans


def _right_label(spans: list[TextSpan]) -> tuple[str, list[TextSpan]]:
    """Printed alphabetic label of a right item, if present.

    Prefers a standalone single uppercase letter span (``A``); falls back to
    the first character of a glued item (``ABei der...`` -> label ``A``).
    Ordinary words starting with an uppercase letter (``Anna``, ``Diese``)
    are never mistaken for labels: a label requires the second character to
    be uppercase, a space, or the end of the text.
    """
    for span in spans:
        if RIGHT_LETTER_PATTERN.match(span.text.strip()):
            rest = [s for s in spans if s is not span]
            return span.text.strip(), rest
    ordered = sorted(spans, key=lambda s: (s.bbox.y, s.bbox.x))
    if not ordered:
        return "", spans
    first = ordered[0]
    stripped = NON_ALNUM_PREFIX.sub("", first.text)
    if not stripped:
        return "", spans
    second = stripped[1] if len(stripped) > 1 else ""
    if stripped[0].isupper() and (second == "" or second == " " or second.isupper()):
        label = stripped[0]
        remainder = stripped[1:].strip()
        if remainder:
            first = first.model_copy(update={"text": remainder})
            rest = [first, *ordered[1:]]
        else:
            rest = ordered[1:]
        return label, rest
    return "", spans


def _item(
    spans: list[TextSpan],
    label: str,
    anchor: _Dot | None,
) -> MatchingItem | None:
    """Assemble one matching item from its text spans in reading order."""
    text_parts: list[str] = []
    span_ids: list[str] = []
    left, top, right, bottom = None, None, None, None
    for span in sorted(spans, key=lambda s: (s.bbox.y, s.bbox.x)):
        text = span.text.strip()
        if len(text) < THRESHOLDS.min_text_length:
            continue
        text_parts.append(text)
        span_ids.append(span.id)
        bbox = span.bbox
        if left is None:
            left, top, right, bottom = (
                bbox.x, bbox.y, bbox.x + bbox.width, bbox.y + bbox.height,
            )
        else:
            left = min(left, bbox.x)
            top = min(top, bbox.y)
            right = max(right, bbox.x + bbox.width)
            bottom = max(bottom, bbox.y + bbox.height)
    if left is None:
        return None
    return MatchingItem(
        id="pending",
        label=label,
        text=" ".join(text_parts),
        bbox=BBox(x=left, y=top, width=right - left, height=bottom - top),
        anchorBbox=anchor.bbox if anchor is not None else None,
        nearbyTextSpanIds=span_ids,
    )


def _union_bbox(boxes: list[BBox]) -> BBox:
    left = min(box.x for box in boxes)
    top = min(box.y for box in boxes)
    right = max(box.x + box.width for box in boxes)
    bottom = max(box.y + box.height for box in boxes)
    return BBox(x=left, y=top, width=right - left, height=bottom - top)


def _row_text_spans(
    rows: list[_Row],
    index: int,
    spans: list[TextSpan],
    x_left: float,
    x_right: float,
) -> tuple[list[TextSpan], list[TextSpan]]:
    """Text spans on each side of a row's band.

    Spans whose center falls between the two anchor columns are the label
    zone and belong to neither side. Low-confidence OCR garbage (printed
    dot glyphs OCR cannot classify) is dropped here.
    """
    top, bottom = _band_edges(rows, index)
    left_spans: list[TextSpan] = []
    right_spans: list[TextSpan] = []
    for span in spans:
        if span.confidence < MIN_SPAN_CONFIDENCE:
            continue
        cy = _span_center_y(span)
        if not (top <= cy <= bottom):
            continue
        cx = _span_center_x(span)
        if cx < x_left:
            left_spans.append(span)
        elif cx > x_right:
            right_spans.append(span)
    return left_spans, right_spans


def _candidate_score(
    rows: list[_Row],
    left_items: list[MatchingItem],
    right_items: list[MatchingItem],
    text_ratio: float,
) -> float:
    paired = sum(
        1 for row in rows
        if row.left_dot is not None and row.right_dot is not None
    )
    paired_ratio = paired / len(rows)
    max_count = max(len(left_items), len(right_items))
    symmetry = 1 - abs(len(left_items) - len(right_items)) / max_count
    labels = sum(1 for item in left_items if item.label) + sum(
        1 for item in right_items if item.label
    )
    label_ratio = labels / (len(left_items) + len(right_items))
    return round(
        0.40 * paired_ratio
        + 0.30 * text_ratio
        + 0.15 * symmetry
        + 0.15 * label_ratio,
        4,
    )


def _assemble_exercise(
    group: list[_Row],
    spans: list[TextSpan],
    x_left: float,
    x_right: float,
) -> tuple[float, list[_Row], list[MatchingItem], list[MatchingItem]] | None:
    """Build items for one row group, or None when evidence is insufficient."""
    left_items: list[MatchingItem] = []
    right_items: list[MatchingItem] = []
    valid_rows: list[_Row] = []
    for index, row in enumerate(group):
        left_spans, right_spans = _row_text_spans(
            group, index, spans, x_left, x_right
        )
        left_label, left_rest = _left_label(left_spans)
        right_label, right_rest = _right_label(right_spans)
        left_item = _item(left_rest, left_label, row.left_dot)
        right_item = _item(right_rest, right_label, row.right_dot)
        if left_item is None or right_item is None:
            continue
        left_items.append(left_item)
        right_items.append(right_item)
        valid_rows.append(row)
    if len(valid_rows) < THRESHOLDS.min_rows:
        return None
    if len(left_items) < THRESHOLDS.min_items:
        return None
    if len(right_items) < THRESHOLDS.min_items:
        return None
    if abs(len(left_items) - len(right_items)) > THRESHOLDS.max_item_mismatch:
        return None
    text_ratio = len(valid_rows) / len(group)
    if text_ratio < THRESHOLDS.min_text_ratio:
        return None
    paired = sum(
        1 for row in valid_rows
        if row.left_dot is not None and row.right_dot is not None
    )
    if paired / len(valid_rows) < THRESHOLDS.min_paired_ratio:
        return None
    score = _candidate_score(valid_rows, left_items, right_items, text_ratio)
    if score < THRESHOLDS.min_score:
        return None
    return score, valid_rows, left_items, right_items


def detect_matchings(
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
        "Matching detection started page=%s image=%s",
        analysis.pageNumber,
        image_path,
    )
    if image.ndim == 2:
        gray = image
    elif image.shape[2] == 4:
        gray = cv2.cvtColor(image, cv2.COLOR_BGRA2GRAY)
    else:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 160, 255, cv2.THRESH_BINARY_INV)

    dots = _dot_candidates(binary, image_width, image_height)
    columns = _dot_columns(dots, image_width)

    candidates: list[
        tuple[float, float, float, list[_Row], list[MatchingItem], list[MatchingItem]]
    ] = []
    raw_pairs = 0
    for left_index, left_column in enumerate(columns):
        for right_column in columns[left_index + 1:]:
            if right_column.x - left_column.x < THRESHOLDS.pair_min_gap:
                continue
            raw_pairs += 1
            rows = _pair_rows(left_column, right_column)
            for group in _split_row_groups(rows):
                assembled = _assemble_exercise(
                    group, analysis.textSpans, left_column.x, right_column.x
                )
                if assembled is None:
                    continue
                score, valid_rows, left_items, right_items = assembled
                candidates.append(
                    (score, left_column.x, right_column.x, valid_rows, left_items, right_items)
                )

    candidates.sort(
        key=lambda candidate: (candidate[0], len(candidate[3])),
        reverse=True,
    )
    accepted: list[
        tuple[float, float, float, list[_Row], list[MatchingItem], list[MatchingItem]]
    ] = []
    for score, x_left, x_right, rows, left_items, right_items in candidates:
        conflicts = False
        for _, acc_left, acc_right, acc_rows, _, _ in accepted:
            same_columns = (
                abs(x_left - acc_left) <= THRESHOLDS.column_dedupe_tolerance
                and abs(x_right - acc_right) <= THRESHOLDS.column_dedupe_tolerance
            )
            if not same_columns:
                continue
            for row in rows:
                for acc_row in acc_rows:
                    if abs(row.y - acc_row.y) <= THRESHOLDS.pair_y_tolerance:
                        conflicts = True
                        break
                if conflicts:
                    break
            if conflicts:
                break
        if conflicts:
            continue
        accepted.append((score, x_left, x_right, rows, left_items, right_items))

    interactions: list[MatchingInteraction] = []
    for exercise_index, (score, _, _, rows, left_items, right_items) in enumerate(
        accepted, start=1
    ):
        interaction_id = f"matching-{analysis.pageNumber}-{exercise_index}"
        left_items.sort(key=lambda item: item.bbox.y)
        right_items.sort(key=lambda item: item.bbox.y)
        for side, items in (("left", left_items), ("right", right_items)):
            for item_index, item in enumerate(items, start=1):
                item.id = f"{interaction_id}-{side}-{item_index}"
        all_boxes = [item.bbox for item in left_items + right_items]
        for item in left_items + right_items:
            if item.anchorBbox is not None:
                all_boxes.append(item.anchorBbox)
        span_ids: list[str] = []
        for item in left_items + right_items:
            for span_id in item.nearbyTextSpanIds:
                if span_id not in span_ids:
                    span_ids.append(span_id)
        interactions.append(
            MatchingInteraction(
                id=interaction_id,
                bbox=_union_bbox(all_boxes),
                candidateScore=score,
                cardinality="one-to-one",
                nearbyTextSpanIds=span_ids,
                leftItems=left_items,
                rightItems=right_items,
            )
        )

    elapsed_ms = int((time.monotonic() - started) * 1000)
    result = analysis.model_copy(
        update={
            "matchingInteractions": interactions,
            "matchingDetection": MatchingDetectionMetadata(
                detectionMethod=DETECTION_METHOD,
                rawCandidateCount=raw_pairs,
                acceptedCount=len(interactions),
                groupCount=len(accepted),
                durationMs=elapsed_ms,
            ),
        }
    )
    logger.info(
        "Matching detection completed page=%s pairs=%s accepted=%s duration_ms=%s",
        analysis.pageNumber,
        raw_pairs,
        len(interactions),
        elapsed_ms,
    )
    return result
