"""Deterministic normalization for provider-produced choice targets."""

from collections import defaultdict

from app.schemas.page_analysis import BBox, ChoiceTarget, PageAnalysis


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
        normalized.extend(_merge(cluster) for cluster in clusters)

    normalized.sort(key=lambda target: (
        target.interactionBbox.y,
        target.interactionBbox.x,
        target.id,
    ))
    detection = analysis.choiceDetection
    if detection is not None:
        detection = detection.model_copy(update={"acceptedCount": len(normalized)})
    return analysis.model_copy(update={
        "choiceTargets": normalized,
        "choiceDetection": detection,
    })
