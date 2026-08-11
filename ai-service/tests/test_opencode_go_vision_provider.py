import json
import sys
from typing import Any

import pytest
from PIL import Image

from app.providers.base import AnalysisProviderError
from app.providers.factory import get_analysis_provider, reset_analysis_provider
from app.providers.opencode_go_vision import OpenCodeGoVisionProvider


def completed_response(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "choices": [{
            "message": {"role": "assistant", "content": json.dumps(payload)},
            "finish_reason": "stop",
        }],
        "model": "mimo-v2.5",
    }


def source_analysis(fake_analysis, *, page_number: int, width: int, height: int):
    return fake_analysis.model_copy(
        update={"pageNumber": page_number, "width": width, "height": height}
    ).model_dump(mode="json")


def test_opencode_go_provider_sends_private_server_side_multimodal_request(
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

    provider = OpenCodeGoVisionProvider(
        api_key="test-only",
        model="mimo-v2.5",
        sender=sender,
    )
    analysis = provider.analyze_page("public-demo", 4, str(image_path))

    assert analysis.pageNumber == 4
    assert analysis.processor.engine == "opencode-go-vision"
    assert analysis.processor.model == "mimo-v2.5"
    request = sent[0]
    assert request["model"] == "mimo-v2.5"
    assert request["response_format"] == {"type": "json_object"}
    assert request["temperature"] == 0
    assert request["max_tokens"] > 0
    system = request["messages"][0]
    assert system["role"] == "system"
    assert "JSON Schema" in system["content"]
    assert '"additionalProperties":false' in system["content"]
    user_parts = request["messages"][1]["content"]
    assert user_parts[0] == {
        "type": "text",
        "text": "Analyze source page 4. The raster is exactly 320x180 pixels.",
    }
    assert user_parts[1]["type"] == "image_url"
    assert user_parts[1]["image_url"]["url"].startswith("data:image/png;base64,")
    assert "test-only" not in json.dumps(request)
    assert request["user"] != "public-demo"


def test_opencode_go_provider_accepts_markdown_fenced_json(tmp_path, fake_analysis):
    image_path = tmp_path / "page.png"
    Image.new("RGB", (64, 64), "white").save(image_path)
    payload = source_analysis(fake_analysis, page_number=1, width=64, height=64)
    response = {"choices": [{
        "message": {"role": "assistant", "content": f"```json\n{json.dumps(payload)}\n```"},
        "finish_reason": "stop",
    }]}

    provider = OpenCodeGoVisionProvider(
        api_key="test-only",
        sender=lambda _payload: response,
    )

    analysis = provider.analyze_page("book", 1, str(image_path))

    assert analysis.pageNumber == 1
    assert analysis.processor.engine == "opencode-go-vision"


@pytest.mark.parametrize(
    "response",
    [
        {},
        {"choices": []},
        {"choices": [{"message": {"content": "..."}, "finish_reason": "length"}]},
        {"choices": [{"message": {"content": "..."}, "finish_reason": "content_filter"}]},
        {"choices": [{"message": {"refusal": "no", "content": None}, "finish_reason": "stop"}]},
        {"choices": [{"message": {"content": "not json at all"}, "finish_reason": "stop"}]},
        completed_response({"pageNumber": 1}),
    ],
)
def test_opencode_go_provider_fails_closed_for_invalid_output(
    tmp_path, response
):
    image_path = tmp_path / "page.png"
    Image.new("RGB", (64, 64), "white").save(image_path)
    provider = OpenCodeGoVisionProvider(
        api_key="test-only",
        sender=lambda _payload: response,
    )

    with pytest.raises(AnalysisProviderError):
        provider.analyze_page("book", 1, str(image_path))


def test_opencode_go_provider_rejects_source_geometry_mismatch(tmp_path, fake_analysis):
    image_path = tmp_path / "page.png"
    Image.new("RGB", (320, 180), "white").save(image_path)
    provider = OpenCodeGoVisionProvider(
        api_key="test-only",
        sender=lambda _payload: completed_response(
            source_analysis(fake_analysis, page_number=9, width=320, height=180)
        ),
    )

    with pytest.raises(AnalysisProviderError, match="does not match"):
        provider.analyze_page("book", 4, str(image_path))


def test_opencode_go_provider_requires_server_side_credential(monkeypatch):
    monkeypatch.delenv("OPENCODE_GO_API_KEY", raising=False)
    with pytest.raises(AnalysisProviderError, match="OPENCODE_GO_API_KEY"):
        OpenCodeGoVisionProvider()


def test_opencode_go_provider_rejects_non_https_endpoint():
    with pytest.raises(AnalysisProviderError, match="HTTPS"):
        OpenCodeGoVisionProvider(api_key="test-only", endpoint="http://insecure.example/v1")


def test_production_provider_factory_never_imports_local_ocr(monkeypatch):
    monkeypatch.setenv("LEXORA_ANALYSIS_PROVIDER", "opencode-go")
    monkeypatch.setenv("OPENCODE_GO_API_KEY", "test-only")
    sys.modules.pop("app.document.ocr", None)
    reset_analysis_provider()

    provider = get_analysis_provider()

    assert provider.name == "opencode-go"
    assert "app.document.ocr" not in sys.modules
    reset_analysis_provider()


def test_unknown_provider_fails_explicitly(monkeypatch):
    monkeypatch.setenv("LEXORA_ANALYSIS_PROVIDER", "automatic")
    reset_analysis_provider()
    with pytest.raises(AnalysisProviderError, match="Unsupported"):
        get_analysis_provider()
    reset_analysis_provider()


def test_deprecated_openai_selection_is_unsupported(monkeypatch):
    monkeypatch.setenv("LEXORA_ANALYSIS_PROVIDER", "openai")
    reset_analysis_provider()
    with pytest.raises(AnalysisProviderError, match="Unsupported"):
        get_analysis_provider()
    reset_analysis_provider()
