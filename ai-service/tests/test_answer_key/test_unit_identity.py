"""Regression tests for unit identity extraction (mapping spike implementation).

Proves the OLD standalone-number heuristic would misattribute identity and
that the validated section-header rules reject footers, column markers and
repeated markers while preserving the sub-exercise marker.
"""
import pytest

from app.answer_key.cornelsen_parser import CornelsenAnswerKeyParser, _split_numbered_items
from tests.test_answer_key.fixtures import make_span


def spans_for(lines, page: int = 228):
    """lines: list of (y, text) pairs -> OCR spans with span-{page} ids."""
    spans = []
    for idx, (y, text) in enumerate(lines):
        spans.append(make_span(f"span-{page}-{idx}", text, y=y, parent_line_id=f"L{idx}"))
    return spans


def parse_lines(lines, page: int = 228):
    return CornelsenAnswerKeyParser().parse(spans_for(lines, page))


LOESUNGEN = [(0.03, "Lösungen")]


class TestValidatedUnitHeaders:
    def test_single_line_header_sets_unit_number(self):
        entries = parse_lines(LOESUNGEN + [
            (0.06, "80 Doppelkonnektoren"),
            (0.10, "2 1. sowohl ... als auch – 2. weder ... noch"),
            (0.13, "31. Heute gehen wir sowohl ins Restaurant als auch ins Kino."),
        ])
        assert len(entries) == 2
        assert all(e.unitNumber == 80 for e in entries)
        assert all(e.exerciseNumber == "80" for e in entries)

    def test_number_line_plus_title_line_header(self):
        # Header split across two OCR lines at the same y (real layout).
        lines = LOESUNGEN + [
            (0.06, "85"),
            (0.061, "Partizip 1 als Adjektiv"),
            (0.10, "1 1. startendes – 2. aufgehende – 3. brennende"),
        ]
        entries = parse_lines(lines, page=230)
        assert len(entries) == 1
        assert entries[0].unitNumber == 85
        assert entries[0].subExerciseMarker == "1"

    def test_header_transitions(self):
        lines = LOESUNGEN + [
            (0.05, "80 Doppelkonnektoren"),
            (0.10, "1 1. sowohl – 2. weder"),
            (0.16, "82 Präpositionen mit Genitiv"),
            (0.22, "1 1B-2D-3A-4C"),
            (0.28, "83 Temporale Präpositionen 2"),
            (0.34, "1 1. Vor - 2. Nach"),
        ]
        entries = parse_lines(lines)
        units = [e.unitNumber for e in entries]
        assert units == [80, 82, 83]

    def test_marker_inside_section_not_header(self):
        # A standalone "2" followed by dash-separated answer text must NOT
        # become a header; the section stays 84 and the marker is captured.
        lines = LOESUNGEN + [
            (0.05, "84 Adjektivdeklination mit und ohne Artikel"),
            (0.10, "2"),
            (0.101, "das fahrende Auto – der fahrende Mann – der lesende Mann"),
            (0.15, "31. ein weinendes Kind – 2. eine spielende Katze"),
        ]
        entries = parse_lines(lines, page=230)
        assert len(entries) == 1
        assert entries[0].unitNumber == 84
        assert entries[0].subExerciseMarker == "3"

    def test_multicolumn_marker_not_header(self):
        # "6" followed by a dash-separated answer sentence.
        lines = LOESUNGEN + [
            (0.05, "82 Präpositionen mit Genitiv"),
            (0.10, "1 1B-2D-3A-4C"),
            (0.15, "6"),
            (0.151, "Wegen des Schnees muss man vorsichtig fahren. – Während des Laufens hört er Musik."),
            (0.22, "2 1D-2C-3A-4B"),
        ]
        entries = parse_lines(lines)
        assert len(entries) == 2
        assert all(e.unitNumber == 82 for e in entries)
        assert [e.subExerciseMarker for e in entries] == ["1", "2"]

    def test_page_footer_rejected(self):
        # Footers 232/234 sit at y > 0.9 and must never become identity.
        lines = LOESUNGEN + [
            (0.06, "80 Doppelkonnektoren"),
            (0.10, "1 1. sowohl – 2. weder"),
            (0.96, "232"),
        ]
        entries = parse_lines(lines)
        assert len(entries) == 1
        assert entries[0].unitNumber == 80
        assert all(e.unitNumber != 232 for e in entries)

    def test_unit_exercise_number_collision(self):
        # "2" as an exercise marker inside unit 85 must not create unit 2.
        lines = LOESUNGEN + [
            (0.05, "85 Partizip 1 als Adjektiv"),
            (0.10, "2"),
            (0.101, "das fahrende Auto – der fahrende Mann"),
            (0.16, "3 1. ein weinendes Kind – 2. eine spielende Katze"),
        ]
        entries = parse_lines(lines, page=230)
        assert len(entries) == 1
        assert entries[0].unitNumber == 85

    def test_monotonic_regression(self):
        # After header 85, a candidate 84 must be rejected; both entries stay
        # under unit 85.
        lines = LOESUNGEN + [
            (0.05, "85 Partizip 1 als Adjektiv"),
            (0.10, "1 1. startendes"),
            (0.15, "84"),
            (0.151, "Deutsches Bier"),
            (0.20, "1 1. der gute Kaffee"),
        ]
        entries = parse_lines(lines)
        assert len(entries) == 2
        assert all(e.unitNumber == 85 for e in entries)

    def test_no_header_entries_dropped(self):
        # Without a validated section header no identity exists: answer
        # content is dropped (fail-closed), never assigned a fake unit.
        lines = LOESUNGEN + [
            (0.10, "2 1. das Schnitzel – 2. die Pizza"),
        ]
        entries = parse_lines(lines)
        assert entries == []

    def test_malformed_ocr_no_crash(self):
        lines = [(0.03, "Lösungen"), (0.05, "##$$"), (0.10, "???"), (0.15, "12")]
        entries = parse_lines(lines)
        assert entries == []

    def test_marker_preserved_forms(self):
        lines = LOESUNGEN + [
            (0.05, "85 Partizip 1 als Adjektiv"),
            (0.10, "2 1. startendes"),
            (0.13, "31. Heute gehen wir ins Kino."),
            (0.16, "11C-2D-3B-4A"),
            (0.19, "5a 1. Je mehr man arbeitet, desto mehr verdient man."),
        ]
        entries = parse_lines(lines)
        assert [e.subExerciseMarker for e in entries] == ["2", "3", "1", "5a"]

    def test_sequential_lines_keep_marker(self):
        lines = LOESUNGEN + [
            (0.05, "85 Partizip 1 als Adjektiv"),
            (0.10, "1 1. startendes – 2. aufgehende"),
            (0.13, "3. brennende – 4. sinkende"),
        ]
        entries = parse_lines(lines)
        assert len(entries) == 1
        assert entries[0].subExerciseMarker == "1"
        assert "3. brennende – 4. sinkende" in entries[0].rawSolutionText


class TestItemSplit:
    def test_nine_item_partizip_block(self):
        raw = ("1. startendes – 2. aufgehende – 3. brennende – 4. sinkende - "
               "5. kochendes – 6. steigende – 7. ankommender - 8. fliegende - "
               "9. alleinerziehende")
        items = _split_numbered_items(raw)
        assert items == ["startendes", "aufgehende", "brennende", "sinkende",
                         "kochendes", "steigende", "ankommender", "fliegende",
                         "alleinerziehende"]

    def test_seven_item_sie_er_block(self):
        raw = "5 1. Sie - 2. Er = 3. Er = 4. wir - 5. Sie = 6.Wir- 7. Er="
        items = _split_numbered_items(raw)
        assert items == ["Sie", "Er", "Er", "wir", "Sie", "Wir", "Er"]

    def test_single_sentence_no_split(self):
        assert _split_numbered_items("Heute gehen wir ins Kino.") is None
        assert _split_numbered_items("1. Heute gehen wir ins Kino. / Heute gehen wir nicht nur ins Kino.") is None

    def test_entries_carry_items(self):
        lines = LOESUNGEN + [
            (0.05, "85 Partizip 1 als Adjektiv"),
            (0.10, "1 1. startendes – 2. aufgehende – 3. brennende – 4. sinkende"),
        ]
        entries = parse_lines(lines, page=230)
        assert entries[0].items == ["startendes", "aufgehende", "brennende", "sinkende"]
        assert entries[0].expectedValue  # evidence retained

    def test_unclean_split_returns_none(self):
        assert _split_numbered_items("1. only one item") is None
        assert _split_numbered_items("1. a – 2.") is None
