"""Provider-neutral text-assistance client with thin per-provider profiles.

Uses the common OpenAI-style Chat Completions protocol. Provider profiles supply
endpoint/body/response quirks (base URL, model, and reasoning compatibility).
The HTTP transport is the stdlib ``urllib`` client so the production image stays
dependency-free.
"""

import json
import logging
import os
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any

from app.assist.contract import AssistProviderError

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_MAX_OUTPUT_TOKENS = 450
MIN_REASONING_MODEL_TOKENS = 1024
TRANSIENT_RETRY_DELAY_SECONDS = 0.05

REASONING_MODELS = {
    "mimo-v2.5",
    "mimo-v2.5-pro",
}

# Each profile is an OpenAI-compatible chat/completions endpoint. base_url may
# be None for profiles that require an explicit LEXORA_ASSIST_BASE_URL.
PROFILES: dict[str, dict[str, Any]] = {
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "endpoint_path": "/chat/completions",
        "default_model": "gpt-4o-mini",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com",
        "endpoint_path": "/chat/completions",
        "default_model": "deepseek-chat",
    },
    "zai": {
        "base_url": "https://api.z.ai/api/paas/v4",
        "endpoint_path": "/chat/completions",
        "default_model": "glm-4-flash",
    },
    "openai-compatible": {
        "base_url": None,
        "endpoint_path": "/chat/completions",
        "default_model": "",
    },
}

SUPPORTED_PROVIDERS = ", ".join(sorted(PROFILES))


class AssistProvider:
    """One configured text provider for contextual assistance."""

    name = "assist"

    def __init__(
        self,
        *,
        profile: str,
        api_key: str,
        model: str,
        base_url: str | None,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
        max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
        sender: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
    ) -> None:
        spec = PROFILES[profile]
        resolved_base = (base_url or spec["base_url"] or "").rstrip("/")
        if not resolved_base:
            raise AssistProviderError(
                "LEXORA_ASSIST_BASE_URL is required for the "
                f"{profile} provider profile", category="configuration"
            )
        self.profile = profile
        self.model = model or spec["default_model"]
        if not self.model:
            raise AssistProviderError(
                "LEXORA_ASSIST_MODEL is required for the "
                f"{profile} provider profile", category="configuration"
            )
        self.endpoint = f"{resolved_base}{spec['endpoint_path']}"
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds
        self.max_output_tokens = max_output_tokens
        self._sender = sender or self._send
        if not self.api_key:
            raise AssistProviderError(
                "LEXORA_ASSIST_API_KEY is required to call the assistance provider",
                category="configuration",
            )

    def complete(self, messages: list[dict]) -> str:
        """Return the raw assistant message text for a chat completion."""
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": 0,
            "stream": False,
        }
        if self.model.lower() in REASONING_MODELS:
            # MiMo counts hidden reasoning and visible output together. This
            # feature only needs a short learner-facing JSON response, so keep
            # reasoning off and use the protocol's completion-token field.
            payload["thinking"] = {"type": "disabled"}
            payload["max_completion_tokens"] = max(
                self.max_output_tokens,
                MIN_REASONING_MODEL_TOKENS,
            )
            payload["response_format"] = {"type": "json_object"}
        else:
            payload["max_tokens"] = self.max_output_tokens
        started = time.monotonic()
        response = self._sender(payload)
        logger.info(
            "assist provider profile=%s model=%s latency_ms=%d",
            self.profile,
            self.model,
            int((time.monotonic() - started) * 1000),
        )
        try:
            return _extract_message_text(response)
        except AssistProviderError as error:
            logger.warning(
                "assist provider response rejected category=%s reason=%s shape=%s",
                error.category,
                str(error),
                json.dumps(_response_shape(response), sort_keys=True),
            )
            raise

    def _send(self, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        request = urllib.request.Request(
            self.endpoint,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "User-Agent": "lexora-ai-service/0.3",
            },
        )
        for attempt in range(2):
            try:
                with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                    return json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as error:
                logger.warning("assist provider request failed status=%s", error.code)
                if error.code >= 500 and attempt == 0:
                    time.sleep(TRANSIENT_RETRY_DELAY_SECONDS)
                    continue
                raise AssistProviderError("Assistance provider request failed", category="provider_http") from error
            except (TimeoutError, urllib.error.URLError) as error:
                if attempt == 0:
                    time.sleep(TRANSIENT_RETRY_DELAY_SECONDS)
                    continue
                raise AssistProviderError("Assistance provider is unavailable", category="provider_timeout") from error
            except json.JSONDecodeError as error:
                raise AssistProviderError("Assistance provider returned invalid JSON", category="provider_invalid_json") from error
        raise AssistProviderError("Assistance provider is unavailable", category="provider_timeout")


def _extract_message_text(response: dict[str, Any]) -> str:
    choices = response.get("choices") or []
    if not choices:
        raise AssistProviderError("Assistance provider returned no completion", category="provider_output")
    choice = choices[0]
    if choice.get("finish_reason") == "content_filter":
        raise AssistProviderError("Assistance provider output was filtered", category="provider_output")
    message = choice.get("message") if isinstance(choice, dict) else None
    if not isinstance(message, dict):
        message = {}
    if message.get("refusal"):
        raise AssistProviderError("Assistance provider refused the request", category="provider_output")
    for value in (
        message.get("content"),
        message.get("output_text"),
        choice.get("text"),
    ):
        content = _visible_text(value)
        if content:
            return content

    reason = "reasoning_only_response" if message.get("reasoning_content") else "empty_content"
    raise AssistProviderError(
        f"Assistance provider returned {reason}",
        category="provider_output",
    )


def _visible_text(value: Any) -> str | None:
    if isinstance(value, str):
        return value if value.strip() else None
    if not isinstance(value, list):
        return None

    parts: list[str] = []
    for part in value:
        if isinstance(part, str) and part.strip():
            parts.append(part)
        elif isinstance(part, dict):
            text = part.get("text")
            if isinstance(text, str) and text.strip():
                parts.append(text)
    combined = "".join(parts)
    return combined if combined.strip() else None


def _value_shape(value: Any) -> dict[str, Any]:
    if value is None:
        return {"type": "null"}
    if isinstance(value, str):
        return {"type": "string", "chars": len(value), "non_empty": bool(value.strip())}
    if isinstance(value, list):
        return {
            "type": "list",
            "items": len(value),
            "item_types": sorted({type(item).__name__ for item in value}),
        }
    if isinstance(value, dict):
        return {"type": "object", "keys": sorted(str(key) for key in value.keys())}
    return {"type": type(value).__name__}


def _response_shape(response: Any) -> dict[str, Any]:
    if not isinstance(response, dict):
        return {"type": type(response).__name__}

    choices = response.get("choices")
    first_choice = choices[0] if isinstance(choices, list) and choices else None
    message = first_choice.get("message") if isinstance(first_choice, dict) else None
    if not isinstance(message, dict):
        message = None

    return {
        "top_keys": sorted(str(key) for key in response.keys()),
        "choices": _value_shape(choices),
        "choice_keys": sorted(str(key) for key in first_choice.keys())
        if isinstance(first_choice, dict) else [],
        "finish_reason": first_choice.get("finish_reason")
        if isinstance(first_choice, dict) else None,
        "message_keys": sorted(str(key) for key in message.keys()) if message else [],
        "content": _value_shape(message.get("content")) if message else {"type": "missing"},
        "reasoning_content": _value_shape(message.get("reasoning_content")) if message else {"type": "missing"},
        "refusal": _value_shape(message.get("refusal")) if message else {"type": "missing"},
    }


def get_assist_provider() -> AssistProvider:
    profile = os.getenv("LEXORA_ASSIST_PROVIDER", "").strip().lower()
    if profile not in PROFILES:
        raise AssistProviderError(
            f"Unsupported assistance provider: {profile or '(unset)'}. "
            f"Supported: {SUPPORTED_PROVIDERS}"
        )
    return AssistProvider(
        profile=profile,
        api_key=os.getenv("LEXORA_ASSIST_API_KEY", ""),
        model=os.getenv("LEXORA_ASSIST_MODEL", ""),
        base_url=os.getenv("LEXORA_ASSIST_BASE_URL", "").strip() or None,
        timeout_seconds=int(
            os.getenv("LEXORA_ASSIST_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS))
        ),
        max_output_tokens=int(
            os.getenv("LEXORA_ASSIST_MAX_OUTPUT_TOKENS", str(DEFAULT_MAX_OUTPUT_TOKENS))
        ),
    )
