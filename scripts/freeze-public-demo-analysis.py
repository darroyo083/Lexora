"""Freeze validated public-demo PageAnalysis records from a private Lexora run.

This tool performs no inference. It reads READY pages already persisted by the
private runtime, verifies their provider metadata, and writes deterministic
public fixtures plus safe provenance. Raw provider envelopes and credentials
are intentionally never retained.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
DEMO_DIR = ROOT / "backend" / "src" / "main" / "resources" / "demo"
SOURCE = DEMO_DIR / "lexora-synthetic-workbook.pdf"
sys.path.insert(0, str(ROOT / "ai-service"))

from app.providers.choice_normalization import normalize_choice_targets
from app.schemas.page_analysis import PageAnalysis


def get_json(url: str) -> dict:
    with urlopen(url, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--book-id", required=True)
    parser.add_argument("--provider-http-attempts", type=int, required=True)
    args = parser.parse_args()

    book = get_json(f"{args.base_url}/api/books/{args.book_id}")
    if book["pageCount"] != 4:
        raise ValueError(f"Expected four synthetic pages, got {book['pageCount']}")

    analyses: list[dict] = []
    for page_number in range(1, 5):
        page = get_json(
            f"{args.base_url}/api/books/{args.book_id}/pages/{page_number}"
        )
        if page["processingStatus"] != "READY":
            raise ValueError(f"Page {page_number} is not READY")
        analysis = json.loads(page["analysis"])
        processor = analysis["processor"]
        expected = {
            "schemaVersion": "0.2.0",
            "pageNumber": page_number,
        }
        for field, value in expected.items():
            if analysis[field] != value:
                raise ValueError(
                    f"Page {page_number} {field}={analysis[field]!r}, expected {value!r}"
                )
        if processor["engine"] != "opencode-go-vision":
            raise ValueError(f"Page {page_number} was not produced by OpenCode Go")
        if processor["model"] != "mimo-v2.5":
            raise ValueError(f"Page {page_number} was not produced by MiMo V2.5")
        normalized = normalize_choice_targets(PageAnalysis.model_validate(analysis))
        analyses.append(normalized.model_dump(mode="json"))

    for page_number, analysis in enumerate(analyses, start=1):
        target = DEMO_DIR / f"page-analysis-{page_number}.json"
        target.write_text(
            json.dumps(analysis, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    provenance = {
        "datasetVersion": "1.0.0",
        "source": {
            "path": "demo/lexora-synthetic-workbook.pdf",
            "sha256": source_hash,
            "pageCount": 4,
            "copyright": "Original synthetic demo material created for Lexora.",
        },
        "analysis": {
            "provider": "opencode-go",
            "model": "mimo-v2.5",
            "endpoint": "https://opencode.ai/zen/go/v1/chat/completions",
            "schemaVersion": "0.2.0",
            "validatedPageAnalyses": 4,
            "providerHttpAttempts": args.provider_http_attempts,
            "acceptedProcessedAt": [
                analysis["processor"]["processedAt"] for analysis in analyses
            ],
            "pipeline": [
                "PDF upload",
                "PDFBox rasterization at 160 DPI",
                "OpenCode Go / MiMo V2.5",
                "Pydantic PageAnalysis validation",
                "Deterministic same-row choice-target normalization",
                "Spring PageAnalysis projection",
            ],
            "attemptNotes": [
                "Provider calls were limited to one accepted analysis per page; retries were permitted only for transport or contract-validation failures.",
                f"The run made {args.provider_http_attempts} provider HTTP attempts for four validated READY analyses.",
                "Only validated READY analyses are included in this dataset.",
            ],
        },
    }
    (DEMO_DIR / "provenance.json").write_text(
        json.dumps(provenance, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "pages": len(analyses),
        "schemaVersion": "0.2.0",
        "provider": "opencode-go",
        "model": "mimo-v2.5",
        "sourceSha256": source_hash,
        "providerHttpAttempts": args.provider_http_attempts,
    }, indent=2))


if __name__ == "__main__":
    main()
