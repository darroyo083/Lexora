"""Public-safe contract and parsing tests for the optional local parser."""

import pytest

from app.answer_key.cornelsen_parser import (
    CornelsenAnswerKeyParser,
    EXERCISE_HEADER_RE,
    SUB_EXERCISE_RE,
    _build_spans,
    _cluster_lines_by_column,
    _group_lines,
    _infer_interaction_kind,
    _line_text,
)
from app.answer_key.parser import (
    AnswerKeyEntry,
    AnswerKeyParser,
    MatchingExpectedAnswer,
    MatchingPair,
    TextExpectedAnswer,
)
from app.answer_key.stub_parser import StubAnswerKeyParser
from tests.test_answer_key.fixtures import make_span


def solution_spans(*lines: tuple[str, float, float]):
    spans = [make_span("s-0", "Lösungen", y=0.02, parent_line_id="L0")]
    for index, (text, y, x) in enumerate(lines, start=1):
        spans.append(make_span(f"s-{index}", text, y=y, x=x, parent_line_id=f"L{index}"))
    return spans


class TestParserBoundary:
    @pytest.mark.parametrize("parser", [CornelsenAnswerKeyParser(), StubAnswerKeyParser()])
    def test_parsers_implement_boundary(self, parser):
        assert isinstance(parser, AnswerKeyParser)
        assert isinstance(parser.parse([make_span("s", "Lösungen", y=0.02)]), list)

    def test_publishers_are_explicit(self):
        assert CornelsenAnswerKeyParser().publisher() == "cornelsen"
        assert StubAnswerKeyParser().publisher() == "stub"


class TestSpanAndLineHelpers:
    def test_build_spans_skips_whitespace_and_retains_confidence(self):
        result = _build_spans([
            make_span("blank", "   "),
            make_span("word", "Hallo", confidence=0.95, x=0.2, y=0.1),
        ])
        assert len(result) == 1
        assert result[0].text == "Hallo"
        assert result[0].confidence == 0.95

    def test_group_lines_and_join_in_x_order(self):
        spans = _build_spans([
            make_span("second", "second", x=0.5, y=0.1, parent_line_id="L1"),
            make_span("first", "first", x=0.1, y=0.1, parent_line_id="L1"),
            make_span("other", "other", x=0.1, y=0.2, parent_line_id="L2"),
        ])
        groups = _group_lines(spans)
        assert len(groups) == 2
        assert _line_text(groups[0]) == "first second"

    def test_empty_helpers_are_stable(self):
        assert _build_spans([]) == []
        assert _group_lines([]) == []
        assert _cluster_lines_by_column([]) == []


class TestHeaderAndKindDetection:
    def test_headers_accept_numbers_titles_and_dots(self):
        match = EXERCISE_HEADER_RE.match("10 Synthetic practice A.1")
        assert match is not None
        assert match.group("num") == "10"
        assert match.group("title") == "Synthetic practice A.1"

    def test_header_rejects_plain_text_and_numbered_answer(self):
        assert EXERCISE_HEADER_RE.match("This is not a header") is None
        assert EXERCISE_HEADER_RE.match("1. alpha") is None

    def test_sub_exercise_markers_support_suffixes(self):
        assert SUB_EXERCISE_RE.match("1 1. alpha – 2. beta").group("marker") == "1"
        assert SUB_EXERCISE_RE.match("5a 1. alpha").group("marker") == "5a"
        assert SUB_EXERCISE_RE.match("Lösungen") is None

    @pytest.mark.parametrize(("title", "kind"), [
        ("Relativsatz-Training", "FillBlank"),
        ("Adjektiv-Training", "FillBlank"),
        ("Sätze zuordnen", "Matching"),
        ("Satzstellung trainieren", "SentenceOrdering"),
        ("Wortstellung trainieren", "SentenceOrdering"),
        ("Unknown synthetic exercise", "FillBlank"),
    ])
    def test_interaction_kind_inference(self, title, kind):
        assert _infer_interaction_kind(title) == kind


class TestCornelsenParse:
    def test_empty_or_missing_solution_header_fails_closed(self):
        parser = CornelsenAnswerKeyParser()
        assert parser.parse([]) == []
        assert parser.parse([make_span("s", "Keine Lösungen hier", y=0.1)]) == []

    def test_simple_entry_and_low_confidence_warning(self):
        result = CornelsenAnswerKeyParser().parse(solution_spans(
            ("10 Synthetic practice", 0.05, 0.1),
            ("1 1. alpha", 0.08, 0.1),
        ))
        assert len(result) == 1
        assert result[0].exerciseNumber == "10"
        assert result[0].expectedValue == "1. alpha"
        assert result[0].interactionKind == "FillBlank"

        spans = solution_spans(
            ("10 Synthetic practice", 0.05, 0.1),
            ("1 1. alpha", 0.08, 0.1),
        )
        spans[-1]["confidence"] = 0.75
        warned = CornelsenAnswerKeyParser().parse(spans)
        assert any("low_ocr_confidence" in warning for warning in warned[0].mappingWarnings)

    def test_alternatives_and_matching_payload(self):
        alternatives = CornelsenAnswerKeyParser().parse(solution_spans(
            ("10 Synthetic practice", 0.05, 0.1),
            ("2 2. alpha — beta", 0.08, 0.1),
        ))
        assert alternatives[0].expectedValue == "2. alpha"
        assert "beta" in alternatives[0].alternatives

        matching = CornelsenAnswerKeyParser().parse(solution_spans(
            ("11 Sätze zuordnen", 0.05, 0.1),
            ("1 1B — 2A — 3D — 4C", 0.08, 0.1),
        ))
        payload = matching[0].typedPayload
        assert isinstance(payload, MatchingExpectedAnswer)
        assert payload.pairs[0] == MatchingPair(leftLabel="1", rightLabel="B")
        assert payload.pairs[-1] == MatchingPair(leftLabel="4", rightLabel="C")

    def test_multiple_synthetic_units_do_not_mix(self):
        result = CornelsenAnswerKeyParser().parse(solution_spans(
            ("10 Synthetic practice", 0.05, 0.1),
            ("1 1. alpha, beta", 0.08, 0.1),
            ("2 2. gamma, delta", 0.11, 0.1),
            ("11 Synthetic review", 0.15, 0.1),
            ("1 1. vorher, nachher", 0.18, 0.1),
        ))
        assert {entry.exerciseNumber for entry in result} == {"10", "11"}
        assert len(result) == 3

    def test_numbered_items_become_typed_text_payload(self):
        result = CornelsenAnswerKeyParser().parse(solution_spans(
            ("10 Synthetic practice", 0.05, 0.1),
            ("1 1. alpha – 2. beta – 3. gamma", 0.08, 0.1),
        ))
        assert isinstance(result[0].typedPayload, TextExpectedAnswer)
        assert result[0].items == ["alpha", "beta", "gamma"]


class TestColumnSegmentation:
    def test_two_columns_are_preserved(self):
        spans = _build_spans([
            make_span("l1", "1 1. left", y=0.10, x=0.05, parent_line_id="L1"),
            make_span("r1", "4 4. right", y=0.10, x=0.55, parent_line_id="R1"),
            make_span("l2", "2 2. left", y=0.15, x=0.05, parent_line_id="L2"),
            make_span("r2", "5 5. right", y=0.15, x=0.55, parent_line_id="R2"),
            make_span("l3", "3 3. left", y=0.20, x=0.05, parent_line_id="L3"),
        ])
        clusters = _cluster_lines_by_column(_group_lines(spans))
        assert [len(cluster) for cluster in clusters] == [3, 2]

    def test_single_column_stays_single(self):
        spans = _build_spans([
            make_span(f"s{i}", f"{i} {i}. answer", y=0.1 + i * 0.05, x=0.05,
                      parent_line_id=f"L{i}")
            for i in range(1, 4)
        ])
        assert len(_cluster_lines_by_column(_group_lines(spans))) == 1


class TestAnswerKeyEntryModel:
    def test_defaults_and_typed_payload(self):
        entry = AnswerKeyEntry(
            pageNumber=1,
            interactionKind="FillBlank",
            ordinal=1,
            expectedValue="alpha",
            alternatives=["beta"],
            typedPayload=TextExpectedAnswer(value="alpha", alternatives=["beta"]),
        )
        assert entry.confidence == 0.0
        assert entry.normalizationMode == "strict"
        assert entry.typedPayload.alternatives == ["beta"]

    @pytest.mark.parametrize(("field", "value"), [
        ("pageNumber", 0),
        ("ordinal", 0),
        ("confidence", 1.5),
    ])
    def test_validation_rejects_invalid_ranges(self, field, value):
        values = dict(pageNumber=1, interactionKind="FillBlank", ordinal=1,
                      expectedValue="alpha", confidence=0.5)
        values[field] = value
        with pytest.raises(Exception):
            AnswerKeyEntry(**values)
