"""Source-authoritative geometry for Lexora's synthetic public demo page 2.

This module performs no inference. It derives interaction boxes from the exact
pixel layout authored in ``generate-public-demo-workbook.py`` and applies them
only when the original synthetic PDF hash and expected analysis IDs match.
"""

from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEMO_DIR = ROOT / "backend" / "src" / "main" / "resources" / "demo"
SOURCE = DEMO_DIR / "lexora-synthetic-workbook.pdf"
PAGE_TWO = DEMO_DIR / "page-analysis-2.json"
SOURCE_SHA256 = "7185f637a2a55c22d4e3d846475e6bd6e1682b835f5c76fc76ae91e51aa8d7c9"
CANVAS_WIDTH = 1240
CANVAS_HEIGHT = 1754
NORMALIZATION_MARKER = "lexora-synthetic-source-v1"


def _bbox(x: int, y: int, width: int, height: int) -> dict[str, float]:
    return {
        "x": round(x / CANVAS_WIDTH, 6),
        "y": round(y / CANVAS_HEIGHT, 6),
        "width": round(width / CANVAS_WIDTH, 6),
        "height": round(height / CANVAS_HEIGHT, 6),
    }


def _require_ids(items: list[dict[str, Any]], expected: list[str], label: str) -> None:
    actual = [item.get("id") for item in items]
    if actual != expected:
        raise ValueError(f"Unexpected page-2 {label} IDs: {actual!r}")


def normalize_public_demo_page_two(
    analysis: dict[str, Any],
    source_path: Path = SOURCE,
) -> dict[str, Any]:
    source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
    if source_hash != SOURCE_SHA256:
        raise ValueError(f"Unexpected public-demo source SHA-256: {source_hash}")
    if analysis.get("schemaVersion") != "0.2.0" or analysis.get("pageNumber") != 2:
        raise ValueError("Authored geometry applies only to schema 0.2.0 page 2")

    normalized = deepcopy(analysis)
    grids = normalized.get("choiceGrids", [])
    matchings = normalized.get("matchingInteractions", [])
    blanks = normalized.get("exerciseBlanks", [])
    _require_ids(grids, ["se-4-grid"], "choice-grid")
    _require_ids(matchings, ["mi-1"], "matching")
    _require_ids(blanks, ["eb-1"], "blank")

    grid = grids[0]
    _require_ids(
        grid.get("rows", []),
        ["ct-bh-der-row", "ct-ap-der-row", "ct-mu-der-row", "ct-ma-der-row"],
        "choice-grid row",
    )
    grid["gridBbox"] = _bbox(650, 475, 340, 264)
    option_ids = ["opt-der", "opt-die", "opt-das"]
    option_centres = [690, 825, 960]
    for row_index, row in enumerate(grid["rows"]):
        row_y = 475 + row_index * 68
        row["rowBbox"] = _bbox(130, row_y, 880, 60)
        row_prefix = row["id"].removesuffix("-row")
        expected_cells = [f"{row_prefix}-cell-{option_id}" for option_id in option_ids]
        _require_ids(row.get("cells", []), expected_cells, f"{row['id']} cell")
        for cell, centre_x in zip(row["cells"], option_centres, strict=True):
            cell["cellBbox"] = _bbox(centre_x - 16, row_y + 14, 32, 32)
            cell["interactionBbox"] = _bbox(centre_x - 30, row_y + 2, 60, 56)

    matching = matchings[0]
    matching["bbox"] = _bbox(130, 915, 980, 322)
    for side, x, anchor_x, ids in (
        ("leftItems", 130, 534, ["li-1", "li-2", "li-3", "li-4"]),
        ("rightItems", 722, 690, ["ri-1", "ri-2", "ri-3", "ri-4"]),
    ):
        items = matching.get(side, [])
        _require_ids(items, ids, f"matching {side}")
        for row_index, item in enumerate(items):
            item_y = 915 + row_index * 88
            item["bbox"] = _bbox(x, item_y, 388, 58)
            item["anchorBbox"] = _bbox(anchor_x, item_y + 21, 16, 16)

    blanks[0]["lineBbox"] = _bbox(541, 1474, 240, 6)
    blanks[0]["interactionBbox"] = _bbox(529, 1449, 264, 56)
    parameters = normalized.setdefault("processor", {}).setdefault("parameters", {})
    parameters["geometryNormalization"] = NORMALIZATION_MARKER
    return normalized


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--analysis", type=Path, default=PAGE_TWO)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    original = json.loads(args.analysis.read_text(encoding="utf-8"))
    normalized = normalize_public_demo_page_two(original, args.source)
    if args.check:
        if normalized != original:
            raise SystemExit("Page-2 geometry fixture is not normalized")
        print(f"page 2 geometry verified: {NORMALIZATION_MARKER}")
        return
    print(json.dumps(normalized, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
