import logging
import time
from dataclasses import dataclass

import cv2

from app.document.normalization import normalize_bbox
from app.schemas.page_analysis import (
    BBox,
    ChoiceGrid,
    ChoiceGridCell,
    ChoiceGridDetectionMetadata,
    ChoiceGridRow,
    ChoiceGroup,
    ChoiceOption,
    PageAnalysis,
    TextSpan,
)


logger = logging.getLogger("uvicorn.error")
DETECTION_METHOD = "table-grid-v1"


@dataclass(frozen=True)
class DetectionThresholds:
    adaptive_block_width: float = 0.022
    adaptive_constant: int = 15
    horizontal_kernel_width: float = 0.04
    vertical_kernel_height: float = 0.015
    min_rule_width: float = 0.15
    min_rule_height: float = 0.015
    rule_y_cluster: float = 0.004
    rule_x_cluster: float = 0.006
    rule_extent_tolerance: float = 0.04
    max_rule_gap: float = 0.06
    min_grid_rules: int = 3
    min_grid_verticals: int = 2
    min_grid_rows: int = 2
    header_max_distance: float = 0.05
    max_header_token_width: float = 0.09
    header_band_tolerance: float = 0.006
    max_header_y_spread: float = 0.008
    cell_inset: float = 0.0
    max_cell_ink_fraction: float = 0.01
    min_band_height: float = 0.012
    prompt_band_tolerance: float = 0.002
    score_target_rules: int = 4
    score_target_columns: int = 3
    score_target_rows: int = 5


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


def _line_masks(binary, image_width: int, image_height: int):
    """Return (horizontal_mask, vertical_mask) of long straight rules."""
    horizontal_kernel_width = max(
        3, round(image_width * THRESHOLDS.horizontal_kernel_width)
    )
    horizontal_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT, (horizontal_kernel_width, 1)
    )
    horizontal = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horizontal_kernel)
    vertical_kernel_height = max(
        3, round(image_height * THRESHOLDS.vertical_kernel_height)
    )
    vertical_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT, (1, vertical_kernel_height)
    )
    vertical = cv2.morphologyEx(binary, cv2.MORPH_OPEN, vertical_kernel)
    return horizontal, vertical


def _horizontal_rules(
    horizontal_mask,
    image_width: int,
    image_height: int,
) -> list[tuple[float, float, float]]:
    """Detect long horizontal rules. Returns (y_norm, x0_norm, x1_norm)."""
    contours, _ = cv2.findContours(
        horizontal_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    runs = []
    for contour in contours:
        x, y, width, height = cv2.boundingRect(contour)
        if width < image_width * THRESHOLDS.min_rule_width:
            continue
        runs.append(
            (
                (y + height / 2) / image_height,
                x / image_width,
                (x + width) / image_width,
            )
        )
    runs.sort(key=lambda run: run[0])
    clustered: list[tuple[float, float, float]] = []
    for y, x0, x1 in runs:
        if clustered and y - clustered[-1][0] <= THRESHOLDS.rule_y_cluster:
            cy, cx0, cx1 = clustered[-1]
            clustered[-1] = ((cy + y) / 2, min(cx0, x0), max(cx1, x1))
        else:
            clustered.append((y, x0, x1))
    return clustered


def _vertical_rules(
    vertical_mask,
    image_width: int,
    image_height: int,
) -> list[tuple[float, float, float]]:
    """Detect tall vertical rules. Returns (x_norm, y0_norm, y1_norm)."""
    contours, _ = cv2.findContours(
        vertical_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    runs = []
    for contour in contours:
        x, y, width, height = cv2.boundingRect(contour)
        if height < image_height * THRESHOLDS.min_rule_height:
            continue
        runs.append(
            (
                (x + width / 2) / image_width,
                y / image_height,
                (y + height) / image_height,
            )
        )
    runs.sort(key=lambda run: run[0])
    clustered: list[tuple[float, float, float]] = []
    for x, y0, y1 in runs:
        if clustered and x - clustered[-1][0] <= THRESHOLDS.rule_x_cluster:
            cx, cy0, cy1 = clustered[-1]
            clustered[-1] = ((cx + x) / 2, min(cy0, y0), max(cy1, y1))
        else:
            clustered.append((x, y0, y1))
    return clustered


def _cluster_rule_groups(
    rules: list[tuple[float, float, float]],
) -> list[list[tuple[float, float, float]]]:
    """Group horizontal rules into candidate grids by left edge and gap."""
    groups: list[list[tuple[float, float, float]]] = []
    for rule in rules:
        y, x0, x1 = rule
        placed = False
        for group in groups:
            gy0, gx0, _gx1 = group[-1]
            if (
                y - gy0 <= THRESHOLDS.max_rule_gap
                and abs(x0 - gx0) <= THRESHOLDS.rule_extent_tolerance
            ):
                group.append(rule)
                placed = True
                break
        if not placed:
            groups.append([rule])
    return [group for group in groups if len(group) >= THRESHOLDS.min_grid_rules]


def _region_ink_fraction(
    binary,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
) -> float:
    if x1 <= x0 or y1 <= y0:
        return 1.0
    region = binary[y0:y1, x0:x1]
    return float((region > 0).mean())


def _cell_is_empty(
    content_binary,
    cx0: int,
    cx1: int,
    by0: int,
    by1: int,
) -> bool:
    inset_x = max(1, round((cx1 - cx0) * THRESHOLDS.cell_inset))
    inset_y = max(1, round((by1 - by0) * THRESHOLDS.cell_inset))
    ink = _region_ink_fraction(
        content_binary, cx0 + inset_x, by0 + inset_y, cx1 - inset_x, by1 - inset_y
    )
    return ink <= THRESHOLDS.max_cell_ink_fraction


def _span_center_x(span: TextSpan) -> float:
    return span.bbox.x + span.bbox.width / 2


def _span_center_y(span: TextSpan) -> float:
    return span.bbox.y + span.bbox.height / 2


def _find_header_labels(
    analysis: PageAnalysis,
    first_rule_y: float,
    answer_columns: list[tuple[float, float]],
    cells_top: float,
) -> dict[int, TextSpan]:
    """Short OCR tokens above the first rule, aligned with answer columns."""
    labels: dict[int, TextSpan] = {}
    for span in analysis.textSpans:
        span_bottom = span.bbox.y + span.bbox.height
        if span_bottom >= first_rule_y:
            continue
        if first_rule_y - span_bottom > THRESHOLDS.header_max_distance:
            continue
        if span_bottom > cells_top + THRESHOLDS.header_band_tolerance:
            continue
        if span.bbox.width > THRESHOLDS.max_header_token_width:
            continue
        center_x = _span_center_x(span)
        for index, (cx0, cx1) in enumerate(answer_columns):
            if not (cx0 <= center_x <= cx1):
                continue
            current = labels.get(index)
            if current is None or abs(
                center_x - (cx0 + cx1) / 2
            ) < abs(_span_center_x(current) - (cx0 + cx1) / 2):
                labels[index] = span
    return labels


def _find_prompt(
    analysis: PageAnalysis,
    prompt_column: tuple[float, float],
    band_y0: float,
    band_y1: float,
) -> TextSpan | None:
    best: TextSpan | None = None
    for span in analysis.textSpans:
        center_x = _span_center_x(span)
        center_y = _span_center_y(span)
        if not (prompt_column[0] <= center_x <= prompt_column[1]):
            continue
        if not (
            band_y0 - THRESHOLDS.prompt_band_tolerance
            <= center_y
            <= band_y1 + THRESHOLDS.prompt_band_tolerance
        ):
            continue
        if best is None or span.bbox.width > best.bbox.width:
            best = span
    return best


def _candidate_score(
    rule_count: int,
    column_count: int,
    label_count: int,
    row_count: int,
) -> float:
    rules_score = min(
        rule_count / THRESHOLDS.score_target_rules, 1.0
    )
    columns_score = min(
        column_count / THRESHOLDS.score_target_columns, 1.0
    )
    labels_score = label_count / max(1, column_count)
    rows_score = min(row_count / THRESHOLDS.score_target_rows, 1.0)
    return round(
        0.30 * rules_score
        + 0.20 * columns_score
        + 0.30 * labels_score
        + 0.20 * rows_score,
        4,
    )


def _build_grid(
    rules: list[tuple[float, float, float]],
    verticals: list[tuple[float, float, float]],
    binary,
    analysis: PageAnalysis,
    image_width: int,
    image_height: int,
    grid_index: int,
) -> tuple[ChoiceGrid, ChoiceGroup] | None:
    rules = sorted(rules, key=lambda rule: rule[0])
    first_rule_y = rules[0][0]
    extent_x0 = min(rule[1] for rule in rules)
    extent_x1 = max(rule[2] for rule in rules)

    tolerance = THRESHOLDS.rule_extent_tolerance
    rule_y0 = rules[0][0]
    rule_y1 = rules[-1][0]
    vxs = sorted(
        {
            vx
            for vx, vy0, vy1 in verticals
            if extent_x0 - tolerance <= vx <= extent_x1 + tolerance
            and vy1 >= rule_y0 - tolerance
            and vy0 <= rule_y1 + tolerance
        }
    )
    if len(vxs) < THRESHOLDS.min_grid_verticals:
        return None
    matching = [v for v in verticals if v[0] in vxs]
    v_top = min(v[1] for v in matching)
    v_bottom = max(v[2] for v in matching)

    columns = [(extent_x0, vxs[0])] + [
        (vxs[i], vxs[i + 1]) for i in range(len(vxs) - 1)
    ] + [(vxs[-1], extent_x1)]
    prompt_column = columns[0]
    answer_columns = columns[1:]
    if len(answer_columns) < THRESHOLDS.min_grid_verticals:
        return None

    labels = _find_header_labels(
        analysis, first_rule_y, answer_columns, v_top
    )
    if len(labels) < 2:
        return None
    label_ys = [labels[index].bbox.y for index in labels]
    if max(label_ys) - min(label_ys) > THRESHOLDS.max_header_y_spread:
        return None

    group_id = f"grid-group-{analysis.pageNumber}-{grid_index}"
    group = ChoiceGroup(
        id=group_id,
        options=[
            ChoiceOption(id=f"{group_id}-{labels[index].text}", label=labels[index].text)
            for index in sorted(labels)
        ],
    )
    option_by_column = {
        index: f"{group_id}-{labels[index].text}" for index in sorted(labels)
    }

    rule_ys = [rule[0] for rule in rules]
    gaps = [
        rule_ys[i + 1] - rule_ys[i] for i in range(len(rule_ys) - 1)
    ]
    median_gap = sorted(gaps)[len(gaps) // 2] if gaps else 0.02
    band_ys = sorted({
        v_top,
        *rule_ys,
        min(v_bottom, rule_ys[-1] + median_gap * 1.6),
    })
    bands = [
        (band_ys[i], band_ys[i + 1])
        for i in range(len(band_ys) - 1)
        if band_ys[i + 1] - band_ys[i] >= THRESHOLDS.min_band_height
    ]

    grid_rows: list[ChoiceGridRow] = []
    for row_index, (band_y0, band_y1) in enumerate(bands, start=1):
        prompt = _find_prompt(analysis, prompt_column, band_y0, band_y1)
        if prompt is None:
            continue
        cells: list[ChoiceGridCell] = []
        valid = True
        for column_index, (cx0, cx1) in enumerate(answer_columns):
            px0 = round(cx0 * image_width)
            px1 = round(cx1 * image_width)
            py0 = round(band_y0 * image_height)
            py1 = round(band_y1 * image_height)
            option_id = option_by_column.get(column_index)
            if option_id is None:
                continue
            if not _cell_is_empty(binary, px0, px1, py0, py1):
                valid = False
                break
            cell_id = f"choice-grid-{analysis.pageNumber}-{grid_index}-row-{row_index}-cell-{column_index + 1}"
            cells.append(
                ChoiceGridCell(
                    id=cell_id,
                    optionId=option_id,
                    cellBbox=_normalized_bbox(
                        px0, py0, px1, py1, image_width, image_height
                    ),
                    interactionBbox=_normalized_bbox(
                        px0, py0, px1, py1, image_width, image_height
                    ),
                )
            )
        if not valid or len(cells) < 2:
            continue
        row_id = f"choice-grid-{analysis.pageNumber}-{grid_index}-row-{row_index}"
        grid_rows.append(
            ChoiceGridRow(
                id=row_id,
                rowBbox=_normalized_bbox(
                    round(extent_x0 * image_width),
                    py0,
                    round(extent_x1 * image_width),
                    py1,
                    image_width,
                    image_height,
                ),
                promptBbox=prompt.bbox,
                nearbyTextSpanIds=[prompt.id],
                cells=cells,
            )
        )

    if len(grid_rows) < THRESHOLDS.min_grid_rows:
        return None

    grid_id = f"choice-grid-{analysis.pageNumber}-{grid_index}"
    top = min(first_rule_y, v_top, *(labels[i].bbox.y for i in labels))
    return (
        ChoiceGrid(
            id=grid_id,
            gridBbox=_normalized_bbox(
                round(extent_x0 * image_width),
                round(top * image_height),
                round(extent_x1 * image_width),
                round(v_bottom * image_height),
                image_width,
                image_height,
            ),
            optionGroupId=group_id,
            candidateScore=_candidate_score(
                len(rules), len(answer_columns), len(labels), len(grid_rows)
            ),
            rows=grid_rows,
        ),
        group,
    )


def detect_choice_grids(
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
        "Choice grid detection started page=%s image=%s",
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

    raw_rule_count = 0
    horizontal_mask, vertical_mask = _line_masks(
        binary, image_width, image_height
    )
    horizontal_rules = _horizontal_rules(
        horizontal_mask, image_width, image_height
    )
    vertical_rules = _vertical_rules(
        vertical_mask, image_width, image_height
    )
    raw_rule_count = len(horizontal_rules)
    halo_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    line_mask = cv2.bitwise_or(
        cv2.dilate(horizontal_mask, halo_kernel),
        cv2.dilate(vertical_mask, halo_kernel),
    )
    content_binary = cv2.bitwise_and(binary, cv2.bitwise_not(line_mask))

    groups = _cluster_rule_groups(horizontal_rules)

    grids: list[ChoiceGrid] = []
    groups_created: list[ChoiceGroup] = []
    for grid_index, group_rules in enumerate(groups, start=1):
        result = _build_grid(
            group_rules,
            vertical_rules,
            content_binary,
            analysis,
            image_width,
            image_height,
            grid_index,
        )
        if result is None:
            continue
        grid, group = result
        grids.append(grid)
        groups_created.append(group)

    grids.sort(key=lambda grid: grid.gridBbox.y)
    groups_created.sort(key=lambda group: group.id)

    elapsed_ms = int((time.monotonic() - started) * 1000)
    result = analysis.model_copy(
        update={
            "choiceGrids": grids,
            "choiceGroups": [*analysis.choiceGroups, *groups_created],
            "choiceGridDetection": ChoiceGridDetectionMetadata(
                detectionMethod=DETECTION_METHOD,
                rawCandidateCount=raw_rule_count,
                acceptedCount=len(grids),
                groupCount=len(groups_created),
                durationMs=elapsed_ms,
            ),
        }
    )
    logger.info(
        "Choice grid detection completed page=%s raw_rules=%s grids=%s groups=%s duration_ms=%s",
        analysis.pageNumber,
        raw_rule_count,
        len(grids),
        len(groups_created),
        elapsed_ms,
    )
    return result
