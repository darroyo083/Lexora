from app.providers.choice_normalization import normalize_choice_targets
from app.schemas.page_analysis import PageAnalysis


def analysis() -> PageAnalysis:
    return PageAnalysis.model_validate({
        "schemaVersion": "0.2.0",
        "pageNumber": 1,
        "width": 1000,
        "height": 1400,
        "language": "de",
        "textSpans": [],
        "exerciseBlanks": [],
        "choiceGroups": [{
            "id": "articles",
            "options": [
                {"id": "der", "label": "der"},
                {"id": "die", "label": "die"},
                {"id": "das", "label": "das"},
            ],
        }],
        "choiceTargets": [
            target("row-1-der", 0.20, 0.40, "span-1"),
            target("row-1-die", 0.35, 0.40, "span-1"),
            target("row-1-das", 0.50, 0.40, "span-1"),
            target("row-2-der", 0.20, 0.48, "span-2"),
            target("row-2-die", 0.35, 0.48, "span-2"),
            target("row-2-das", 0.50, 0.48, "span-2"),
        ],
        "choiceDetection": {
            "detectionMethod": "vision-structured-v1",
            "rawCandidateCount": 6,
            "acceptedCount": 6,
            "groupCount": 1,
            "durationMs": 10,
        },
        "semanticExercises": [{
            "id": "exercise-1",
            "number": "1",
            "title": "Artikel wählen",
            "instruction": "Wähle den Artikel.",
            "kind": "choice",
            "bbox": {"x": 0.1, "y": 0.35, "width": 0.6, "height": 0.2},
            "sourceOrder": 1,
            "interactionIds": [
                "row-1-der", "row-1-die", "row-1-das",
                "row-2-der", "row-2-die", "row-2-das",
            ],
            "contextSpanIds": [],
            "detectionMethod": "vision-semantic-v1",
            "confidence": 0.98,
        }],
        "processor": {
            "engine": "opencode-go-vision",
            "engineVersion": "v1",
            "model": "mimo-v2.5",
            "language": "de",
            "parameters": {},
            "processedAt": "2026-08-11T18:00:00Z",
            "durationMs": 20,
        },
    })


def target(identifier: str, x: float, y: float, span: str) -> dict:
    return {
        "id": identifier,
        "kind": "choice",
        "targetBbox": {"x": x, "y": y, "width": 0.02, "height": 0.02},
        "interactionBbox": {"x": x - 0.01, "y": y - 0.01, "width": 0.04, "height": 0.04},
        "optionGroupId": "articles",
        "detectionMethod": "vision-structured-v1",
        "candidateScore": 0.98,
        "nearbyTextSpanIds": [span],
    }


def test_merges_same_row_radio_targets_but_preserves_separate_questions():
    normalized = normalize_choice_targets(analysis())

    assert [target.id for target in normalized.choiceTargets] == [
        "row-1-der",
        "row-2-der",
    ]
    assert normalized.choiceTargets[0].nearbyTextSpanIds == ["span-1"]
    assert normalized.choiceTargets[0].targetBbox.width == 0.32
    assert normalized.choiceDetection is not None
    assert normalized.choiceDetection.rawCandidateCount == 6
    assert normalized.choiceDetection.acceptedCount == 2
    assert normalized.semanticExercises[0].interactionIds == [
        "row-1-der",
        "row-2-der",
    ]


def test_is_idempotent():
    once = normalize_choice_targets(analysis())
    twice = normalize_choice_targets(once)

    assert twice == once


def test_promotes_semantic_choice_grid_rows_to_explicit_grid():
    source = analysis()
    source.semanticExercises[0].kind = "choice-grid"

    normalized = normalize_choice_targets(source)

    assert normalized.choiceTargets == []
    assert len(normalized.choiceGrids) == 1
    assert len(normalized.choiceGrids[0].rows) == 2
    assert len(normalized.choiceGrids[0].rows[0].cells) == 3
    assert normalized.semanticExercises[0].interactionIds == ["exercise-1-grid"]
    assert normalize_choice_targets(normalized) == normalized
