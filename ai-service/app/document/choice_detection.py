import logging
import re
import time
from dataclasses import dataclass
from statistics import median

import cv2

from app.document.blank_detection import _has_light_surroundings, _nearby_spans
from app.document.normalization import normalize_bbox
from app.schemas.page_analysis import (
    BBox,
    ChoiceDetectionMetadata,
    ChoiceGroup,
    ChoiceOption,
    ChoiceTarget,
    PageAnalysis,
)


logger = logging.getLogger("uvicorn.error")
DETECTION_METHOD = "empty-ring-v1"


@dataclass(frozen=True)
class DetectionThresholds:
    adaptive_block_width: float = 0.022
    adaptive_constant: int = 15
    min_diameter_ratio: float = 0.012
    max_diameter_ratio: float = 0.045
    min_aspect_ratio: float = 0.72
    max_aspect_ratio: float = 1.38
    min_extent: float = 0.65
    interior_inset: float = 0.25
    max_interior_ink_fraction: float = 0.05
    surrounding_margin: float = 0.004
    light_pixel_threshold: int = 235
    min_surrounding_light_fraction: float = 0.82
    min_text_relative_diameter: float = 0.9
    max_text_relative_diameter: float = 3.0
    interaction_scale: float = 1.6
    score_target_diameter: float = 0.028
    score_target_extent: float = 0.78
    score_target_text_relative: float = 1.25
    score_target_evidence_count: int = 2
    row_cluster_gap: float = 0.012
    block_cluster_gap: float = 0.12
    legend_max_distance: float = 0.12
    legend_row_gap: float = 0.04
    min_legend_options: int = 2


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


def _interior_ink_fraction(
    binary,
    x: int,
    y: int,
    width: int,
    height: int,
) -> float:
    inset_x = max(1, round(width * THRESHOLDS.interior_inset))
    inset_y = max(1, round(height * THRESHOLDS.interior_inset))
    inner = binary[
        y + inset_y : y + height - inset_y,
        x + inset_x : x + width - inset_x,
    ]
    if inner.size == 0:
        return 1.0
    return float((inner > 0).mean())


def _candidate_score(
    diameter: int,
    extent: float,
    text_relative: float,
    nearby_count: int,
    image_width: int,
) -> float:
    diameter_score = min(
        diameter / (image_width * THRESHOLDS.score_target_diameter), 1.0
    )
    extent_score = min(extent / THRESHOLDS.score_target_extent, 1.0)
    text_relative_score = min(
        text_relative / THRESHOLDS.score_target_text_relative, 1.0
    )
    evidence_score = min(
        nearby_count / THRESHOLDS.score_target_evidence_count, 1.0
    )
    return round(
        0.35 * diameter_score
        + 0.30 * extent_score
        + 0.20 * text_relative_score
        + 0.15 * evidence_score,
        4,
    )


def _ring_candidates(
    gray,
    binary,
    analysis: PageAnalysis,
) -> list[tuple[int, int, int, int, float]]:
    """Hollow circle candidates: outer contours with a hole and circle-like shape.

    Returns (x, y, width, height, extent) tuples in pixel coordinates.
    """
    image_height, image_width = gray.shape[:2]
    contours, hierarchy = cv2.findContours(
        binary, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE
    )
    if hierarchy is None:
        return []
    hier = hierarchy[0]

    candidates: list[tuple[int, int, int, int, float]] = []
    for index, contour in enumerate(contours):
        if hier[index][2] == -1:
            continue
        x, y, width, height = cv2.boundingRect(contour)
        if width < 4 or height < 4:
            continue
        aspect = width / max(height, 1)
        if not (
            THRESHOLDS.min_aspect_ratio
            <= aspect
            <= THRESHOLDS.max_aspect_ratio
        ):
            continue
        diameter = max(width, height)
        diameter_ratio = diameter / image_width
        if not (
            THRESHOLDS.min_diameter_ratio
            <= diameter_ratio
            <= THRESHOLDS.max_diameter_ratio
        ):
            continue
        extent = cv2.contourArea(contour) / max(width * height, 1)
        if extent < THRESHOLDS.min_extent:
            continue
        candidates.append((x, y, width, height, extent))
    return candidates


def _text_relative_diameter(
    diameter: int,
    nearby: list,
    image_height: int,
) -> float:
    if not nearby:
        return 0.0
    heights = [span.bbox.height * image_height for span in nearby]
    return diameter / max(median(heights), 1)


def _text_context_spans(
    nearby: list,
    diameter: int,
    image_height: int,
) -> list:
    """Drop OCR spans that are themselves larger than the ring.

    OCR sometimes echoes a printed ring as a glyph like ``O`` whose box
    matches the ring. Such an echo is the ring itself, not text context,
    and would skew the text-relative size metric.
    """
    return [
        span
        for span in nearby
        if span.bbox.height * image_height <= diameter * 1.1
    ]


def _interaction_bbox(
    x: int,
    y: int,
    width: int,
    height: int,
    nearby: list,
    image_height: int,
    image_width: int,
) -> BBox:
    diameter = max(width, height)
    if nearby:
        heights = [span.bbox.height * image_height for span in nearby]
        reference = max(diameter, median(heights))
    else:
        reference = diameter
    size = reference * THRESHOLDS.interaction_scale
    center_x = x + (width / 2)
    center_y = y + (height / 2)
    return _normalized_bbox(
        center_x - (size / 2),
        center_y - (size / 2),
        center_x + (size / 2),
        center_y + (size / 2),
        image_width,
        image_height,
    )


def _cluster_target_rows(
    targets: list[ChoiceTarget],
) -> list[list[ChoiceTarget]]:
    ordered = sorted(targets, key=lambda t: (t.targetBbox.y, t.targetBbox.x))
    rows: list[list[ChoiceTarget]] = []
    for target in ordered:
        if rows and (
            target.targetBbox.y - rows[-1][0].targetBbox.y
            <= THRESHOLDS.row_cluster_gap
        ):
            rows[-1].append(target)
        else:
            rows.append([target])
    return rows


def _cluster_blocks(
    rows: list[list[ChoiceTarget]],
) -> list[list[ChoiceTarget]]:
    blocks: list[list[ChoiceTarget]] = []
    for row in rows:
        if blocks:
            previous = blocks[-1][-1].targetBbox.y
            if row[0].targetBbox.y - previous <= THRESHOLDS.block_cluster_gap:
                blocks[-1].extend(row)
                continue
        blocks.append(list(row))
    return blocks


def _extract_option_groups(
    analysis: PageAnalysis,
    targets: list[ChoiceTarget],
) -> tuple[list[ChoiceGroup], dict[str, str]]:
    """Associate target blocks with numbered legends like '1 = ...' above them."""
    groups: list[ChoiceGroup] = []
    assignment: dict[str, str] = {}
    rows = _cluster_target_rows(targets)
    blocks = _cluster_blocks(rows)

    for block_index, block in enumerate(blocks, start=1):
        first_target_y = min(
            target.targetBbox.y for target in block
        )
        legend_rows: list[tuple[float, str]] = []
        for span in analysis.textSpans:
            span_bottom = span.bbox.y + span.bbox.height
            if span_bottom >= first_target_y:
                continue
            if first_target_y - span_bottom > THRESHOLDS.legend_max_distance:
                continue
            match = re.match(r"^(\d{1,3})\s*=\s*\S", span.text)
            if match:
                legend_rows.append((span.bbox.y, match.group(1)))

        legend_rows.sort(key=lambda entry: entry[0])
        clusters: list[list[tuple[float, str]]] = []
        for y, digit in legend_rows:
            if clusters and y - clusters[-1][-1][0] <= THRESHOLDS.legend_row_gap:
                clusters[-1].append((y, digit))
            else:
                clusters.append([(y, digit)])

        chosen: list[tuple[float, str]] | None = None
        for cluster in reversed(clusters):
            digits = {digit for _, digit in cluster}
            if len(digits) >= THRESHOLDS.min_legend_options:
                chosen = cluster
                break
        if chosen is None:
            continue

        group_id = f"choice-group-{analysis.pageNumber}-{block_index}"
        ordered_digits = sorted(
            {digit for _, digit in chosen}, key=int
        )
        options = [
            ChoiceOption(id=f"{group_id}-{digit}", label=digit)
            for digit in ordered_digits
        ]
        groups.append(ChoiceGroup(id=group_id, options=options))
        for target in block:
            assignment[target.id] = group_id
    return groups, assignment


def detect_choice_interactions(
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
        "Choice detection started page=%s image=%s", analysis.pageNumber, image_path
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

    raw_candidates = _ring_candidates(gray, binary, analysis)
    accepted: list[
        tuple[int, int, int, int, float, list, float]
    ] = []
    for x, y, width, height, extent in raw_candidates:
        if not _has_light_surroundings(gray, x, y, width, height):
            continue
        if (
            _interior_ink_fraction(binary, x, y, width, height)
            > THRESHOLDS.max_interior_ink_fraction
        ):
            continue
        nearby = _nearby_spans(x, y, width, height, analysis)
        if not nearby:
            continue
        diameter = max(width, height)
        context = _text_context_spans(nearby, diameter, image_height)
        if not context:
            continue
        text_relative = _text_relative_diameter(
            diameter, context, image_height
        )
        if not (
            THRESHOLDS.min_text_relative_diameter
            <= text_relative
            <= THRESHOLDS.max_text_relative_diameter
        ):
            continue
        accepted.append((x, y, width, height, extent, context, text_relative))

    accepted.sort(key=lambda candidate: (candidate[1], candidate[0]))
    targets: list[ChoiceTarget] = []
    for index, (x, y, width, height, extent, context, text_relative) in enumerate(
        accepted, start=1
    ):
        target_id = f"choice-{analysis.pageNumber}-{index}"
        targets.append(
            ChoiceTarget(
                id=target_id,
                targetBbox=_normalized_bbox(
                    x, y, x + width, y + height, image_width, image_height
                ),
                interactionBbox=_interaction_bbox(
                    x, y, width, height, context, image_height, image_width
                ),
                candidateScore=_candidate_score(
                    max(width, height),
                    extent,
                    text_relative,
                    len(context),
                    image_width,
                ),
                nearbyTextSpanIds=[span.id for span in context],
            )
        )

    groups, assignment = _extract_option_groups(analysis, targets)
    targets_with_groups = [
        target.model_copy(
            update={"optionGroupId": assignment.get(target.id)}
        )
        for target in targets
    ]

    elapsed_ms = int((time.monotonic() - started) * 1000)
    result = analysis.model_copy(
        update={
            "choiceGroups": groups,
            "choiceTargets": targets_with_groups,
            "choiceDetection": ChoiceDetectionMetadata(
                detectionMethod=DETECTION_METHOD,
                rawCandidateCount=len(raw_candidates),
                acceptedCount=len(targets),
                groupCount=len(groups),
                durationMs=elapsed_ms,
            ),
        }
    )
    logger.info(
        "Choice detection completed page=%s raw=%s accepted=%s groups=%s duration_ms=%s",
        analysis.pageNumber,
        len(raw_candidates),
        len(targets),
        len(groups),
        elapsed_ms,
    )
    return result
