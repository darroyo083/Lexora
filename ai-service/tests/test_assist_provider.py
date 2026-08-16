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


def test_mimo_uses_visible_json_budget_without_reasoning():
    sender, captured = _capture(None)
    provider = AssistProvider(
        profile="openai-compatible",
        api_key="test-key",
        model="mimo-v2.5",
        base_url="https://provider.example/v1",
        sender=sender,
    )

    provider.complete([{"role": "user", "content": "hi"}])

    payload = captured["payload"]
    assert payload["thinking"] == {"type": "disabled"}
    assert payload["max_completion_tokens"] == 1024
    assert payload["response_format"] == {"type": "json_object"}
    assert "max_tokens" not in payload


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


def test_content_parts_ignore_null_and_non_text_parts():
    def sender(payload):
        return {
            "choices": [{
                "finish_reason": "stop",
                "message": {
                    "role": "assistant",
                    "content": [None, {"type": "reasoning", "text": None}, {"type": "text", "text": "visible"}],
                },
            }]
        }

    provider = AssistProvider(
        profile="openai", api_key="k", model="m", base_url=None, sender=sender
    )
    assert provider.complete([{"role": "user", "content": "hi"}]) == "visible"


def test_reasoning_content_parts_are_not_treated_as_visible_text():
    def sender(payload):
        return {
            "choices": [{
                "finish_reason": "stop",
                "message": {
                    "role": "assistant",
                    "content": [
                        {"type": "reasoning", "text": "private reasoning"},
                        {"type": "text", "text": "visible answer"},
                    ],
                },
            }]
        }

    provider = AssistProvider(
        profile="openai", api_key="k", model="m", base_url=None, sender=sender
    )
    assert provider.complete([{"role": "user", "content": "hi"}]) == "visible answer"


@pytest.mark.parametrize(
    "response",
    [None, {"choices": [None]}, {"choices": "not-a-list"}],
)
def test_malformed_provider_envelope_fails_as_provider_output(response):
    provider = AssistProvider(
        profile="openai",
        api_key="k",
        model="m",
        base_url=None,
        sender=lambda payload: response,
    )

    with pytest.raises(AssistProviderError) as error:
        provider.complete([{"role": "user", "content": "hi"}])

    assert error.value.category == "provider_output"


def test_reasoning_only_response_fails_closed_without_logging_reasoning(caplog):
    reasoning = "private internal reasoning that must never be surfaced"

    def sender(payload):
        return {
            "choices": [{
                "finish_reason": "length",
                "message": {
                    "role": "assistant",
                    "content": None,
                    "reasoning_content": reasoning,
                },
            }]
        }

    provider = AssistProvider(
        profile="openai", api_key="k", model="m", base_url=None, sender=sender
    )
    caplog.set_level("WARNING", logger="app.assist.provider")

    with pytest.raises(AssistProviderError, match="reasoning_only_response"):
        provider.complete([{"role": "user", "content": "hi"}])

    assert "reasoning_only_response" in caplog.text
    assert "reasoning_content" in caplog.text
    assert '"content": {"type": "null"}' in caplog.text
    assert '"finish_reason": "length"' in caplog.text
    assert reasoning not in caplog.text


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
