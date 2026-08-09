"""Encoding repair tests (light, no paddle)."""

from app.document.encoding import repair_utf8


class TestRepairUtf8:
    def test_double_encoded_umlaut(self):
        # "hei\u00dfen" double-encoded: UTF-8 bytes (C3 9F) decoded as latin-1
        mojibake = "hei\u00c3\u009fen"
        assert repair_utf8(mojibake) == "hei\u00dfen"

    def test_double_encoded_en_dash(self):
        # U+2013 (E2 80 93) decoded as latin-1 -> "â€“"
        mojibake = "a \u00e2\u0080\u0093 b"
        assert repair_utf8(mojibake) == "a \u2013 b"

    def test_clean_text_unchanged(self):
        assert repair_utf8("der Mann") == "der Mann"
        assert repair_utf8("M\u00fcnchen") == "M\u00fcnchen"  # genuine umlaut

    def test_mixed_mojibake_and_clean(self):
        mojibake = "das fahrende Auto \u00e2\u0080\u0093 der fahrende Mann \u00c3\u009f"
        assert repair_utf8(mojibake) == "das fahrende Auto \u2013 der fahrende Mann \u00df"

    def test_empty_and_ascii(self):
        assert repair_utf8("") == ""
        assert repair_utf8("123 ABC") == "123 ABC"

    def test_unreadable_sequence_left_untouched(self):
        # A sequence that cannot round-trip must not be altered.
        assert repair_utf8("x\u00fc y") == "x\u00fc y"
