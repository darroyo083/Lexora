"""Generate the public demo answer key for the original Lexora workbook."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "backend" / "src" / "main" / "resources" / "demo" / "answer-key.json"


def text_entry(page: int, exercise: str, kind: str, ordinal: int, expected: str) -> dict:
    return {
        "pageNumber": page,
        "exerciseNumber": exercise,
        "interactionKind": kind,
        "ordinal": ordinal,
        "expectedValue": expected,
        "alternatives": [],
        "caseSensitive": False,
        "punctuationRequired": False,
        "normalizationMode": "strict",
        "rawSolutionText": expected,
        "confidence": 1.0,
        "mappingWarnings": [],
        "typedPayload": {"type": "Text", "value": expected, "alternatives": []},
        "unitNumber": page,
        "subExerciseMarker": chr(97 + ordinal),
        "items": [expected],
    }


def reference_entry(page: int, exercise: str, ordinal: int, model_text: str) -> dict:
    entry = text_entry(page, exercise, "FreeText", ordinal, model_text)
    entry["rawSolutionText"] = "Example response written for the Lexora demo"
    entry["typedPayload"] = {
        "type": "Reference",
        "modelText": model_text,
        "sourceHint": "Lexora synthetic workbook",
    }
    return entry


def main() -> None:
    entries = [
        text_entry(1, "1", "FillBlank", 0, "stehe"),
        text_entry(1, "1", "FillBlank", 1, "trinke"),
        text_entry(1, "1", "FillBlank", 2, "fahre"),
        text_entry(1, "2", "Choice", 0, "Um sieben Uhr"),
        text_entry(1, "2", "Choice", 1, "Einen Tee"),
        reference_entry(1, "3", 0, "Am Morgen trinke ich Tee und lerne zehn Minuten Deutsch."),

        text_entry(2, "6", "FillBlank", 0, "Bibliothek"),
        text_entry(2, "4", "Choice", 0, "der"),
        text_entry(2, "4", "Choice", 1, "die"),
        text_entry(2, "4", "Choice", 2, "das"),
        text_entry(2, "4", "Choice", 3, "der"),
        {
            **text_entry(2, "5", "Matching", 0, "1=C;2=D;3=B;4=A"),
            "rawSolutionText": "die Bäckerei=Brot; die Bibliothek=Bücher; der Bahnhof=Züge; die Apotheke=Medikamente",
            "typedPayload": {
                "type": "Matching",
                "pairs": [
                    {"leftLabel": "die Bäckerei", "rightLabel": "Brot"},
                    {"leftLabel": "die Bibliothek", "rightLabel": "Bücher"},
                    {"leftLabel": "der Bahnhof", "rightLabel": "Züge"},
                    {"leftLabel": "die Apotheke", "rightLabel": "Medikamente"},
                ],
            },
        },

        text_entry(3, "9", "FillBlank", 0, "Samstag"),
        text_entry(3, "9", "FillBlank", 1, "15 Uhr"),
        text_entry(3, "9", "FillBlank", 2, "vor dem Kino"),
        text_entry(3, "8", "Choice", 0, "Ja, gern!"),
        text_entry(3, "8", "Choice", 1, "Vor dem Kino."),
        text_entry(3, "7", "SentenceOrdering", 0, "so01-item5,so01-item4,so01-item3,so01-item2,so01-item1"),
        text_entry(3, "7", "SentenceOrdering", 1, "so02-item2,so02-item4,so02-item1,so02-item5,so02-item3"),

        text_entry(4, "10", "FillBlank", 0, "arbeitest"),
        text_entry(4, "10", "FillBlank", 1, "arbeite"),
        text_entry(4, "10", "FillBlank", 2, "treffen"),
        text_entry(4, "12", "FillBlank", 3, "zehn Minuten"),
        text_entry(4, "12", "FillBlank", 4, "neue Wörter"),
        text_entry(4, "12", "FillBlank", 5, "am Samstag"),
        text_entry(4, "11", "Choice", 0, "falsch"),
        text_entry(4, "11", "Choice", 1, "richtig"),
    ]
    OUTPUT.write_text(
        json.dumps(entries, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"{OUTPUT} ({len(entries)} entries)")


if __name__ == "__main__":
    main()
