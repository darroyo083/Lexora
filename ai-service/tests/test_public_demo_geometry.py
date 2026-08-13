from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts" / "public_demo_geometry.py"
SPEC = importlib.util.spec_from_file_location("public_demo_geometry", MODULE_PATH)
assert SPEC and SPEC.loader
geometry = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(geometry)


def load_page_two() -> dict:
    return json.loads(geometry.PAGE_TWO.read_text(encoding="utf-8"))


def test_checked_in_page_two_matches_authored_geometry() -> None:
    analysis = load_page_two()

    normalized = geometry.normalize_public_demo_page_two(analysis)

    assert normalized == analysis
    assert normalized["processor"]["parameters"]["geometryNormalization"] == (
        "lexora-synthetic-source-v1"
    )


def test_authored_geometry_is_idempotent_and_contains_controls() -> None:
    normalized = geometry.normalize_public_demo_page_two(load_page_two())
    assert geometry.normalize_public_demo_page_two(normalized) == normalized
    for row in normalized["choiceGrids"][0]["rows"]:
        for cell in row["cells"]:
            visual = cell["cellBbox"]
            target = cell["interactionBbox"]
            assert target["x"] <= visual["x"]
            assert target["y"] <= visual["y"]
            assert target["x"] + target["width"] >= visual["x"] + visual["width"]
            assert target["y"] + target["height"] >= visual["y"] + visual["height"]


def test_authored_geometry_fails_closed_for_wrong_source(tmp_path: Path) -> None:
    wrong_source = tmp_path / "wrong.pdf"
    wrong_source.write_bytes(b"not the synthetic workbook")

    with pytest.raises(ValueError, match="source SHA-256"):
        geometry.normalize_public_demo_page_two(load_page_two(), wrong_source)


def test_authored_geometry_fails_closed_for_wrong_page() -> None:
    analysis = load_page_two()
    analysis["pageNumber"] = 3

    with pytest.raises(ValueError, match="only to schema 0.2.0 page 2"):
        geometry.normalize_public_demo_page_two(analysis)
