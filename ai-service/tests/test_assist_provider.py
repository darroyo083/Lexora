"""Provider profile tests for the Contextual AI Assistance feature.

Uses injected ``sender`` callables (no network, no real provider keys). Covers
the four supported profiles and the portable chat-completions envelope.
"""

from unittest.mock import patch

import pytest

from app.assist.contract import AssistProviderError
from app.assist.provider import AssistProvider


def _ok_response(content: str) -> dict:
    return {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {"role": "assistant", "content": content},
            }
        ]
    }


def _capture(sender):
    captured = {}

    def call(payload):
        captured["payload"] = payload
        return _ok_response('{"content": "hello"}')

    return call, captured


@pytest.mark.parametrize(
    "profile,expected_endpoint,model",
    [
        ("openai", "https://api.openai.com/v1/chat/completions", "gpt-4o-mini"),
        ("deepseek", "https://api.deepseek.com/chat/completions", "deepseek-chat"),
        ("zai", "https://api.z.ai/api/paas/v4/chat/completions", "glm-4-flash"),
    ],
)
def test_profile_builds_expected_endpoint_and_model(profile, expected_endpoint, model):
    sender, captured = _capture(None)
    provider = AssistProvider(
        profile=profile,
        api_key="test-key",
        model="",
        base_url=None,
        sender=sender,
    )
    provider.complete([{"role": "user", "content": "hi"}])
    assert provider.endpoint == expected_endpoint
    assert provider.model == model
    payload = captured["payload"]
    assert payload["model"] == model
    assert payload["messages"] == [{"role": "user", "content": "hi"}]
    assert payload["stream"] is False


def test_openai_compatible_requires_base_url():
    sender, _ = _capture(None)
    with pytest.raises(AssistProviderError):
        AssistProvider(
            profile="openai-compatible",
            api_key="test-key",
            model="custom-model",
            base_url=None,
            sender=sender,
        )


def test_openai_compatible_uses_custom_base_url():
    sender, captured = _capture(None)
    provider = AssistProvider(
        profile="openai-compatible",
        api_key="test-key",
        model="custom-model",
        base_url="https://provider.example/v1/",
        sender=sender,
    )
    provider.complete([{"role": "user", "content": "hi"}])
    assert provider.endpoint == "https://provider.example/v1/chat/completions"
    assert captured["payload"]["model"] == "custom-model"


def test_provider_requires_api_key():
    with pytest.raises(AssistProviderError):
        AssistProvider(
            profile="openai",
            api_key="",
            model="",
            base_url=None,
        )


def test_provider_requires_model_for_openai_compatible():
    with pytest.raises(AssistProviderError):
        AssistProvider(
            profile="openai-compatible",
            api_key="test-key",
            model="",
            base_url="https://provider.example/v1",
        )


def test_list_content_parts_are_joined():
    def sender(payload):
        return {
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {
                        "role": "assistant",
                        "content": [
                            {"type": "text", "text": "par"},
                            {"type": "text", "text": "tial"},
                        ]
                    },
                }
            ]
        }

    provider = AssistProvider(
        profile="openai", api_key="k", model="m", base_url=None, sender=sender
    )
    assert provider.complete([{"role": "user", "content": "hi"}]) == "partial"


def test_filtered_response_fails_closed():
    def sender(payload):
        return {
            "choices": [
                {
                    "finish_reason": "content_filter",
                    "message": {"role": "assistant", "content": "nope"},
                }
            ]
        }

    provider = AssistProvider(
        profile="openai", api_key="k", model="m", base_url=None, sender=sender
    )
    with pytest.raises(AssistProviderError):
        provider.complete([{"role": "user", "content": "hi"}])


def test_unavailable_provider_fails_closed():
    def sender(payload):
        raise AssistProviderError("Assistance provider is unavailable")

    provider = AssistProvider(
        profile="openai", api_key="k", model="m", base_url=None, sender=sender
    )
    with pytest.raises(AssistProviderError):
        provider.complete([{"role": "user", "content": "hi"}])


@patch("app.assist.provider.AssistProvider")
def test_get_assist_provider_unsupported_profile(_mock):
    with patch.dict("os.environ", {"LEXORA_ASSIST_PROVIDER": "nope"}, clear=False):
        from app.assist.provider import get_assist_provider

        with pytest.raises(AssistProviderError):
            get_assist_provider()
