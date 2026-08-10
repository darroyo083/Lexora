import json
import sys
from typing import Any

import pytest
from PIL import Image

from app.providers.base import AnalysisProviderError
from app.providers.factory import get_analysis_provider, reset_analysis_provider
from app.providers.openai_vision import OpenAiVisionProvider


def completed_response(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": "completed",
        "output": [{
            "type": "message",
            "content": [{"type": "output_text", "text": json.dumps(payload)}],
        }],
    }


def source_analysis(fake_analysis, *, page_number: int, width: int, height: int):
    return fake_analysis.model_copy(
        update={"pageNumber": page_number, "width": width, "height": height}
    ).model_dump(mode="json")


def test_openai_provider_sends_private_server_side_strict_request(
    tmp_path, fake_analysis
):
    image_path = tmp_path / "public-safe-page.png"
    Image.new("RGB", (320, 180), "white").save(image_path)
    sent: list[dict[str, Any]] = []

    def sender(payload):
        sent.append(payload)
        return completed_response(
            source_analysis(fake_analysis, page_number=4, width=320, height=180)
        )

    provider = OpenAiVisionProvider(
        api_key="test-only",
        model="gpt-test-vision",
        sender=sender,
    )
    analysis = provider.analyze_page("public-demo", 4, str(image_path))

    assert analysis.pageNumber == 4
    assert analysis.processor.engine == "openai-responses"
    assert analysis.processor.model == "gpt-test-vision"
    request = sent[0]
    assert request["store"] is False
    assert request["text"]["format"]["strict"] is True
    assert request["text"]["format"]["schema"]["additionalProperties"] is False
    assert request["input"][0]["content"][1]["image_url"].startswith(
        "data:image/png;base64,"
    )
    assert "test-only" not in json.dumps(request)
    assert request["safety_identifier"] != "public-demo"


@pytest.mark.parametrize(
    "response",
    [
        {"status": "incomplete", "output": []},
        {"status": "completed", "output": []},
        {
            "status": "completed",
            "output": [{
                "type": "message",
                "content": [{"type": "refusal", "refusal": "no"}],
            }],
        },
        completed_response({"pageNumber": 1}),
    ],
)
def test_openai_provider_fails_closed_for_invalid_output(
    tmp_path, response
):
    image_path = tmp_path / "page.png"
    Image.new("RGB", (64, 64), "white").save(image_path)
    provider = OpenAiVisionProvider(
        api_key="test-only",
        sender=lambda _payload: response,
    )

    with pytest.raises(AnalysisProviderError):
        provider.analyze_page("book", 1, str(image_path))


def test_openai_provider_rejects_source_geometry_mismatch(tmp_path, fake_analysis):
    image_path = tmp_path / "page.png"
    Image.new("RGB", (320, 180), "white").save(image_path)
    provider = OpenAiVisionProvider(
        api_key="test-only",
        sender=lambda _payload: completed_response(
            source_analysis(fake_analysis, page_number=9, width=320, height=180)
        ),
    )

    with pytest.raises(AnalysisProviderError, match="does not match"):
        provider.analyze_page("book", 4, str(image_path))


def test_openai_provider_requires_server_side_credential(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(AnalysisProviderError, match="OPENAI_API_KEY"):
        OpenAiVisionProvider()


def test_production_provider_factory_never_imports_local_ocr(monkeypatch):
    monkeypatch.setenv("LEXORA_ANALYSIS_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "test-only")
    sys.modules.pop("app.document.ocr", None)
    reset_analysis_provider()

    provider = get_analysis_provider()

    assert provider.name == "openai"
    assert "app.document.ocr" not in sys.modules
    reset_analysis_provider()


def test_unknown_provider_fails_explicitly(monkeypatch):
    monkeypatch.setenv("LEXORA_ANALYSIS_PROVIDER", "automatic")
    reset_analysis_provider()
    with pytest.raises(AnalysisProviderError, match="Unsupported"):
        get_analysis_provider()
    reset_analysis_provider()
