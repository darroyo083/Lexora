from app.answer_key.parser import AnswerKeyEntry, AnswerKeyParser


class StubAnswerKeyParser(AnswerKeyParser):
    def publisher(self) -> str:
        return "stub"

    def parse(self, text_spans: list[dict]) -> list[AnswerKeyEntry]:
        return [
            AnswerKeyEntry(
                pageNumber=1,
                exerciseNumber="1.1",
                interactionKind="FillBlank",
                ordinal=1,
                expectedValue="Beispielantwort",
                confidence=0.5,
                mappingWarnings=["stub parser — not a real implementation"],
            ),
        ]
