"""Deterministic text-encoding repair helpers (no heavy dependencies)."""


def repair_utf8(text: str) -> str:
    """Repair double-encoded UTF-8 (UTF-8 bytes decoded as latin-1/cp1252).

    Applied when the latin-1 -> utf-8 round-trip succeeds cleanly and yields
    no control characters. Clean text that cannot be decoded (e.g. genuine
    umlauts) is left untouched.
    """
    try:
        repaired = text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text
    if any(ord(c) < 32 for c in repaired):
        return text
    return repaired
