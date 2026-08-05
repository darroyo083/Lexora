from pathlib import Path

import cv2
import numpy as np
import pytest

from app.document.sentence_ordering_detection import (
    _fragment_length_cv,
    _split_fragments,
    _split_terminal_punctuation,
    detect_sentence_orderings,
)
from app.schemas.page_analysis import (
    BBox,
    PageAnalysis,
    ProcessorMetadata,
    TextSpan,
)


WIDTH = 1000
HEIGHT = 600


def _analysis(*spans: tuple[str, str, float, float, float, float]) -> PageAnalysis:
    return PageAnalysis(
        pageNumber=3,
        width=WIDTH,
        height=HEIGHT,
        language="de",
        textSpans=[
            TextSpan(
                id=span_id,
                text=text,
                confidence=0.99,
                confidenceScope="line",
                bbox=BBox(x=x, y=y, width=width, height=height),
            )
            for span_id, text, x, y, width, height in spans
        ],
        processor=ProcessorMetadata(
            engine="test",
            engineVersion="1",
            model="test",
            language="de",
            durationMs=1,
        ),
    )


def _line_geometry(x: float, y: float, width: float, height: float = 0.033):
    return x, y, width, height


def _fragment_texts(text: str) -> list[str]:
    return _split_fragments(text)


def _dot_positions(fragments: list[str], x0: int, x1: int) -> list[int]:
    """Mirror the detector's proportional boundary math for fixture dots."""
    total = sum(len(fragment) for fragment in fragments)
    width = x1 - x0
    positions = []
    cumulative = 0
    for fragment in fragments[:-1]:
        cumulative += len(fragment)
        positions.append(round(x0 + (cumulative / total) * width))
    return positions


def _image(
    tmp_path: Path,
    lines: list[tuple[str, float, float, float]],
    dot_radius: int = 5,
    noise: float = 0,
) -> str:
    """White page with OCR line bands and separator dots between fragments.

    lines: (text, x, y, width) in normalized coordinates. Dot x positions are
    derived from proportional fragment boundaries, like the printed book.
    """
    image = np.full((HEIGHT, WIDTH, 3), 255, dtype=np.uint8)
    for text, x, y, width in lines:
        fragments = _fragment_texts(text)
        x0 = round(x * WIDTH)
        x1 = round((x + width) * WIDTH)
        y_center = round((y + 0.033 / 2) * HEIGHT)
        for dot_x in _dot_positions(fragments, x0, x1):
            cv2.circle(image, (dot_x, y_center), dot_radius, (0, 0, 0), -1)
    if noise:
        rng = np.random.default_rng(7)
        mask = rng.random((HEIGHT, WIDTH)) < noise
        image[mask] = 0
    path = tmp_path / "page.png"
    assert cv2.imwrite(str(path), image)
    return str(path)


def _ordering_line(
    span_id: str,
    text: str,
    x: float = 0.15,
    y: float = 0.20,
    width: float = 0.55,
    height: float = 0.033,
):
    return (span_id, text, *_line_geometry(x, y, width, height))


def test_split_fragments_handles_both_separator_glyphs():
    assert _split_fragments("ich • bin · müde • .") == ["ich", "bin", "müde", "."]


def test_split_fragments_drops_empty_pieces():
    assert _split_fragments("hat •") == ["hat"]
    assert _split_fragments("a • b •") == ["a", "b"]


def test_split_terminal_punctuation_attached_period():
    assert _split_terminal_punctuation(["Er", "kommt", "heute."]) == [
        "Er", "kommt", "heute", ".",
    ]


def test_split_terminal_punctuation_standalone_period():
    assert _split_terminal_punctuation(["Er", "kommt", "heute", "."]) == [
        "Er", "kommt", "heute", ".",
    ]


def test_split_terminal_punctuation_attached_question_mark():
    assert _split_terminal_punctuation(["kommst", "du", "mit?"]) == [
        "kommst", "du", "mit", "?",
    ]


def test_split_terminal_punctuation_standalone_question_mark():
    assert _split_terminal_punctuation(["kommst", "du", "mit", "?"]) == [
        "kommst", "du", "mit", "?",
    ]


def test_split_terminal_punctuation_attached_exclamation_mark():
    assert _split_terminal_punctuation(["Das", "ist", "toll!"]) == [
        "Das", "ist", "toll", "!",
    ]


def test_split_terminal_punctuation_standalone_exclamation_mark():
    assert _split_terminal_punctuation(["Das", "ist", "toll", "!"]) == [
        "Das", "ist", "toll", "!",
    ]


def test_split_terminal_punctuation_trailing_run():
    assert _split_terminal_punctuation(["Komm", "mit?!"]) == [
        "Komm", "mit", "?!",
    ]


def test_split_terminal_punctuation_keeps_internal_comma_fragment():
    assert _split_terminal_punctuation(["ich", ",", "weil", "es regnet", "."]) == [
        "ich", ",", "weil", "es regnet", ".",
    ]


def test_split_terminal_punctuation_keeps_attached_comma():
    assert _split_terminal_punctuation(["ich, weil", "es regnet."]) == [
        "ich, weil", "es regnet", ".",
    ]


def test_split_terminal_punctuation_keeps_colon_attached():
    assert _split_terminal_punctuation(["machen: letztes Jahr", "wir", "Urlaub"]) == [
        "machen: letztes Jahr", "wir", "Urlaub",
    ]


def test_split_terminal_punctuation_keeps_abbreviation_period():
    assert _split_terminal_punctuation(["wir", "essen", "Brot", "usw."]) == [
        "wir", "essen", "Brot", "usw.",
    ]
    assert _split_terminal_punctuation(["ab", "8", "Uhr", "z.B."]) == [
        "ab", "8", "Uhr", "z.B.",
    ]
    assert _split_terminal_punctuation(["bis", "dann", "u.a."]) == [
        "bis", "dann", "u.a.",
    ]


def test_split_terminal_punctuation_without_terminal_mark_is_unchanged():
    assert _split_terminal_punctuation(["gestern", "ich", "habe", "geschenkt"]) == [
        "gestern", "ich", "habe", "geschenkt",
    ]


def test_split_terminal_punctuation_splits_mid_fragment_marks():
    assert _split_terminal_punctuation(["Sie", "geht?", "morgen"]) == [
        "Sie", "geht", "?", "morgen",
    ]


def test_split_terminal_punctuation_empty_and_sole_mark():
    assert _split_terminal_punctuation([]) == []
    assert _split_terminal_punctuation(["."]) == ["."]
    assert _split_terminal_punctuation(["..."]) == ["..."]


def test_fragment_length_cv_distinguishes_phrases_from_word_banks():
    ordering = ["Am letzten Wochenende", "nach Berlin", "Anna", "ist"]
    bank = ["schreiben", "spielen", "fragen"]
    assert _fragment_length_cv(ordering) > 0.4
    assert _fragment_length_cv(bank) < 0.4


def test_detects_single_prompt_with_separator_dots(tmp_path):
    lines = [
        ("ich • bin • müde • .", 0.15, 0.20, 0.55),
        ("du • bist • fröhlich • .", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderingDetection is not None
    assert result.sentenceOrderingDetection.detectionMethod == "sentence-ordering-v1"
    assert result.sentenceOrderingDetection.rawCandidateCount == 2
    assert result.sentenceOrderingDetection.acceptedCount == 2
    assert result.sentenceOrderingDetection.groupCount == 1
    interaction = result.sentenceOrderings[0]
    assert interaction.id == "sentence-ordering-3-1-1"
    assert interaction.kind == "sentence-ordering"
    assert interaction.exerciseId == "sentence-order-exercise-3-1"
    assert interaction.promptIndex == 1
    assert interaction.nearbyTextSpanIds == ["span-a"]
    assert [item.text for item in interaction.items] == [
        "ich", "bin", "müde", ".",
    ]
    assert [item.originalIndex for item in interaction.items] == [1, 2, 3, 4]


def test_detects_multiple_prompts_in_one_exercise(tmp_path):
    lines = [
        ("Am Sonntag • wir • lange • schlafen • .", 0.15, 0.20, 0.55),
        ("Am Montag • ich • arbeiten • muss • .", 0.15, 0.27, 0.55),
        ("Am Dienstag • sie • tanzen • geht • .", 0.15, 0.34, 0.55),
        ("Am Mittwoch • er • kochen • will • .", 0.15, 0.41, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        *[
            _ordering_line(f"span-{i}", text, y=y)
            for i, (text, _, y, _) in enumerate(lines)
        ]
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderingDetection.groupCount == 1
    assert result.sentenceOrderingDetection.acceptedCount == 4
    assert [i.id for i in result.sentenceOrderings] == [
        "sentence-ordering-3-1-1",
        "sentence-ordering-3-1-2",
        "sentence-ordering-3-1-3",
        "sentence-ordering-3-1-4",
    ]
    assert all(
        i.exerciseId == "sentence-order-exercise-3-1"
        for i in result.sentenceOrderings
    )
    assert [i.promptIndex for i in result.sentenceOrderings] == [1, 2, 3, 4]
    assert all(i.items for i in result.sentenceOrderings)


def test_item_ids_are_stable_and_deterministic(tmp_path):
    lines = [
        ("gestern • ich • habe • geschenkt • ein Buch •", 0.15, 0.20, 0.55),
        ("heute • wir • kaufen • Gemüse • .", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    first = detect_sentence_orderings(path, analysis)
    second = detect_sentence_orderings(path, analysis)

    assert first.sentenceOrderings == second.sentenceOrderings
    assert [
        item.id
        for interaction in first.sentenceOrderings
        for item in interaction.items
    ] == [
        "sentence-ordering-3-1-1-item-1",
        "sentence-ordering-3-1-1-item-2",
        "sentence-ordering-3-1-1-item-3",
        "sentence-ordering-3-1-1-item-4",
        "sentence-ordering-3-1-1-item-5",
        "sentence-ordering-3-1-2-item-1",
        "sentence-ordering-3-1-2-item-2",
        "sentence-ordering-3-1-2-item-3",
        "sentence-ordering-3-1-2-item-4",
        "sentence-ordering-3-1-2-item-5",
    ]


def test_duplicate_text_fragments_get_distinct_ids(tmp_path):
    lines = [
        ("gestern • ich • bin • ich • .", 0.15, 0.20, 0.55),
        ("morgen • du • bist • du • .", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    interaction = result.sentenceOrderings[0]
    assert [item.text for item in interaction.items] == [
        "gestern", "ich", "bin", "ich", ".",
    ]
    assert len({item.id for item in interaction.items}) == 5
    assert interaction.items[1].id != interaction.items[2].id


def test_terminal_period_is_an_orderable_fragment(tmp_path):
    lines = [
        ("Er • kommt • heute • .", 0.15, 0.20, 0.55),
        ("Sie • geht • morgen • .", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    interaction = result.sentenceOrderings[0]
    assert [i.text for i in interaction.items] == ["Er", "kommt", "heute", "."]
    assert interaction.items[-1].text == "."


def test_terminal_period_already_attached_splits_into_own_fragment(tmp_path):
    lines = [
        ("Er • kommt • heute.", 0.15, 0.20, 0.55),
        ("Sie • geht • morgen.", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    assert [i.text for i in result.sentenceOrderings[0].items] == [
        "Er", "kommt", "heute", ".",
    ]


def test_question_mark_merged_into_last_fragment(tmp_path):
    lines = [
        ("kommst • du heute • mit • ?", 0.15, 0.20, 0.55),
        ("geht • sie morgen • aus • ?", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    interaction = result.sentenceOrderings[0]
    assert [i.text for i in interaction.items] == [
        "kommst", "du heute", "mit", "?",
    ]
    assert interaction.items[-1].text == "?"


def test_question_mark_attached_to_last_fragment(tmp_path):
    lines = [
        ("kommst • du heute • mit?", 0.15, 0.20, 0.55),
        ("geht • sie morgen • aus?", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    interaction = result.sentenceOrderings[0]
    assert [i.text for i in interaction.items] == [
        "kommst", "du heute", "mit", "?",
    ]


def test_exclamation_mark_merged_into_last_fragment(tmp_path):
    lines = [
        ("Das • hier • ist wirklich • toll • !", 0.15, 0.20, 0.55),
        ("Heute • ist • wirklich • Sonntag • !", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    interaction = result.sentenceOrderings[0]
    assert [i.text for i in interaction.items] == [
        "Das", "hier", "ist wirklich", "toll", "!",
    ]
    assert interaction.items[-1].text == "!"


def test_exclamation_mark_attached_to_last_fragment(tmp_path):
    lines = [
        ("Das • hier • ist wirklich • toll!", 0.15, 0.20, 0.55),
        ("Heute • ist • wirklich • Sonntag!", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    interaction = result.sentenceOrderings[0]
    assert [i.text for i in interaction.items] == [
        "Das", "hier", "ist wirklich", "toll", "!",
    ]


def test_internal_comma_remains_an_orderable_fragment(tmp_path):
    lines = [
        ("ich • , • weil • es regnet • .", 0.15, 0.20, 0.55),
        ("wir • , • wenn • du kommst • .", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    interaction = result.sentenceOrderings[0]
    assert [i.text for i in interaction.items] == [
        "ich", ",", "weil", "es regnet", ".",
    ]


def test_abbreviation_period_stays_attached(tmp_path):
    lines = [
        ("wir • essen • Brot • usw.", 0.15, 0.20, 0.55),
        ("danach • gehen • wir • nach Hause.", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    interaction = result.sentenceOrderings[0]
    assert [i.text for i in interaction.items] == [
        "wir", "essen", "Brot", "usw.",
    ]
    assert [i.text for i in result.sentenceOrderings[1].items] == [
        "danach", "gehen", "wir", "nach Hause", ".",
    ]


def test_no_terminal_punctuation_leaves_fragments_unchanged(tmp_path):
    lines = [
        ("gestern • ich • habe • geschenkt", 0.15, 0.20, 0.55),
        ("heute • wir • kaufen • Gemüse", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    interaction = result.sentenceOrderings[0]
    assert [i.text for i in interaction.items] == [
        "gestern", "ich", "habe", "geschenkt",
    ]


def test_strips_merged_row_number_on_margin_line(tmp_path):
    lines = [
        ("1 Das Wetter • heute • schön • ist • .", 0.12, 0.20, 0.55),
        ("der Himmel • blau • war • Gestern • .", 0.17, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], x=0.12, y=0.20),
        _ordering_line("span-b", lines[1][0], x=0.17, y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderings[0].items[0].text == "Das Wetter"
    assert result.sentenceOrderings[1].items[0].text == "der Himmel"


def test_keeps_leading_digits_when_line_is_not_at_margin(tmp_path):
    lines = [
        ("machen: letztes Jahr • wir • Urlaub •", 0.15, 0.20, 0.55),
        ("starten: das Flugzeug • um 8 Uhr • in Frankfurt", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderings[0].items[0].text == "machen: letztes Jahr"


def test_missing_separator_dot_merges_fragment_but_keeps_geometry(tmp_path):
    lines = [
        ("nach Hause - Sie • gekommen • ist • .", 0.15, 0.20, 0.55),
        ("in den Park • wir • gehen • .", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    interaction = result.sentenceOrderings[0]
    assert [i.text for i in interaction.items] == [
        "nach Hause - Sie", "gekommen", "ist", ".",
    ]
    boundaries = [i.bbox.x for i in interaction.items[1:]]
    assert boundaries[0] > interaction.items[0].bbox.x
    assert boundaries == sorted(boundaries)


def test_fragment_bboxes_stay_within_normalized_bounds(tmp_path):
    lines = [
        ("Am Wochenende • fahren • wir • nach Berlin • .", 0.02, 0.10, 0.50),
        ("Danach • essen • wir • Pizza • .", 0.02, 0.20, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], x=0.02, y=0.10, width=0.50),
        _ordering_line("span-b", lines[1][0], x=0.02, y=0.20, width=0.55),
    )

    result = detect_sentence_orderings(path, analysis)

    for interaction in result.sentenceOrderings:
        for item in interaction.items:
            for bbox in (item.bbox, interaction.bbox):
                assert 0 <= bbox.x <= 1
                assert 0 <= bbox.y <= 1
                assert 0 <= bbox.x + bbox.width <= 1
                assert 0 <= bbox.y + bbox.height <= 1


def test_rejects_single_isolated_ordering_line(tmp_path):
    path = _image(tmp_path, [("ich • bin • müde • .", 0.15, 0.20, 0.55)])
    analysis = _analysis(_ordering_line("span-a", "ich • bin • müde • ."))

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderings == []
    assert result.sentenceOrderingDetection.acceptedCount == 0


def test_rejects_plain_prose(tmp_path):
    lines = [
        ("Ich gehe heute einkaufen und koche dann das Abendessen.", 0.15, 0.20, 0.55),
        ("Morgen besuchen wir meine Großmutter in der Stadt.", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderings == []
    assert result.sentenceOrderingDetection.rawCandidateCount == 0


def test_rejects_numbered_list_without_separators(tmp_path):
    lines = [
        ("1 Erste Aufgabe: Sätze bilden und schreiben.", 0.15, 0.20, 0.55),
        ("2 Zweite Aufgabe: Wörter ergänzen.", 0.15, 0.27, 0.55),
        ("3 Dritte Aufgabe: Sätze kombinieren.", 0.15, 0.34, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
        _ordering_line("span-c", lines[2][0], y=0.34),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderings == []


def test_rejects_single_bullet_list_marker(tmp_path):
    lines = [
        ("• Position 2 steht das Verb.", 0.15, 0.20, 0.55),
        ("• Am Schluss steht der Rest.", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderings == []
    assert result.sentenceOrderingDetection.rawCandidateCount == 0


def test_rejects_uniform_word_bank(tmp_path):
    lines = [
        ("schreiben • spielen • fragen • geben", 0.15, 0.20, 0.55),
        ("mitkommen • weggehen • mitbringen", 0.15, 0.27, 0.55),
        ("nehmen • essen • lesen • sprechen", 0.15, 0.34, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
        _ordering_line("span-c", lines[2][0], y=0.34),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderings == []
    assert result.sentenceOrderingDetection.acceptedCount == 0


def test_accepts_phrase_mix_against_word_bank(tmp_path):
    lines = [
        ("gestern • ich • habe • ein Buch • geschenkt • .", 0.15, 0.20, 0.55),
        ("heute • wir • kaufen • Gemüse • .", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderingDetection.acceptedCount == 2


def test_rejects_fill_blank_style_prose_lines(tmp_path):
    lines = [
        ("Er kauft heute Brot und ich koche das Essen.", 0.15, 0.20, 0.55),
        ("Am Abend sehen wir fern und gehen schlafen.", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderings == []


def test_rejects_distant_lines_as_separate_blocks(tmp_path):
    lines = [
        ("ich • bin • müde • .", 0.15, 0.20, 0.55),
        ("wir • gehen • spazieren • .", 0.15, 0.50, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.50),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderings == []
    assert result.sentenceOrderingDetection.rawCandidateCount == 2
    assert result.sentenceOrderingDetection.acceptedCount == 0


def test_accepts_ordering_under_noisy_scan_background(tmp_path):
    lines = [
        ("Am Sonntag • wir • lange • schlafen • .", 0.15, 0.20, 0.55),
        ("Am Montag • ich • arbeiten • muss • .", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines, noise=0.004)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    assert len(result.sentenceOrderings) == 2


def test_accepts_proportional_geometry_when_dots_missing(tmp_path):
    lines = [
        ("ich • bin • müde • .", 0.15, 0.20, 0.55),
        ("du • bist • fröhlich • .", 0.15, 0.27, 0.55),
    ]
    path = _image(tmp_path, lines, dot_radius=2)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
    )

    result = detect_sentence_orderings(path, analysis)

    assert len(result.sentenceOrderings) == 2
    items = result.sentenceOrderings[0].items
    assert len(items) == 4
    assert [i.bbox.x for i in items] == sorted(i.bbox.x for i in items)


def test_rejects_dimension_mismatch_without_transforming(tmp_path):
    path = _image(tmp_path, [("ich • bin • müde • .", 0.15, 0.20, 0.55)])
    analysis = _analysis(
        _ordering_line("span-a", "ich • bin • müde • .")
    ).model_copy(update={"width": WIDTH - 1})

    with pytest.raises(ValueError, match="dimensions do not match"):
        detect_sentence_orderings(path, analysis)


def test_no_candidates_returns_empty_detection(tmp_path):
    path = _image(tmp_path, [])
    analysis = _analysis(_ordering_line("span-a", "Ich gehe heute einkaufen."))

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderings == []
    assert result.sentenceOrderingDetection is not None
    assert result.sentenceOrderingDetection.rawCandidateCount == 0
    assert result.sentenceOrderingDetection.acceptedCount == 0
    assert result.sentenceOrderingDetection.groupCount == 0


def test_continuation_line_merges_into_previous_prompt(tmp_path):
    lines = [
        ("1 Am Sonntag • wir • lange • schlafen •", 0.15, 0.20, 0.55),
        ("2 Am Montag • ich • arbeite • .", 0.15, 0.27, 0.55),
        ("3 sehen • wir • fern •", 0.15, 0.34, 0.55),
        ("und • schlafen • .", 0.15, 0.3405, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
        _ordering_line("span-c", lines[2][0], y=0.34),
        _ordering_line("span-d", lines[3][0], y=0.3405),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderingDetection.acceptedCount == 3
    interaction = result.sentenceOrderings[2]
    assert [i.text for i in interaction.items] == [
        "3 sehen", "wir", "fern", "und", "schlafen", ".",
    ]
    assert interaction.nearbyTextSpanIds == ["span-c", "span-d"]
    assert interaction.bbox.y <= 0.34
    assert interaction.bbox.y + interaction.bbox.height == pytest.approx(0.3405 + 0.033, abs=0.002)


def test_numbered_neighboring_prompts_stay_separate(tmp_path):
    lines = [
        ("1 Am Sonntag • wir • lange • schlafen •", 0.15, 0.20, 0.55),
        ("2 Am Montag • ich • arbeite • .", 0.15, 0.27, 0.55),
        ("3 Am Dienstag • sie • tanzt • .", 0.15, 0.34, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
        _ordering_line("span-c", lines[2][0], y=0.34),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderingDetection.acceptedCount == 3
    assert [i.id for i in result.sentenceOrderings] == [
        "sentence-ordering-3-1-1",
        "sentence-ordering-3-1-2",
        "sentence-ordering-3-1-3",
    ]


def test_continuation_indentation_variation_still_merges(tmp_path):
    lines = [
        ("1 Am Sonntag • wir • lange • schlafen •", 0.15, 0.20, 0.55),
        ("2 Am Montag • ich • arbeite • .", 0.15, 0.27, 0.55),
        ("3 sehen • wir • fern •", 0.15, 0.34, 0.55),
        ("und • schlafen • .", 0.22, 0.3405, 0.48),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
        _ordering_line("span-c", lines[2][0], y=0.34),
        _ordering_line("span-d", lines[3][0], x=0.22, y=0.3405, width=0.48),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderingDetection.acceptedCount == 3
    assert [i.text for i in result.sentenceOrderings[2].items] == [
        "3 sehen", "wir", "fern", "und", "schlafen", ".",
    ]


def test_two_column_prompts_with_continuation(tmp_path):
    lines = [
        ("1 Am Sonntag • wir • lange • schlafen •", 0.15, 0.20, 0.35),
        ("4 ich • muss • kochen •", 0.55, 0.20, 0.35),
        ("2 Am Montag • ich • arbeite • .", 0.15, 0.27, 0.35),
        ("5 Am Nachmittag • wir • gehen •", 0.55, 0.27, 0.35),
        ("3 sehen • wir • fern •", 0.15, 0.34, 0.35),
        ("und • schlafen • .", 0.15, 0.341, 0.35),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], x=0.15, y=0.20, width=0.35),
        _ordering_line("span-b", lines[1][0], x=0.55, y=0.20, width=0.35),
        _ordering_line("span-c", lines[2][0], x=0.15, y=0.27, width=0.35),
        _ordering_line("span-d", lines[3][0], x=0.55, y=0.27, width=0.35),
        _ordering_line("span-e", lines[4][0], x=0.15, y=0.34, width=0.35),
        _ordering_line("span-f", lines[5][0], x=0.15, y=0.341, width=0.35),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderingDetection.acceptedCount == 5
    assert result.sentenceOrderingDetection.groupCount == 1
    by_index = {i.promptIndex: i for i in result.sentenceOrderings}
    assert [i.items[0].text for i in result.sentenceOrderings] == [
        "1 Am Sonntag", "2 Am Montag", "3 sehen", "4 ich", "5 Am Nachmittag",
    ]
    merged = by_index[3]
    assert [i.text for i in merged.items] == [
        "3 sehen", "wir", "fern", "und", "schlafen", ".",
    ]
    assert merged.nearbyTextSpanIds == ["span-e", "span-f"]


def test_two_column_continuation_does_not_cross_column_boundaries(tmp_path):
    """The right-column wrap sits on the left column's row grid and must merge
    into its OWN column's previous row, never into the neighbouring row."""
    lines = [
        ("1 Am Sonntag • wir • lange • schlafen •", 0.15, 0.20, 0.35),
        ("4 ich • muss • kochen •", 0.55, 0.20, 0.35),
        ("2 Am Montag • ich • arbeite • .", 0.15, 0.27, 0.35),
        ("5 Am Nachmittag • wir • gehen •", 0.55, 0.27, 0.35),
        ("3 sehen • wir • fern •", 0.15, 0.34, 0.35),
        ("zusammen • möchten • .", 0.55, 0.34, 0.35),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], x=0.15, y=0.20, width=0.35),
        _ordering_line("span-b", lines[1][0], x=0.55, y=0.20, width=0.35),
        _ordering_line("span-c", lines[2][0], x=0.15, y=0.27, width=0.35),
        _ordering_line("span-d", lines[3][0], x=0.55, y=0.27, width=0.35),
        _ordering_line("span-e", lines[4][0], x=0.15, y=0.34, width=0.35),
        _ordering_line("span-f", lines[5][0], x=0.55, y=0.34, width=0.35),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderingDetection.acceptedCount == 5
    by_index = {i.promptIndex: i for i in result.sentenceOrderings}
    assert [i.text for i in by_index[3].items] == ["3 sehen", "wir", "fern"]
    merged = by_index[5]
    assert [i.text for i in merged.items] == [
        "5 Am Nachmittag", "wir", "gehen", "zusammen", "möchten", ".",
    ]
    assert merged.nearbyTextSpanIds == ["span-d", "span-f"]


def test_two_column_reading_order_left_then_right(tmp_path):
    """3 prompts in the left column + 2 in the right keep the printed order
    1,2,3 then 4,5 — never interleaved by row height."""
    lines = [
        ("1 Am Sonntag • wir • lange • schlafen • .", 0.15, 0.20, 0.35),
        ("4 ich • muss • kochen • .", 0.55, 0.20, 0.35),
        ("2 Am Montag • ich • arbeite • .", 0.15, 0.27, 0.35),
        ("5 Am Nachmittag • wir • gehen • .", 0.55, 0.27, 0.35),
        ("3 sehen • wir • fern • .", 0.15, 0.34, 0.35),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], x=0.15, y=0.20, width=0.35),
        _ordering_line("span-b", lines[1][0], x=0.55, y=0.20, width=0.35),
        _ordering_line("span-c", lines[2][0], x=0.15, y=0.27, width=0.35),
        _ordering_line("span-d", lines[3][0], x=0.55, y=0.27, width=0.35),
        _ordering_line("span-e", lines[4][0], x=0.15, y=0.34, width=0.35),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderingDetection.acceptedCount == 5
    assert [i.promptIndex for i in result.sentenceOrderings] == [1, 2, 3, 4, 5]
    assert [i.items[0].text for i in result.sentenceOrderings] == [
        "1 Am Sonntag", "2 Am Montag", "3 sehen", "4 ich", "5 Am Nachmittag",
    ]
    assert all(i.items[-1].text == "." for i in result.sentenceOrderings)


def test_two_column_vertically_aligned_rows_stay_separate(tmp_path):
    """Rows printed on the same grid line across two columns are separate
    prompts; only unnumbered wraps merge."""
    lines = [
        ("1 Am Sonntag • wir • lange • schlafen • .", 0.15, 0.20, 0.35),
        ("4 ich • muss • kochen • .", 0.55, 0.20, 0.35),
        ("2 Am Montag • ich • arbeite • .", 0.15, 0.27, 0.35),
        ("5 Am Nachmittag • wir • gehen • .", 0.55, 0.27, 0.35),
        ("3 sehen • wir • fern • .", 0.15, 0.34, 0.35),
        ("6 heute • wir • tanzen • .", 0.55, 0.34, 0.35),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], x=0.15, y=0.20, width=0.35),
        _ordering_line("span-b", lines[1][0], x=0.55, y=0.20, width=0.35),
        _ordering_line("span-c", lines[2][0], x=0.15, y=0.27, width=0.35),
        _ordering_line("span-d", lines[3][0], x=0.55, y=0.27, width=0.35),
        _ordering_line("span-e", lines[4][0], x=0.15, y=0.34, width=0.35),
        _ordering_line("span-f", lines[5][0], x=0.55, y=0.34, width=0.35),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderingDetection.acceptedCount == 6
    assert [i.promptIndex for i in result.sentenceOrderings] == [1, 2, 3, 4, 5, 6]
    assert [i.items[0].text for i in result.sentenceOrderings] == [
        "1 Am Sonntag", "2 Am Montag", "3 sehen",
        "4 ich", "5 Am Nachmittag", "6 heute",
    ]


def test_two_column_different_row_heights(tmp_path):
    """Column rows with slightly different OCR band heights still cluster into
    two clean columns and keep the reading order."""
    lines = [
        ("1 Am Sonntag • wir • lange • schlafen • .", 0.15, 0.20, 0.35),
        ("4 ich • muss • kochen • .", 0.55, 0.20, 0.35),
        ("2 Am Montag • ich • arbeite • .", 0.15, 0.27, 0.35),
        ("5 Am Nachmittag • wir • gehen • .", 0.55, 0.27, 0.35),
        ("3 sehen • wir • fern • .", 0.15, 0.34, 0.35),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], x=0.15, y=0.20, width=0.35),
        _ordering_line("span-b", lines[1][0], x=0.55, y=0.20, width=0.35, height=0.041),
        _ordering_line("span-c", lines[2][0], x=0.15, y=0.27, width=0.35),
        _ordering_line("span-d", lines[3][0], x=0.55, y=0.27, width=0.35, height=0.040),
        _ordering_line("span-e", lines[4][0], x=0.15, y=0.34, width=0.35),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderingDetection.acceptedCount == 5
    assert [i.promptIndex for i in result.sentenceOrderings] == [1, 2, 3, 4, 5]
    assert [i.items[0].text for i in result.sentenceOrderings] == [
        "1 Am Sonntag", "2 Am Montag", "3 sehen", "4 ich", "5 Am Nachmittag",
    ]


def test_two_column_continuation_ignores_other_column_margin_digit(tmp_path):
    """A right-column wrap printed beside a left-column row must not consume
    the left column's margin number (digit attribution is column-local)."""
    lines = [
        ("1 Am Sonntag • wir • lange • schlafen •", 0.15, 0.20, 0.35),
        ("4 ich • muss • kochen •", 0.55, 0.20, 0.35),
        ("2 Am Montag • ich • arbeite • .", 0.15, 0.27, 0.35),
        ("5 Am Nachmittag • wir • gehen •", 0.55, 0.27, 0.35),
        ("3 sehen • wir • fern •", 0.15, 0.34, 0.35),
        ("zusammen • möchten • .", 0.55, 0.339, 0.35),
    ]
    path = _image(tmp_path, lines)
    spans = [
        _ordering_line("span-a", lines[0][0], x=0.15, y=0.20, width=0.35),
        _ordering_line("span-b", lines[1][0], x=0.55, y=0.20, width=0.35),
        _ordering_line("span-c", lines[2][0], x=0.15, y=0.27, width=0.35),
        _ordering_line("span-d", lines[3][0], x=0.55, y=0.27, width=0.35),
        _ordering_line("span-e", lines[4][0], x=0.15, y=0.34, width=0.35),
        _ordering_line("span-f", lines[5][0], x=0.55, y=0.339, width=0.35),
    ]
    digits = [
        ("digit-1", "1", 0.12, 0.20),
        ("digit-2", "2", 0.12, 0.27),
        ("digit-3", "3", 0.12, 0.34),
        ("digit-4", "4", 0.52, 0.20),
        ("digit-5", "5", 0.52, 0.27),
    ]
    analysis = _analysis(*spans).model_copy(update={
        "textSpans": [
            *(_analysis(*spans).textSpans),
            *[
                TextSpan(
                    id=digit_id,
                    text=text,
                    confidence=0.99,
                    confidenceScope="line",
                    bbox=BBox(x=x, y=y, width=0.014, height=0.012),
                )
                for digit_id, text, x, y in digits
            ],
        ],
    })

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderingDetection.acceptedCount == 5
    by_index = {i.promptIndex: i for i in result.sentenceOrderings}
    merged = by_index[5]
    assert [i.text for i in merged.items] == [
        "5 Am Nachmittag", "wir", "gehen", "zusammen", "möchten", ".",
    ]
    assert [i.text for i in by_index[3].items] == ["3 sehen", "wir", "fern"]


def test_indented_dialogue_rows_stay_one_column(tmp_path):
    """Indented speaker rows (Herr Guzman / Portier) share no print row with
    the other x-cluster, so the block must NOT be split into columns and the
    prompt order stays top-to-bottom."""
    lines = [
        ("Herr Guzman: möchten: ich • meine Aufenthaltserlaubnis • verlängern •", 0.15, 0.20, 0.55),
        ("Portier: müssen: Sie • in den dritten Stock • gehen •", 0.26, 0.27, 0.55),
        ("Herr Guzman: können: ich • meinen Hund • mitnehmen • ?", 0.15, 0.34, 0.55),
        ("Portier: dürfen: Hunde • nicht ins Haus • gehen • .", 0.26, 0.41, 0.55),
        ("Herr Guzman: sollen: wo • der Hund • bleiben • ?", 0.15, 0.48, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], x=0.15, y=0.20, width=0.55),
        _ordering_line("span-b", lines[1][0], x=0.26, y=0.27, width=0.55),
        _ordering_line("span-c", lines[2][0], x=0.15, y=0.34, width=0.55),
        _ordering_line("span-d", lines[3][0], x=0.26, y=0.41, width=0.55),
        _ordering_line("span-e", lines[4][0], x=0.15, y=0.48, width=0.55),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderingDetection.acceptedCount == 5
    assert [i.items[0].text for i in result.sentenceOrderings] == [
        "Herr Guzman: möchten: ich",
        "Portier: müssen: Sie",
        "Herr Guzman: können: ich",
        "Portier: dürfen: Hunde",
        "Herr Guzman: sollen: wo",
    ]
    assert [i.items[-1].text for i in result.sentenceOrderings] == [
        "verlängern", "gehen", "?", ".", "?",
    ]


def test_two_column_nearby_unnumbered_line_with_normal_gap_stays_prompt(tmp_path):
    """An unnumbered right-column line with an ordinary prompt gap is a real
    prompt, even though it sits close to a left-column row."""
    lines = [
        ("1 Am Sonntag • wir • lange • schlafen •", 0.15, 0.20, 0.35),
        ("4 ich • muss • kochen •", 0.55, 0.20, 0.35),
        ("2 Am Montag • ich • arbeite • .", 0.15, 0.27, 0.35),
        ("5 Am Nachmittag • wir • gehen •", 0.55, 0.27, 0.35),
        ("3 sehen • wir • fern •", 0.15, 0.34, 0.35),
        ("zusammen • möchten • .", 0.55, 0.41, 0.35),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], x=0.15, y=0.20, width=0.35),
        _ordering_line("span-b", lines[1][0], x=0.55, y=0.20, width=0.35),
        _ordering_line("span-c", lines[2][0], x=0.15, y=0.27, width=0.35),
        _ordering_line("span-d", lines[3][0], x=0.55, y=0.27, width=0.35),
        _ordering_line("span-e", lines[4][0], x=0.15, y=0.34, width=0.35),
        _ordering_line("span-f", lines[5][0], x=0.55, y=0.41, width=0.35),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderingDetection.acceptedCount == 6
    by_index = {i.promptIndex: i for i in result.sentenceOrderings}
    assert [i.text for i in by_index[5].items] == [
        "5 Am Nachmittag", "wir", "gehen",
    ]
    assert [i.text for i in by_index[6].items] == [
        "zusammen", "möchten", ".",
    ]


def test_unnumbered_line_with_normal_gap_stays_a_prompt(tmp_path):
    lines = [
        ("1 an,schalten: den Computer • ich • Um 8 Uhr •", 0.15, 0.20, 0.55),
        ("2 an,rufen: Um 9 Uhr • ich • sofort •", 0.15, 0.27, 0.55),
        ("an,fangen können: Nach dem Meeting • wir • mit der Pause •", 0.15, 0.34, 0.55),
        ("3 an,kommen: eine Lieferung • Um 10 Uhr • .", 0.15, 0.41, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
        _ordering_line("span-c", lines[2][0], y=0.34),
        _ordering_line("span-d", lines[3][0], y=0.41),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderingDetection.acceptedCount == 4
    assert [i.text for i in result.sentenceOrderings[2].items][0] == (
        "an,fangen können: Nach dem Meeting"
    )


def test_prose_below_ordering_prompt_does_not_merge(tmp_path):
    lines = [
        ("1 Am Sonntag • wir • lange • schlafen •", 0.15, 0.20, 0.55),
        ("2 Am Montag • ich • arbeite • .", 0.15, 0.27, 0.55),
        ("Und dann gehen wir alle zusammen ins Kino.", 0.15, 0.271, 0.55),
    ]
    path = _image(tmp_path, lines)
    analysis = _analysis(
        _ordering_line("span-a", lines[0][0], y=0.20),
        _ordering_line("span-b", lines[1][0], y=0.27),
        _ordering_line("span-c", lines[2][0], y=0.271),
    )

    result = detect_sentence_orderings(path, analysis)

    assert result.sentenceOrderingDetection.acceptedCount == 2
    assert [i.id for i in result.sentenceOrderings] == [
        "sentence-ordering-3-1-1",
        "sentence-ordering-3-1-2",
    ]
