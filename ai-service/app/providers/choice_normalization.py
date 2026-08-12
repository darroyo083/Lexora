"""Deterministic normalization for provider-produced choice targets."""

from collections import defaultdict

from app.schemas.page_analysis import (
    BBox,
    ChoiceGrid,
    ChoiceGridCell,
    ChoiceGridDetectionMetadata,
    ChoiceGridRow,
    ChoiceTarget,
    PageAnalysis,
)


def _union(boxes: list[BBox]) -> BBox:
    left = min(box.x for box in boxes)
    top = min(box.y for box in boxes)
    right = max(box.x + box.width for box in boxes)
    bottom = max(box.y + box.height for box in boxes)
    return BBox(x=left, y=top, width=right - left, height=bottom - top)


def _same_row(left: ChoiceTarget, right: ChoiceTarget) -> bool:
    left_center = left.targetBbox.y + left.targetBbox.height / 2
    right_center = right.targetBbox.y + right.targetBbox.height / 2
    tolerance = max(left.targetBbox.height, right.targetBbox.height) * 0.75
    return abs(left_center - right_center) <= tolerance


def _merge(cluster: list[ChoiceTarget]) -> ChoiceTarget:
    first = cluster[0]
    nearby_ids = list(dict.fromkeys(
        span_id for target in cluster for span_id in target.nearbyTextSpanIds
    ))
    return first.model_copy(update={
        "targetBbox": _union([target.targetBbox for target in cluster]),
        "interactionBbox": _union([target.interactionBbox for target in cluster]),
        "candidateScore": min(target.candidateScore for target in cluster),
        "nearbyTextSpanIds": nearby_ids,
    })


def normalize_choice_targets(analysis: PageAnalysis) -> PageAnalysis:
    """Collapse radio circles from one prompt into one semantic interaction.

    Vision models often emit one target per visible ring even though all rings
    on a row share one option group and represent one question. Targets on
    different rows remain independent.
    """

    grouped: dict[str, list[ChoiceTarget]] = defaultdict(list)
    passthrough: list[ChoiceTarget] = []
    for target in analysis.choiceTargets:
        if target.optionGroupId is None:
            passthrough.append(target)
        else:
            grouped[target.optionGroupId].append(target)

    normalized = list(passthrough)
    merged_ids: dict[str, str] = {}
    for targets in grouped.values():
        ordered = sorted(
            targets,
            key=lambda target: (target.targetBbox.y, target.targetBbox.x),
        )
        clusters: list[list[ChoiceTarget]] = []
        for target in ordered:
            if clusters and _same_row(clusters[-1][-1], target):
                clusters[-1].append(target)
            else:
                clusters.append([target])
        for cluster in clusters:
            merged = _merge(cluster)
            normalized.append(merged)
            for target in cluster:
                merged_ids[target.id] = merged.id

    normalized.sort(key=lambda target: (
        target.interactionBbox.y,
        target.interactionBbox.x,
        target.id,
    ))
    detection = analysis.choiceDetection
    if detection is not None:
        detection = detection.model_copy(update={"acceptedCount": len(normalized)})
    semantic_exercises = [exercise.model_copy(update={
        "interactionIds": list(dict.fromkeys(
            merged_ids.get(interaction_id, interaction_id)
            for interaction_id in exercise.interactionIds
        )),
    }) for exercise in analysis.semanticExercises]

    targets_by_id = {target.id: target for target in normalized}
    groups_by_id = {group.id: group for group in analysis.choiceGroups}
    promoted_target_ids: set[str] = set()
    promoted_grids: list[ChoiceGrid] = []
    promoted_semantics = []
    for exercise in semantic_exercises:
        targets = [
            targets_by_id[interaction_id]
            for interaction_id in exercise.interactionIds
            if interaction_id in targets_by_id
        ]
        group_ids = {target.optionGroupId for target in targets}
        group_id = next(iter(group_ids)) if len(group_ids) == 1 else None
        group = groups_by_id.get(group_id) if group_id is not None else None
        if exercise.kind != "choice-grid" or len(targets) < 2 or group is None:
            promoted_semantics.append(exercise)
            continue
        rows = []
        for target in targets:
            cell_width = target.targetBbox.width / len(group.options)
            cells = [ChoiceGridCell(
                id=f"{target.id}-cell-{option.id}",
                optionId=option.id,
                cellBbox=target.targetBbox.model_copy(update={
                    "x": target.targetBbox.x + index * cell_width,
                    "width": cell_width,
                }),
                interactionBbox=target.interactionBbox,
            ) for index, option in enumerate(group.options)]
            rows.append(ChoiceGridRow(
                id=f"{target.id}-row",
                rowBbox=target.interactionBbox,
                nearbyTextSpanIds=target.nearbyTextSpanIds,
                cells=cells,
            ))
        grid = ChoiceGrid(
            id=f"{exercise.id}-grid",
            gridBbox=_union([target.interactionBbox for target in targets]),
            optionGroupId=group.id,
            detectionMethod="vision-structured-v1",
            candidateScore=min(target.candidateScore for target in targets),
            rows=rows,
        )
        promoted_grids.append(grid)
        promoted_target_ids.update(target.id for target in targets)
        promoted_semantics.append(exercise.model_copy(update={"interactionIds": [grid.id]}))

    normalized = [target for target in normalized if target.id not in promoted_target_ids]
    if detection is not None:
        detection = detection.model_copy(update={"acceptedCount": len(normalized)})
    grids = [*analysis.choiceGrids, *promoted_grids]
    grid_detection = analysis.choiceGridDetection
    if promoted_grids:
        grid_detection = ChoiceGridDetectionMetadata(
            detectionMethod="vision-structured-v1",
            rawCandidateCount=sum(len(grid.rows) for grid in promoted_grids),
            acceptedCount=len(promoted_grids),
            groupCount=len(promoted_grids),
            durationMs=0,
        )
    return analysis.model_copy(update={
        "choiceTargets": normalized,
        "choiceDetection": detection,
        "choiceGrids": grids,
        "choiceGridDetection": grid_detection,
        "semanticExercises": promoted_semantics,
    })
