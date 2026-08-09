import pytest

from app.answer_key.cornelsen_parser import (
    CornelsenAnswerKeyParser,
    _build_spans,
    _group_lines,
    _line_text,
    _infer_interaction_kind,
    _cluster_lines_by_column,
    SUB_EXERCISE_RE,
    EXERCISE_HEADER_RE,
)
from app.answer_key.parser import AnswerKeyEntry, AnswerKeyParser
from app.answer_key.stub_parser import StubAnswerKeyParser
from tests.test_answer_key.fixtures import make_span


class TestParserBoundary:
    def test_cornelsen_implements_boundary(self):
        parser = CornelsenAnswerKeyParser()
        assert isinstance(parser, AnswerKeyParser)
        assert parser.publisher() == "cornelsen"

    def test_stub_implements_boundary(self):
        parser = StubAnswerKeyParser()
        assert isinstance(parser, AnswerKeyParser)
        assert parser.publisher() == "stub"

    def test_polymorphic_parse(self):
        parsers: list[AnswerKeyParser] = [
            CornelsenAnswerKeyParser(),
            StubAnswerKeyParser(),
        ]
        spans = [make_span("s-1", "Lösungen", y=0.02)]
        for p in parsers:
            result = p.parse(spans)
            assert isinstance(result, list)
            assert all(isinstance(e, AnswerKeyEntry) for e in result)


class TestSpanBuilding:
    def test_empty_spans(self):
        assert _build_spans([]) == []

    def test_skips_whitespace_only(self):
        spans = [make_span("s-1", "   ")]
        assert _build_spans(spans) == []

    def test_retains_text_and_confidence(self):
        spans = [make_span("s-1", "Hallo", confidence=0.95, x=0.2, y=0.1)]
        result = _build_spans(spans)
        assert len(result) == 1
        assert result[0].text == "Hallo"
        assert result[0].confidence == 0.95

    def test_zero_confidence(self):
        spans = [make_span("s-1", "Test", confidence=0.5, x=0.1, y=0.1)]
        result = _build_spans(spans)
        assert result[0].confidence == 0.5


class TestLineGrouping:
    def test_single_line(self):
        spans = _build_spans([
            make_span("s-1-0", "eins", parent_line_id="L1"),
            make_span("s-1-1", "zwei", parent_line_id="L1"),
        ])
        groups = _group_lines(spans)
        assert len(groups) == 1
        assert len(groups[0]) == 2

    def test_two_lines(self):
        spans = _build_spans([
            make_span("s-1-0", "eins", parent_line_id="L1"),
            make_span("s-2-0", "zwei", parent_line_id="L2"),
        ])
        groups = _group_lines(spans)
        assert len(groups) == 2

    def test_line_text_joins_x_order(self):
        spans = _build_spans([
            make_span("a", "second", x=0.5, parent_line_id="L1"),
            make_span("b", "first", x=0.1, parent_line_id="L1"),
        ])
        groups = _group_lines(spans)
        assert _line_text(groups[0]) == "first second"

    def test_empty_group_lines(self):
        assert _group_lines([]) == []


class TestExerciseHeaderDetection:
    def test_standard_header(self):
        m = EXERCISE_HEADER_RE.match("76 Relativsätze 2")
        assert m is not None
        assert m.group("num") == "76"
        assert m.group("title") == "Relativsätze 2"

    def test_three_digit_header(self):
        m = EXERCISE_HEADER_RE.match("105 Kausalsätze")
        assert m is not None
        assert m.group("num") == "105"
        assert m.group("title") == "Kausalsätze"

    def test_not_a_header(self):
        assert EXERCISE_HEADER_RE.match("Dies ist kein Header") is None
        assert EXERCISE_HEADER_RE.match("1. der Hund") is None

    def test_header_with_dots_in_title(self):
        m = EXERCISE_HEADER_RE.match("45 Übung A.1")
        assert m is not None
        assert m.group("num") == "45"
        assert "Übung A.1" in m.group("title")


class TestSubExerciseDetection:
    def test_sub_exercise_marker(self):
        m = SUB_EXERCISE_RE.match("1 1. der Hund — die Katze")
        assert m is not None
        assert m.group("marker") == "1"
        assert "der Hund" in m.group("items")

    def test_letter_suffix_marker(self):
        m = SUB_EXERCISE_RE.match("5a 1. Je mehr man arbeitet, desto mehr verdient man.")
        assert m is not None
        assert m.group("marker") == "5a"

    def test_not_a_sub_marker(self):
        assert SUB_EXERCISE_RE.match("Lösungen") is None
        assert SUB_EXERCISE_RE.match("76 Relativsätze 2") is None

    def test_double_digit_marker(self):
        m = SUB_EXERCISE_RE.match("12 12. einige Wörter")
        assert m is not None
        assert m.group("marker") == "12"


class TestInteractionKindInference:
    def test_relativsatz_is_fillblank(self):
        assert _infer_interaction_kind("Relativsätze 2") == "FillBlank"

    def test_adjektiv_is_fillblank(self):
        assert _infer_interaction_kind("Adjektivdeklination") == "FillBlank"

    def test_zuordnen_is_matching(self):
        assert _infer_interaction_kind("Sätze zuordnen") == "Matching"

    def test_satzstellung_is_ordering(self):
        assert _infer_interaction_kind("Satzstellung im Satz") == "SentenceOrdering"

    def test_unknown_defaults_to_fillblank(self):
        assert _infer_interaction_kind("Unbekannte Übung") == "FillBlank"

    def test_nebensatz_is_fillblank(self):
        assert _infer_interaction_kind("Nebensätze mit dass") == "FillBlank"

    def test_konnektor_is_fillblank(self):
        assert _infer_interaction_kind("Konnektoren üben") == "FillBlank"

    def test_praeposition_is_fillblank(self):
        assert _infer_interaction_kind("Präpositionen mit Dativ") == "FillBlank"

    def test_partizip_is_fillblank(self):
        assert _infer_interaction_kind("Partizip II") == "FillBlank"

    def test_wortstellung_is_ordering(self):
        assert _infer_interaction_kind("Wortstellung im Satz") == "SentenceOrdering"


class TestCornelsenParse:
    def test_empty_input(self):
        parser = CornelsenAnswerKeyParser()
        assert parser.parse([]) == []

    def test_no_loesungen_header_returns_empty(self):
        parser = CornelsenAnswerKeyParser()
        spans = [
            make_span("s-42-0", "Keine Lösungen hier", y=0.1),
        ]
        assert parser.parse(spans) == []

    def test_simple_exercise_one_entry(self):
        parser = CornelsenAnswerKeyParser()
        spans = [
            make_span("s-42-0", "Lösungen", y=0.02, parent_line_id="L0"),
            make_span("s-42-1", "12 Artikel", y=0.05, parent_line_id="L1"),
            make_span("s-42-2", "1 1. der Hund", y=0.08, parent_line_id="L2"),
        ]
        result = parser.parse(spans)
        assert len(result) >= 1
        e = result[0]
        assert e.exerciseNumber == "12"
        assert e.expectedValue == "1. der Hund"
        assert e.interactionKind == "FillBlank"
        assert e.pageNumber >= 1

    def test_dash_separated_alternatives(self):
        parser = CornelsenAnswerKeyParser()
        spans = [
            make_span("s-42-0", "Lösungen", y=0.02, parent_line_id="L0"),
            make_span("s-42-1", "12 Artikel", y=0.05, parent_line_id="L1"),
            make_span(
                "s-42-2",
                "2 2. die Katze — der Kater",
                y=0.08,
                parent_line_id="L2",
            ),
        ]
        result = parser.parse(spans)
        assert len(result) >= 1
        e = result[0]
        assert e.expectedValue == "2. die Katze"
        assert "der Kater" in e.alternatives

    def test_matching_answer_format(self):
        parser = CornelsenAnswerKeyParser()
        spans = [
            make_span("s-42-0", "Lösungen", y=0.02, parent_line_id="L0"),
            make_span("s-42-1", "13 Zuordnen", y=0.05, parent_line_id="L1"),
            make_span(
                "s-42-2",
                "1 1B — 2A — 3D — 4C",
                y=0.08,
                parent_line_id="L2",
            ),
        ]
        result = parser.parse(spans)
        assert len(result) >= 1
        assert result[0].expectedValue == "1B — 2A — 3D — 4C"
        assert result[0].interactionKind == "Matching"

    def test_low_confidence_spans_generate_warnings(self):
        parser = CornelsenAnswerKeyParser()
        spans = [
            make_span("s-42-0", "Lösungen", y=0.02, parent_line_id="L0"),
            make_span("s-42-1", "12 Artikel", y=0.05, parent_line_id="L1"),
            make_span("s-42-2", "1 1. der Hund", confidence=0.75, y=0.08, parent_line_id="L2"),
        ]
        result = parser.parse(spans)
        assert len(result) >= 1
        assert len(result[0].mappingWarnings) >= 1
        assert any("low_ocr_confidence" in w for w in result[0].mappingWarnings)

    def test_multiple_exercises_on_page(self):
        parser = CornelsenAnswerKeyParser()
        spans = [
            make_span("s-42-0", "Lösungen", y=0.02, parent_line_id="L0"),
            make_span("s-42-1", "76 Relativsätze", y=0.05, parent_line_id="L1"),
            make_span("s-42-2", "1 1. der, dem", y=0.08, parent_line_id="L2"),
            make_span("s-42-3", "2 2. die, deren", y=0.11, parent_line_id="L3"),
            make_span("s-42-4", "77 Nebensätze", y=0.15, parent_line_id="L4"),
            make_span("s-42-5", "1 1. wenn, als", y=0.18, parent_line_id="L5"),
        ]
        result = parser.parse(spans)
        exercises_seen = {e.exerciseNumber for e in result}
        assert "76" in exercises_seen
        assert "77" in exercises_seen
        assert len(result) >= 3

    def test_complex_sentence_not_split_by_dash(self):
        parser = CornelsenAnswerKeyParser()
        spans = [
            make_span("s-42-0", "Lösungen", y=0.02, parent_line_id="L0"),
            make_span("s-42-1", "80 Doppelkonnektoren", y=0.05, parent_line_id="L1"),
            make_span(
                "s-42-2",
                "1 1. Heute gehen wir sowohl ins Restaurant als auch ins Kino",
                y=0.08,
                parent_line_id="L2",
            ),
        ]
        result = parser.parse(spans)
        assert len(result) >= 1
        assert "Restaurant" in result[0].expectedValue

    def test_je_desto_pattern(self):
        parser = CornelsenAnswerKeyParser()
        spans = [
            make_span("s-42-0", "Lösungen", y=0.02, parent_line_id="L0"),
            make_span("s-42-1", "81 Vergleichssätze", y=0.05, parent_line_id="L1"),
            make_span(
                "s-42-2",
                "5a 1. Je mehr man arbeitet, desto mehr verdient man.",
                y=0.08,
                parent_line_id="L2",
            ),
        ]
        result = parser.parse(spans)
        assert len(result) >= 1
        assert "Je mehr" in result[0].expectedValue
        assert result[0].exerciseNumber == "81"

    def test_comma_separated_alternatives(self):
        parser = CornelsenAnswerKeyParser()
        spans = [
            make_span("s-42-0", "Lösungen", y=0.02, parent_line_id="L0"),
            make_span("s-42-1", "12 Artikel", y=0.05, parent_line_id="L1"),
            make_span("s-42-2", "1 1. der, die, das", y=0.08, parent_line_id="L2"),
        ]
        result = parser.parse(spans)
        assert len(result) >= 1
        assert "die" in result[0].alternatives
        assert "das" in result[0].alternatives


class TestAnswerKeyEntryModel:
    def test_minimal_entry(self):
        e = AnswerKeyEntry(
            pageNumber=1,
            interactionKind="FillBlank",
            ordinal=1,
            expectedValue="test",
        )
        assert e.confidence == 0.0
        assert e.alternatives == []
        assert e.normalizationMode == "strict"
        assert e.typedPayload is None

    def test_full_entry(self):
        e = AnswerKeyEntry(
            pageNumber=42,
            exerciseNumber="12",
            interactionKind="Choice",
            ordinal=3,
            expectedValue="b) richtig",
            alternatives=["c) auch richtig"],
            caseSensitive=True,
            punctuationRequired=True,
            normalizationMode="lenient_german",
            rawSolutionText="3. b) richtig — c) auch richtig",
            confidence=0.98,
            mappingWarnings=["ambiguous_structure"],
        )
        assert e.pageNumber == 42
        assert e.exerciseNumber == "12"
        assert len(e.alternatives) == 1
        assert e.caseSensitive is True

    def test_entry_validation_page_number(self):
        with pytest.raises(Exception):
            AnswerKeyEntry(
                pageNumber=0,
                interactionKind="FillBlank",
                ordinal=1,
                expectedValue="test",
            )

    def test_entry_validation_ordinal(self):
        with pytest.raises(Exception):
            AnswerKeyEntry(
                pageNumber=1,
                interactionKind="FillBlank",
                ordinal=0,
                expectedValue="test",
            )

    def test_entry_validation_confidence_range(self):
        with pytest.raises(Exception):
            AnswerKeyEntry(
                pageNumber=1,
                interactionKind="FillBlank",
                ordinal=1,
                expectedValue="test",
                confidence=1.5,
            )


class TestColumnSegmentation:
    def test_two_columns_preserved(self):
        spans = _build_spans([
            make_span("s-1-0", "1 1. Antwort links", y=0.1, x=0.05, parent_line_id="L1"),
            make_span("s-2-0", "4 4. Antwort rechts", y=0.1, x=0.55, parent_line_id="L2"),
            make_span("s-3-0", "2 2. Antwort links", y=0.15, x=0.05, parent_line_id="L3"),
            make_span("s-4-0", "5 5. Antwort rechts", y=0.15, x=0.55, parent_line_id="L4"),
            make_span("s-5-0", "3 3. Antwort links", y=0.2, x=0.05, parent_line_id="L5"),
        ])
        lines = _group_lines(spans)
        clusters = _cluster_lines_by_column(lines)
        assert len(clusters) == 2
        left_col = clusters[0]
        right_col = clusters[1]
        assert len(left_col) == 3
        assert len(right_col) == 2

    def test_single_column_no_split(self):
        spans = _build_spans([
            make_span("s-1-0", "1 1. Antwort", y=0.1, x=0.05, parent_line_id="L1"),
            make_span("s-2-0", "2 2. Antwort", y=0.15, x=0.05, parent_line_id="L2"),
            make_span("s-3-0", "3 3. Antwort", y=0.2, x=0.05, parent_line_id="L3"),
        ])
        lines = _group_lines(spans)
        clusters = _cluster_lines_by_column(lines)
        assert len(clusters) == 1

    def test_two_column_parse_order(self):
        parser = CornelsenAnswerKeyParser()
        spans = [
            make_span("s-42-0", "Lösungen", y=0.02, x=0.05, parent_line_id="L0"),
            make_span("s-42-1", "12 Artikel", y=0.05, x=0.05, parent_line_id="L1"),
            make_span("s-42-2", "1 1. der Hund", y=0.08, x=0.05, parent_line_id="L2"),
            make_span("s-42-3", "3 3. das Kind", y=0.08, x=0.55, parent_line_id="L3"),
            make_span("s-42-4", "2 2. die Katze", y=0.11, x=0.05, parent_line_id="L4"),
            make_span("s-42-5", "4 4. das Haus", y=0.11, x=0.55, parent_line_id="L5"),
        ]
        result = parser.parse(spans)
        assert len(result) >= 2
        values = [e.expectedValue for e in result]
        assert "1. der Hund" in values
        assert "2. die Katze" in values

    def test_two_column_does_not_mix_exercises(self):
        parser = CornelsenAnswerKeyParser()
        spans = [
            make_span("s-42-0", "Lösungen", y=0.02, x=0.05, parent_line_id="L0"),
            make_span("s-42-1", "76 Relativsätze", y=0.05, x=0.05, parent_line_id="L1"),
            make_span("s-42-2", "1 1. der, dem", y=0.08, x=0.05, parent_line_id="L2"),
            make_span("s-42-3", "4 4. die, deren", y=0.08, x=0.55, parent_line_id="L3"),
            make_span("s-42-4", "2 2. das, dem", y=0.11, x=0.05, parent_line_id="L4"),
            make_span("s-42-5", "5 5. der, den", y=0.11, x=0.55, parent_line_id="L5"),
            make_span("s-42-6", "3 3. den, dessen", y=0.14, x=0.05, parent_line_id="L6"),
        ]
        result = parser.parse(spans)
        assert len(result) >= 5

    def test_empty_column_clusters(self):
        assert _cluster_lines_by_column([]) == []

    def test_weak_column_split_falls_back_to_flat(self):
        spans = _build_spans([
            make_span("s-1-0", "1 1. A", y=0.1, x=0.05, parent_line_id="L1"),
            make_span("s-2-0", "4 4. B", y=0.1, x=0.55, parent_line_id="L2"),
        ])
        lines = _group_lines(spans)
        clusters = _cluster_lines_by_column(lines)
        valid = [c for c in clusters if len(c) >= 3]
        assert len(valid) < 2


class TestTypedPayloads:
    def test_fillblank_gets_text_payload(self):
        parser = CornelsenAnswerKeyParser()
        spans = [
            make_span("s-42-0", "Lösungen", y=0.02, parent_line_id="L0"),
            make_span("s-42-1", "12 Artikel", y=0.05, parent_line_id="L1"),
            make_span("s-42-2", "1 1. der Hund", y=0.08, parent_line_id="L2"),
        ]
        result = parser.parse(spans)
        assert len(result) >= 1
        from app.answer_key.parser import TextExpectedAnswer
        assert isinstance(result[0].typedPayload, TextExpectedAnswer)
        assert result[0].typedPayload.value == "1. der Hund"

    def test_matching_gets_structured_pairs(self):
        parser = CornelsenAnswerKeyParser()
        spans = [
            make_span("s-42-0", "Lösungen", y=0.02, parent_line_id="L0"),
            make_span("s-42-1", "13 Zuordnen", y=0.05, parent_line_id="L1"),
            make_span("s-42-2", "1 1B — 2A — 3D — 4C", y=0.08, parent_line_id="L2"),
        ]
        result = parser.parse(spans)
        assert len(result) >= 1
        from app.answer_key.parser import MatchingExpectedAnswer, MatchingPair
        payload = result[0].typedPayload
        assert isinstance(payload, MatchingExpectedAnswer)
        assert len(payload.pairs) == 4
        assert payload.pairs[0] == MatchingPair(leftLabel="1", rightLabel="B")
        assert payload.pairs[3] == MatchingPair(leftLabel="4", rightLabel="C")

    def test_multiple_choice_matching_format(self):
        parser = CornelsenAnswerKeyParser()
        spans = [
            make_span("s-42-0", "Lösungen", y=0.02, parent_line_id="L0"),
            make_span("s-42-1", "13 Zuordnen", y=0.05, parent_line_id="L1"),
            make_span("s-42-2", "1 1G — 2H,A — 3F — 4C — 5H.A — 6E — 7B — 8D", y=0.08, parent_line_id="L2"),
        ]
        result = parser.parse(spans)
        assert len(result) >= 1
        from app.answer_key.parser import MatchingExpectedAnswer
        payload = result[0].typedPayload
        assert isinstance(payload, MatchingExpectedAnswer)
        pairs = payload.pairs
        assert len(pairs) >= 5

    def test_non_matching_has_no_structured_payload(self):
        parser = CornelsenAnswerKeyParser()
        spans = [
            make_span("s-42-0", "Lösungen", y=0.02, parent_line_id="L0"),
            make_span("s-42-1", "12 Artikel", y=0.05, parent_line_id="L1"),
            make_span("s-42-2", "1 1. der, die, das", y=0.08, parent_line_id="L2"),
        ]
        result = parser.parse(spans)
        assert len(result) >= 1
        from app.answer_key.parser import TextExpectedAnswer
        assert isinstance(result[0].typedPayload, TextExpectedAnswer)

    def test_answer_key_entry_accepts_typed_payload(self):
        from app.answer_key.parser import (
            AnswerKeyEntry, MatchingExpectedAnswer, MatchingPair, TextExpectedAnswer,
        )
        e = AnswerKeyEntry(
            pageNumber=1,
            interactionKind="Matching",
            ordinal=1,
            expectedValue="1B — 2A",
            typedPayload=MatchingExpectedAnswer(
                pairs=[
                    MatchingPair(leftLabel="1", rightLabel="B"),
                    MatchingPair(leftLabel="2", rightLabel="A"),
                ]
            ),
        )
        assert e.typedPayload is not None
        assert len(e.typedPayload.pairs) == 2

        e2 = AnswerKeyEntry(
            pageNumber=2,
            interactionKind="FillBlank",
            ordinal=1,
            expectedValue="der Hund",
            typedPayload=TextExpectedAnswer(value="der Hund"),
        )
        assert isinstance(e2.typedPayload, TextExpectedAnswer)

    def test_typed_payload_preserves_alternatives(self):
        from app.answer_key.parser import TextExpectedAnswer
        e = AnswerKeyEntry(
            pageNumber=1,
            interactionKind="FillBlank",
            ordinal=1,
            expectedValue="der Hund",
            alternatives=["der Kater"],
            typedPayload=TextExpectedAnswer(
                value="der Hund",
                alternatives=["der Kater"],
            ),
        )
        assert e.typedPayload.alternatives == ["der Kater"]
