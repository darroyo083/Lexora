"""Public-safe regression tests for answer-key unit identity extraction."""

from app.answer_key.cornelsen_parser import CornelsenAnswerKeyParser, _split_numbered_items
from tests.test_answer_key.fixtures import make_span


def spans_for(lines, page: int = 20):
    return [
        make_span(f"span-{page}-{index}", text, y=y, parent_line_id=f"L{index}")
        for index, (y, text) in enumerate(lines)
    ]


def parse_lines(lines, page: int = 20):
    return CornelsenAnswerKeyParser().parse(spans_for(lines, page))


SOLUTIONS = [(0.03, "Lösungen")]


class TestValidatedUnitHeaders:
    def test_single_line_header_sets_unit_number(self):
        entries = parse_lines(SOLUTIONS + [
            (0.06, "10 Synthetic practice"),
            (0.10, "2 1. morgens – 2. abends"),
            (0.13, "3 1. Ich lerne heute. – 2. Wir üben morgen."),
        ])
        assert len(entries) == 2
        assert all(entry.unitNumber == 10 for entry in entries)
        assert [entry.subExerciseMarker for entry in entries] == ["2", "3"]

    def test_number_and_title_lines_form_a_header(self):
        entries = parse_lines(SOLUTIONS + [
            (0.06, "15"),
            (0.061, "Synthetic review"),
            (0.10, "1 1. ruhig – 2. freundlich – 3. deutlich"),
        ])
        assert len(entries) == 1
        assert entries[0].unitNumber == 15
        assert entries[0].subExerciseMarker == "1"

    def test_headers_transition_monotonically(self):
        entries = parse_lines(SOLUTIONS + [
            (0.05, "10 Synthetic practice"),
            (0.10, "1 1. A – 2. B"),
            (0.16, "12 Synthetic directions"),
            (0.22, "1 1C-2A-3B"),
            (0.28, "13 Synthetic review"),
            (0.34, "1 1. vorher – 2. nachher"),
        ])
        assert [entry.unitNumber for entry in entries] == [10, 12, 13]

    def test_standalone_marker_is_not_a_header(self):
        entries = parse_lines(SOLUTIONS + [
            (0.05, "14 Synthetic descriptions"),
            (0.10, "2"),
            (0.101, "das kleine Haus – der grüne Baum"),
            (0.15, "3 1. ein heller Raum – 2. eine offene Tür"),
        ])
        assert len(entries) == 2
        assert all(entry.unitNumber == 14 for entry in entries)
        assert [entry.subExerciseMarker for entry in entries] == ["2", "3"]

    def test_footer_number_is_rejected(self):
        entries = parse_lines(SOLUTIONS + [
            (0.06, "10 Synthetic practice"),
            (0.10, "1 1. A – 2. B"),
            (0.96, "99"),
        ])
        assert len(entries) == 1
        assert entries[0].unitNumber == 10

    def test_decreasing_header_candidate_is_rejected(self):
        entries = parse_lines(SOLUTIONS + [
            (0.05, "15 Synthetic review"),
            (0.10, "1 1. ruhig"),
            (0.15, "14"),
            (0.151, "Earlier section"),
            (0.20, "2 1. freundlich"),
        ])
        assert len(entries) == 2
        assert all(entry.unitNumber == 15 for entry in entries)

    def test_content_without_header_fails_closed(self):
        assert parse_lines(SOLUTIONS + [(0.10, "2 1. A – 2. B")]) == []

    def test_malformed_ocr_does_not_crash(self):
        assert parse_lines([(0.03, "Lösungen"), (0.05, "##$$"), (0.10, "???")]) == []


class TestItemSplit:
    def test_numbered_items_split_cleanly(self):
        raw = "1. ruhig – 2. freundlich – 3. deutlich – 4. aufmerksam"
        assert _split_numbered_items(raw) == ["ruhig", "freundlich", "deutlich", "aufmerksam"]

    def test_single_sentence_does_not_split(self):
        assert _split_numbered_items("Heute üben wir gemeinsam.") is None

    def test_unclean_split_returns_none(self):
        assert _split_numbered_items("1. only one item") is None
        assert _split_numbered_items("1. a – 2.") is None

    def test_entries_retain_split_items(self):
        entries = parse_lines(SOLUTIONS + [
            (0.05, "15 Synthetic review"),
            (0.10, "1 1. ruhig – 2. freundlich – 3. deutlich"),
        ])
        assert entries[0].items == ["ruhig", "freundlich", "deutlich"]
        assert entries[0].expectedValue
