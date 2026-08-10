from pathlib import Path

import cv2
import numpy as np
import pytest

from app.document.matching_detection import detect_matchings
from app.schemas.page_analysis import (
    BBox,
    PageAnalysis,
    ProcessorMetadata,
    TextSpan,
)


WIDTH = 2284
HEIGHT = 3121

# Representative synthetic exercise geometry:
# [left text] [digit] [L-dot] [R-dot] [letter] [right text]
LEFT_TEXT_X0 = 0.15
LEFT_TEXT_X1 = 0.44
LEFT_LABEL_X = 0.46
LEFT_DOT_X = 0.49
RIGHT_DOT_X = 0.55
RIGHT_LABEL_X = 0.565
RIGHT_TEXT_X0 = 0.60
RIGHT_TEXT_X1 = 0.82
ROW_YS = [0.20, 0.24, 0.28]


def _analysis(*spans: tuple[str, str, float, float, float, float, float]) -> PageAnalysis:
    return PageAnalysis(
        pageNumber=7,
        width=WIDTH,
        height=HEIGHT,
        language="de",
        textSpans=[
            TextSpan(
                id=span_id,
                text=text,
                confidence=confidence,
                confidenceScope="line",
                bbox=BBox(x=x, y=y, width=width, height=height),
            )
            for span_id, text, confidence, x, y, width, height in spans
        ],
        processor=ProcessorMetadata(
            engine="test",
            engineVersion="1",
            model="test",
            language="de",
            durationMs=1,
        ),
    )


def _span(
    span_id: str,
    text: str,
    x: float,
    y: float,
    width: float,
    height: float = 0.02,
    confidence: float = 0.99,
):
    return (span_id, text, confidence, x, y, width, height)


def _image(tmp_path: Path, dots: list[tuple[float, float]], dot_radius: int = 4, extra_ink=None) -> str:
    """White page with isolated printed anchor dots.

    dots: (x_norm, y_norm) dot centers. extra_ink: optional list of
    (x0, y0, x1, y1) normalized line segments for glyph-like attachments.
    """
    image = np.full((HEIGHT, WIDTH, 3), 255, dtype=np.uint8)
    for x, y in dots:
        cv2.circle(
            image, (round(x * WIDTH), round(y * HEIGHT)), dot_radius, (0, 0, 0), -1
        )
    for x0, y0, x1, y1 in extra_ink or []:
        cv2.line(
            image,
            (round(x0 * WIDTH), round(y0 * HEIGHT)),
            (round(x1 * WIDTH), round(y1 * HEIGHT)),
            (0, 0, 0),
            3,
        )
    path = tmp_path / "page.png"
    assert cv2.imwrite(str(path), image)
    return str(path)


def _exercise_dots(
    left_x: float = LEFT_DOT_X,
    right_x: float = RIGHT_DOT_X,
    rows: list[float] = ROW_YS,
    missing: list[tuple[int, str]] | None = None,
) -> list[tuple[float, float]]:
    dots: list[tuple[float, float]] = []
    for index, y in enumerate(rows):
        for side, x in (("left", left_x), ("right", right_x)):
            if missing and (index, side) in missing:
                continue
            dots.append((x, y))
    return dots


def _matching_analysis(
    left_texts: list[str],
    right_texts: list[str],
    rows: list[float] = ROW_YS,
    left_labels: list[str] | None = None,
    right_labels: list[str] | None = None,
    split_left: dict[int, list[tuple[str, float, float]]] | None = None,
    split_right: dict[int, list[tuple[str, float, float]]] | None = None,
    label_confidences: dict[int, float] | None = None,
) -> PageAnalysis:
    """Full 3x3 matching exercise with labels, plus optional row overrides."""
    left_labels = left_labels if left_labels is not None else [str(i + 1) for i in range(len(rows))]
    right_labels = right_labels if right_labels is not None else [chr(65 + i) for i in range(len(rows))]
    spans: list[tuple] = []
    for index, (y, left, right) in enumerate(zip(rows, left_texts, right_texts)):
        if split_left and index in split_left:
            for part_index, (text, x, width) in enumerate(split_left[index]):
                spans.append(
                    _span(f"span-l{index}-{part_index}", text, x, y, width)
                )
        else:
            spans.append(
                _span(
                    f"span-l{index}", left, LEFT_TEXT_X0, y,
                    LEFT_TEXT_X1 - LEFT_TEXT_X0,
                )
            )
        if left_labels[index]:
            confidence = 0.99
            if label_confidences and index in label_confidences:
                confidence = label_confidences[index]
            spans.append(
                _span(
                    f"span-ln{index}", left_labels[index], LEFT_LABEL_X, y, 0.015,
                    confidence=confidence,
                )
            )
        if split_right and index in split_right:
            for part_index, (text, x, width) in enumerate(split_right[index]):
                spans.append(
                    _span(f"span-r{index}-{part_index}", text, x, y, width)
                )
        else:
            spans.append(
                _span(
                    f"span-r{index}", right, RIGHT_TEXT_X0, y,
                    RIGHT_TEXT_X1 - RIGHT_TEXT_X0,
                )
            )
        if right_labels[index]:
            spans.append(
                _span(
                    f"span-rn{index}", right_labels[index], RIGHT_LABEL_X, y, 0.015
                )
            )
    return _analysis(*spans)


def _detect(tmp_path: Path, analysis: PageAnalysis, dots: list[tuple[float, float]], **kwargs) -> PageAnalysis:
    path = _image(tmp_path, dots, **kwargs)
    return detect_matchings(path, analysis)


# ---------------------------------------------------------------- POSITIVE

def test_basic_3x3_matching_with_labels(tmp_path):
    analysis = _matching_analysis(
        ["Frage eins: Satz eins?", "Frage zwei: Satz zwei?", "Frage drei: Satz drei?"],
        ["Antwort eins: Text eins.", "Antwort zwei: Text zwei.", "Antwort drei: Text drei."],
    )
    result = _detect(tmp_path, analysis, _exercise_dots())

    assert result.matchingDetection.acceptedCount == 1
    exercise = result.matchingInteractions[0]
    assert exercise.kind == "matching"
    assert exercise.cardinality == "one-to-one"
    assert exercise.detectionMethod == "matching-v1"
    assert exercise.id == "matching-7-1"
    assert len(exercise.leftItems) == 3
    assert len(exercise.rightItems) == 3
    assert [item.label for item in exercise.leftItems] == ["1", "2", "3"]
    assert [item.label for item in exercise.rightItems] == ["A", "B", "C"]
    assert exercise.leftItems[0].text == "Frage eins: Satz eins?"
    assert exercise.rightItems[0].text == "Antwort eins: Text eins."
    assert all(item.anchorBbox is not None for item in exercise.leftItems + exercise.rightItems)
    assert exercise.bbox.y <= 0.20
    assert exercise.bbox.y + exercise.bbox.height >= 0.30


def test_anchors_are_small_isolated_dots(tmp_path):
    analysis = _matching_analysis(
        ["Frage eins?", "Frage zwei?", "Frage drei?"],
        ["Antwort eins.", "Antwort zwei.", "Antwort drei."],
    )
    result = _detect(tmp_path, analysis, _exercise_dots())

    assert result.matchingDetection.acceptedCount == 1
    for item in result.matchingInteractions[0].leftItems:
        anchor = item.anchorBbox
        assert anchor is not None
        assert anchor.width < 0.01
        assert abs((anchor.x + anchor.width / 2) - LEFT_DOT_X) < 0.005


def test_multiline_left_item_groups_into_one_item(tmp_path):
    analysis = _matching_analysis(
        ["Einzeilig?", "Zweizeilig?", "Dreizeilig?"],
        ["Eins.", "Zwei.", "Drei."],
        split_left={
            1: [
                ("Zweizeilige Frage", 0.15, 0.20),
                ("mit Fortsetzung", 0.17, 0.221),
            ],
        },
    )
    # row 2 lines at y and y+0.021; row band half-gap 0.02 -> both inside
    result = _detect(tmp_path, analysis, _exercise_dots())

    assert result.matchingDetection.acceptedCount == 1
    exercise = result.matchingInteractions[0]
    assert len(exercise.leftItems) == 3
    assert exercise.leftItems[1].text == "Zweizeilige Frage mit Fortsetzung"
    assert len(exercise.leftItems[1].nearbyTextSpanIds) == 2


def test_multiline_right_item_groups_into_one_item(tmp_path):
    analysis = _matching_analysis(
        ["Frage eins?", "Frage zwei?", "Frage drei?"],
        ["Antwort eins.", "Antwort zwei.", "Antwort drei."],
        split_right={
            2: [
                ("Antwort drei", 0.60, 0.28),
                ("mit Fortsetzung", 0.62, 0.301),
            ],
        },
    )
    result = _detect(tmp_path, analysis, _exercise_dots())

    assert result.matchingDetection.acceptedCount == 1
    exercise = result.matchingInteractions[0]
    assert len(exercise.rightItems) == 3
    assert exercise.rightItems[2].text == "Antwort drei mit Fortsetzung"
    assert len(exercise.rightItems[2].nearbyTextSpanIds) == 2


def test_slight_row_height_differences(tmp_path):
    rows = [0.20, 0.241, 0.279]
    analysis = _matching_analysis(
        ["Frage eins?", "Frage zwei?", "Frage drei?"],
        ["Antwort eins.", "Antwort zwei.", "Antwort drei."],
        rows=rows,
    )
    result = _detect(tmp_path, analysis, _exercise_dots(rows=rows))

    assert result.matchingDetection.acceptedCount == 1
    assert len(result.matchingInteractions[0].leftItems) == 3


def test_uneven_vertical_spacing(tmp_path):
    rows = [0.20, 0.26, 0.29]
    analysis = _matching_analysis(
        ["Frage eins?", "Frage zwei?", "Frage drei?"],
        ["Antwort eins.", "Antwort zwei.", "Antwort drei."],
        rows=rows,
    )
    result = _detect(tmp_path, analysis, _exercise_dots(rows=rows))

    assert result.matchingDetection.acceptedCount == 1
    assert len(result.matchingInteractions[0].rightItems) == 3


def test_small_anchor_detection_variance(tmp_path):
    """Dots jittered by a few pixels still pair and keep the exercise.

    Both anchors of a printed row move together under scan variance, so the
    jitter shifts each row as a unit and only slightly widens the columns.
    """
    rows = [0.20, 0.24, 0.28]
    jitter = [(0.0012, 0.0008), (-0.0010, 0.0012), (0.0015, -0.0006)]
    dots: list[tuple[float, float]] = []
    for index, y in enumerate(rows):
        dx, dy = jitter[index % len(jitter)]
        dots.append((LEFT_DOT_X + dx, y + dy))
        dots.append((RIGHT_DOT_X + dx, y + dy))
    analysis = _matching_analysis(
        ["Frage eins?", "Frage zwei?", "Frage drei?"],
        ["Antwort eins.", "Antwort zwei.", "Antwort drei."],
        rows=rows,
    )
    result = _detect(tmp_path, analysis, dots)

    assert result.matchingDetection.acceptedCount == 1
    assert len(result.matchingInteractions[0].leftItems) == 3


def test_missing_one_anchor_keeps_the_row(tmp_path):
    """One row loses its right anchor; text evidence keeps the row and the
    item simply carries no anchor geometry."""
    dots = _exercise_dots(missing=[(1, "right")])
    analysis = _matching_analysis(
        ["Frage eins?", "Frage zwei?", "Frage drei?"],
        ["Antwort eins.", "Antwort zwei.", "Antwort drei."],
    )
    result = _detect(tmp_path, analysis, dots)

    assert result.matchingDetection.acceptedCount == 1
    exercise = result.matchingInteractions[0]
    assert len(exercise.leftItems) == 3
    assert len(exercise.rightItems) == 3
    assert exercise.rightItems[1].anchorBbox is None
    assert sum(1 for item in exercise.rightItems if item.anchorBbox is not None) == 2


def test_missing_ocr_label_keeps_the_exercise(tmp_path):
    analysis = _matching_analysis(
        ["Frage eins?", "Frage zwei?", "Frage drei?"],
        ["Antwort eins.", "Antwort zwei.", "Antwort drei."],
        left_labels=["", "2", "3"],
    )
    result = _detect(tmp_path, analysis, _exercise_dots())

    assert result.matchingDetection.acceptedCount == 1
    assert result.matchingInteractions[0].leftItems[0].label == ""
    assert result.matchingInteractions[0].leftItems[1].label == "2"


def test_glued_left_label_extracted_from_text(tmp_path):
    """OCR merges the printed number into the question text."""
    analysis = _matching_analysis(
        ["Frage eins?", "Frage zwei?", "Frage drei?"],
        ["Antwort eins.", "Antwort zwei.", "Antwort drei."],
    )
    spans = []
    for index, (y, text) in enumerate(zip(ROW_YS, ["1. Frage eins?", "2. Frage zwei?", "3. Frage drei?"])):
        spans.append(_span(f"span-l{index}", text, LEFT_TEXT_X0, y, LEFT_TEXT_X1 - LEFT_TEXT_X0))
        spans.append(_span(f"span-r{index}", ["Antwort eins.", "Antwort zwei.", "Antwort drei."][index], RIGHT_TEXT_X0, y, RIGHT_TEXT_X1 - RIGHT_TEXT_X0))
        spans.append(_span(f"span-rn{index}", chr(65 + index), RIGHT_LABEL_X, y, 0.015))
    result = _detect(tmp_path, _analysis(*spans), _exercise_dots())

    assert result.matchingDetection.acceptedCount == 1
    exercise = result.matchingInteractions[0]
    assert [item.label for item in exercise.leftItems] == ["1", "2", "3"]
    assert exercise.leftItems[0].text == "Frage eins?"


def test_glued_right_label_extracted_from_text(tmp_path):
    analysis = _matching_analysis(
        ["Frage eins?", "Frage zwei?", "Frage drei?"],
        ["Antwort eins.", "Antwort zwei.", "Antwort drei."],
        right_labels=["", "", ""],
        split_right={
            0: [("AAntwort eins.", 0.60, 0.22)],
            1: [("BAntwort zwei.", 0.60, 0.24)],
            2: [("CAntwort drei.", 0.60, 0.28)],
        },
    )
    result = _detect(tmp_path, analysis, _exercise_dots())

    assert result.matchingDetection.acceptedCount == 1
    exercise = result.matchingInteractions[0]
    assert [item.label for item in exercise.rightItems] == ["A", "B", "C"]
    assert exercise.rightItems[0].text == "Antwort eins."


def test_ordinary_uppercase_word_is_not_a_label(tmp_path):
    analysis = _matching_analysis(
        ["Frage eins?", "Frage zwei?", "Frage drei?"],
        ["Anna.", "Mit Anna.", "In Köln."],
        right_labels=["", "", ""],
    )
    result = _detect(tmp_path, analysis, _exercise_dots())

    assert result.matchingDetection.acceptedCount == 1
    exercise = result.matchingInteractions[0]
    assert [item.label for item in exercise.rightItems] == ["", "", ""]
    assert exercise.rightItems[0].text == "Anna."


def test_two_matching_exercises_on_one_page_at_different_columns(tmp_path):
    """Two exercises stacked vertically with different column geometry are
    detected independently."""
    top_rows = [0.16, 0.20, 0.24]
    bottom_rows = [0.44, 0.48, 0.52]
    dots = _exercise_dots(rows=top_rows) + _exercise_dots(
        left_x=0.62, right_x=0.68, rows=bottom_rows
    )
    spans: list[tuple] = []
    for index, y in enumerate(top_rows):
        spans.append(_span(f"span-t-l{index}", f"Frage 1.{index + 1}", LEFT_TEXT_X0, y, LEFT_TEXT_X1 - LEFT_TEXT_X0))
        spans.append(_span(f"span-t-ln{index}", str(index + 1), LEFT_LABEL_X, y, 0.015))
        spans.append(_span(f"span-t-r{index}", f"Antwort 1.{index + 1}", RIGHT_TEXT_X0, y, RIGHT_TEXT_X1 - RIGHT_TEXT_X0))
        spans.append(_span(f"span-t-rn{index}", chr(65 + index), RIGHT_LABEL_X, y, 0.015))
    for index, y in enumerate(bottom_rows):
        spans.append(_span(f"span-b-l{index}", f"Frage 2.{index + 1}", 0.46, y, 0.14))
        spans.append(_span(f"span-b-ln{index}", str(index + 1), 0.60, y, 0.015))
        spans.append(_span(f"span-b-r{index}", f"Antwort 2.{index + 1}", 0.72, y, 0.16))
        spans.append(_span(f"span-b-rn{index}", chr(65 + index), 0.685, y, 0.015))
    result = _detect(tmp_path, _analysis(*spans), dots)

    assert result.matchingDetection.acceptedCount == 2
    ids = {exercise.id for exercise in result.matchingInteractions}
    assert "matching-7-1" in ids
    assert "matching-7-2" in ids
    assert all(len(exercise.leftItems) == 3 for exercise in result.matchingInteractions)


def test_two_matching_exercises_stacked_on_one_page(tmp_path):
    top_rows = [0.20, 0.24, 0.28]
    bottom_rows = [0.38, 0.42, 0.46]
    dots = _exercise_dots(rows=top_rows) + _exercise_dots(rows=bottom_rows)
    spans: list[tuple] = []
    for group_index, rows in enumerate((top_rows, bottom_rows)):
        for index, y in enumerate(rows):
            spans.append(_span(f"span-g{group_index}-l{index}", f"Frage {group_index + 1}.{index + 1}", LEFT_TEXT_X0, y, LEFT_TEXT_X1 - LEFT_TEXT_X0))
            spans.append(_span(f"span-g{group_index}-ln{index}", str(index + 1), LEFT_LABEL_X, y, 0.015))
            spans.append(_span(f"span-g{group_index}-r{index}", f"Antwort {group_index + 1}.{index + 1}", RIGHT_TEXT_X0, y, RIGHT_TEXT_X1 - RIGHT_TEXT_X0))
            spans.append(_span(f"span-g{group_index}-rn{index}", chr(65 + index), RIGHT_LABEL_X, y, 0.015))
    result = _detect(tmp_path, _analysis(*spans), dots)

    assert result.matchingDetection.acceptedCount == 2
    assert all(len(exercise.leftItems) == 3 for exercise in result.matchingInteractions)


def test_right_side_vertically_scrambled_order(tmp_path):
    """The right column is deliberately NOT in left-row order: items are
    returned in printed (vertical) order, never paired by row alignment."""
    right_texts_by_y = {
        0.20: "Antwort drei.",
        0.24: "Antwort eins.",
        0.28: "Antwort zwei.",
    }
    spans: list[tuple] = []
    for index, y in enumerate(ROW_YS):
        spans.append(_span(f"span-l{index}", f"Frage {index + 1}.", LEFT_TEXT_X0, y, LEFT_TEXT_X1 - LEFT_TEXT_X0))
        spans.append(_span(f"span-ln{index}", str(index + 1), LEFT_LABEL_X, y, 0.015))
        spans.append(_span(f"span-r{index}", right_texts_by_y[y], RIGHT_TEXT_X0, y, RIGHT_TEXT_X1 - RIGHT_TEXT_X0))
        spans.append(_span(f"span-rn{index}", chr(65 + index), RIGHT_LABEL_X, y, 0.015))
    result = _detect(tmp_path, _analysis(*spans), _exercise_dots())

    assert result.matchingDetection.acceptedCount == 1
    exercise = result.matchingInteractions[0]
    assert [item.text for item in exercise.rightItems] == [
        "Antwort drei.", "Antwort eins.", "Antwort zwei.",
    ]
    # reading order within each side is by printed y, independent of the
    # other side's scramble
    assert [item.bbox.y for item in exercise.leftItems] == sorted(
        item.bbox.y for item in exercise.leftItems
    )


def test_low_confidence_garbage_spans_are_ignored(tmp_path):
    spans: list[tuple] = []
    for index, (y, left, right) in enumerate(zip(
        ROW_YS,
        ["Frage eins?", "Frage zwei?", "Frage drei?"],
        ["Antwort eins.", "Antwort zwei.", "Antwort drei."],
    )):
        spans.append(_span(f"span-l{index}", left, LEFT_TEXT_X0, y, LEFT_TEXT_X1 - LEFT_TEXT_X0))
        spans.append(_span(f"span-ln{index}", str(index + 1), LEFT_LABEL_X, y, 0.015))
        spans.append(_span(f"span-r{index}", right, RIGHT_TEXT_X0, y, RIGHT_TEXT_X1 - RIGHT_TEXT_X0))
        spans.append(_span(f"span-rn{index}", chr(65 + index), RIGHT_LABEL_X, y, 0.015))
    spans.append(_span("span-garbage", "��", 0.47, 0.20, 0.02, confidence=0.19))
    spans.append(_span("span-garbage2", "a", 0.50, 0.24, 0.01, confidence=0.45))
    result = _detect(tmp_path, _analysis(*spans), _exercise_dots())

    assert result.matchingDetection.acceptedCount == 1
    exercise = result.matchingInteractions[0]
    assert all("garbage" not in span_id for item in exercise.leftItems + exercise.rightItems for span_id in item.nearbyTextSpanIds)


def test_deterministic_ids_and_fingerprints(tmp_path):
    analysis = _matching_analysis(
        ["Frage eins?", "Frage zwei?", "Frage drei?"],
        ["Antwort eins.", "Antwort zwei.", "Antwort drei."],
    )
    first = _detect(tmp_path, analysis, _exercise_dots())
    second = _detect(tmp_path, analysis, _exercise_dots())

    assert first.matchingInteractions[0].id == second.matchingInteractions[0].id
    assert [item.id for item in first.matchingInteractions[0].leftItems] == [
        item.id for item in second.matchingInteractions[0].leftItems
    ]
    assert first.matchingInteractions[0].bbox == second.matchingInteractions[0].bbox
    assert first.matchingInteractions[0].candidateScore == second.matchingInteractions[0].candidateScore


# ---------------------------------------------------------------- NEGATIVE

def test_ordinary_two_column_prose_is_rejected(tmp_path):
    spans = [
        _span("span-a", "Das ist ganz normaler Text.", 0.12, 0.20, 0.30),
        _span("span-b", "Und hier steht die Fortsetzung.", 0.55, 0.20, 0.35),
        _span("span-c", "Noch eine Zeile links.", 0.12, 0.24, 0.30),
        _span("span-d", "Noch eine Zeile rechts.", 0.55, 0.24, 0.30),
        _span("span-e", "Und noch eine.", 0.12, 0.28, 0.30),
        _span("span-f", "Und noch eine.", 0.55, 0.28, 0.35),
    ]
    result = _detect(tmp_path, _analysis(*spans), [])

    assert result.matchingDetection.acceptedCount == 0


def test_two_unrelated_numbered_lists_are_rejected(tmp_path):
    spans = [
        _span("span-a", "Erstens: etwas.", 0.12, 0.20, 0.30),
        _span("span-b", "Zweitens: noch etwas.", 0.55, 0.20, 0.30),
        _span("span-c", "Drittens: mehr.", 0.12, 0.24, 0.30),
        _span("span-d", "Viertens: weniger.", 0.55, 0.24, 0.30),
        _span("span-e", "Fünftens: fertig.", 0.12, 0.28, 0.30),
        _span("span-f", "Sechstens: alles.", 0.55, 0.28, 0.30),
    ]
    result = _detect(tmp_path, _analysis(*spans), [])

    assert result.matchingDetection.acceptedCount == 0


def test_vocabulary_columns_without_anchors_are_rejected(tmp_path):
    spans = [
        _span("span-a", "das Haus", 0.12, 0.20, 0.20),
        _span("span-b", "the house", 0.55, 0.20, 0.20),
        _span("span-c", "der Hund", 0.12, 0.24, 0.20),
        _span("span-d", "the dog", 0.55, 0.24, 0.20),
        _span("span-e", "die Katze", 0.12, 0.28, 0.20),
        _span("span-f", "the cat", 0.55, 0.28, 0.20),
    ]
    result = _detect(tmp_path, _analysis(*spans), [])

    assert result.matchingDetection.acceptedCount == 0


def test_fill_blank_structures_are_rejected(tmp_path):
    """Horizontal answer lines with no anchor dots produce no exercise."""
    extra_ink = [(0.20, 0.22, 0.60, 0.22)]
    analysis = _matching_analysis(
        ["Frage eins mit ___?", "Frage zwei mit ___?", "Frage drei mit ___?"],
        ["Antwort eins.", "Antwort zwei.", "Antwort drei."],
    )
    result = _detect(tmp_path, analysis, [], extra_ink=extra_ink)

    assert result.matchingDetection.acceptedCount == 0


def test_sentence_ordering_separator_dots_are_rejected(tmp_path):
    """Ordering separator dots sit at varying x per line; no tight columns
    of paired dots can form."""
    dots = []
    for line_index, y in enumerate([0.20, 0.24, 0.28]):
        for dot_index in range(3):
            dots.append((0.20 + line_index * 0.02 + dot_index * 0.12, y))
    spans = [
        _span("span-a", "ich • gehe • heute", 0.15, 0.20, 0.60),
        _span("span-b", "du • gehst • morgen", 0.15, 0.24, 0.60),
        _span("span-c", "wir • gehen • bald", 0.15, 0.28, 0.60),
    ]
    result = _detect(tmp_path, _analysis(*spans), dots)

    assert result.matchingDetection.acceptedCount == 0


def test_glyph_attached_dots_are_rejected(tmp_path):
    """Punctuation bottom dots (``?``/``!``) have glyph ink nearby: the
    isolation filter rejects them before column pairing."""
    dots = _exercise_dots()
    extra_ink = []
    for y in ROW_YS:
        extra_ink.append((LEFT_DOT_X, y - 0.006, LEFT_DOT_X, y - 0.001))
        extra_ink.append((RIGHT_DOT_X, y - 0.006, RIGHT_DOT_X, y - 0.001))
    analysis = _matching_analysis(
        ["Frage eins?", "Frage zwei?", "Frage drei?"],
        ["Antwort eins.", "Antwort zwei.", "Antwort drei."],
    )
    result = _detect(tmp_path, analysis, dots, extra_ink=extra_ink)

    assert result.matchingDetection.acceptedCount == 0


def test_weak_candidate_with_only_two_dots_is_rejected(tmp_path):
    dots = [(LEFT_DOT_X, 0.20), (RIGHT_DOT_X, 0.20)]
    analysis = _matching_analysis(
        ["Frage eins?", "Frage zwei?", "Frage drei?"],
        ["Antwort eins.", "Antwort zwei.", "Antwort drei."],
    )
    result = _detect(tmp_path, analysis, dots)

    assert result.matchingDetection.acceptedCount == 0


def test_unequal_noisy_candidate_is_rejected(tmp_path):
    """Only two of three rows have right-side text: text ratio drops below
    the acceptance gate."""
    spans: list[tuple] = []
    for index, y in enumerate(ROW_YS):
        spans.append(_span(f"span-l{index}", f"Frage {index + 1}.", LEFT_TEXT_X0, y, LEFT_TEXT_X1 - LEFT_TEXT_X0))
        spans.append(_span(f"span-ln{index}", str(index + 1), LEFT_LABEL_X, y, 0.015))
        if index != 1:
            spans.append(_span(f"span-r{index}", f"Antwort {index + 1}.", RIGHT_TEXT_X0, y, RIGHT_TEXT_X1 - RIGHT_TEXT_X0))
            spans.append(_span(f"span-rn{index}", chr(65 + index), RIGHT_LABEL_X, y, 0.015))
    result = _detect(tmp_path, _analysis(*spans), _exercise_dots())

    assert result.matchingDetection.acceptedCount == 0


def test_page_header_and_footer_dots_are_rejected(tmp_path):
    """Header/footer rows with stray isolated dots never form two paired
    columns of three or more rows."""
    dots = [(0.20, 0.02), (0.80, 0.02), (0.20, 0.97), (0.80, 0.97)]
    analysis = _matching_analysis(
        ["Frage eins?", "Frage zwei?", "Frage drei?"],
        ["Antwort eins.", "Antwort zwei.", "Antwort drei."],
    )
    result = _detect(tmp_path, analysis, dots)

    assert result.matchingDetection.acceptedCount == 0


def test_extra_example_row_near_exercise_is_rejected_without_harming(tmp_path):
    """An example row with anchors but no right text is dropped; the
    remaining rows still form the exercise."""
    rows = [0.20, 0.24, 0.28, 0.34]
    dots = _exercise_dots(rows=rows, missing=[(3, "right")])
    spans: list[tuple] = []
    for index, y in enumerate(rows[:3]):
        spans.append(_span(f"span-l{index}", f"Frage {index + 1}.", LEFT_TEXT_X0, y, LEFT_TEXT_X1 - LEFT_TEXT_X0))
        spans.append(_span(f"span-ln{index}", str(index + 1), LEFT_LABEL_X, y, 0.015))
        spans.append(_span(f"span-r{index}", f"Antwort {index + 1}.", RIGHT_TEXT_X0, y, RIGHT_TEXT_X1 - RIGHT_TEXT_X0))
        spans.append(_span(f"span-rn{index}", chr(65 + index), RIGHT_LABEL_X, y, 0.015))
    spans.append(_span("span-example", "Das ist ein Beispiel.", LEFT_TEXT_X0, 0.34, 0.30))
    result = _detect(tmp_path, _analysis(*spans), dots)

    assert result.matchingDetection.acceptedCount == 1
    assert len(result.matchingInteractions[0].leftItems) == 3


def test_dimension_mismatch_raises(tmp_path):
    path = _image(tmp_path, _exercise_dots())
    analysis = _matching_analysis(
        ["Frage eins?", "Frage zwei?", "Frage drei?"],
        ["Antwort eins.", "Antwort zwei.", "Antwort drei."],
    )
    wrong = analysis.model_copy(update={"width": 999})
    with pytest.raises(ValueError):
        detect_matchings(path, wrong)


def test_missing_image_raises(tmp_path, tmp_path_factory):
    analysis = _matching_analysis(
        ["Frage eins?", "Frage zwei?", "Frage drei?"],
        ["Antwort eins.", "Antwort zwei.", "Antwort drei."],
    )
    with pytest.raises(ValueError):
        detect_matchings(str(tmp_path / "missing.png"), analysis)


def test_gray_and_bgra_images_are_supported(tmp_path):
    analysis = _matching_analysis(
        ["Frage eins?", "Frage zwei?", "Frage drei?"],
        ["Antwort eins.", "Antwort zwei.", "Antwort drei."],
    )
    gray = np.full((HEIGHT, WIDTH), 255, dtype=np.uint8)
    for x, y in _exercise_dots():
        cv2.circle(gray, (round(x * WIDTH), round(y * HEIGHT)), 4, 0, -1)
    gray_path = tmp_path / "gray.png"
    assert cv2.imwrite(str(gray_path), gray)
    result = detect_matchings(str(gray_path), analysis)
    assert result.matchingDetection.acceptedCount == 1

    bgra = np.full((HEIGHT, WIDTH, 4), 255, dtype=np.uint8)
    for x, y in _exercise_dots():
        cv2.circle(bgra, (round(x * WIDTH), round(y * HEIGHT)), 4, (0, 0, 0, 255), -1)
    bgra_path = tmp_path / "bgra.png"
    assert cv2.imwrite(str(bgra_path), bgra)
    result = detect_matchings(str(bgra_path), analysis)
    assert result.matchingDetection.acceptedCount == 1
