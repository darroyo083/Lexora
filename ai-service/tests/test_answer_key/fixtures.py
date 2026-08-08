from app.answer_key.parser import AnswerKeyEntry


def make_span(
    span_id: str,
    text: str,
    confidence: float = 0.995,
    x: float = 0.1,
    y: float = 0.1,
    parent_line_id: str | None = None,
) -> dict:
    return {
        "id": span_id,
        "text": text,
        "confidence": confidence,
        "confidenceScope": "line",
        "parentLineId": parent_line_id,
        "bbox": {
            "x": x,
            "y": y,
            "width": 0.3,
            "height": 0.015,
        },
    }


CORRECT_EXPECTED: list[AnswerKeyEntry] = [
    AnswerKeyEntry(
        pageNumber=42,
        exerciseNumber="12",
        interactionKind="FillBlank",
        ordinal=1,
        expectedValue="der Hund",
        alternatives=[],
    ),
    AnswerKeyEntry(
        pageNumber=42,
        exerciseNumber="12",
        interactionKind="FillBlank",
        ordinal=2,
        expectedValue="die Katze",
        alternatives=["der Kater"],
    ),
    AnswerKeyEntry(
        pageNumber=42,
        exerciseNumber="13",
        interactionKind="FillBlank",
        ordinal=1,
        expectedValue="1B — 2A — 3D — 4C",
        alternatives=[],
    ),
]
