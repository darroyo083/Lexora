"""Provider-neutral text-assistance client with thin per-provider profiles.

Uses the common OpenAI-style Chat Completions protocol. Provider profiles only
supply endpoint/body/response quirks (base URL and model). No provider-specific
reasoning features are used. The HTTP transport is the stdlib ``urllib`` client
so the production image stays dependency-free.
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
TRANSIENT_RETRY_DELAY_SECONDS = 0.05

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
            "max_tokens": self.max_output_tokens,
            "stream": False,
        }
        started = time.monotonic()
        response = self._sender(payload)
        logger.info(
            "assist provider profile=%s model=%s latency_ms=%d",
            self.profile,
            self.model,
            int((time.monotonic() - started) * 1000),
        )
        return _extract_message_text(response)

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
    message = choice.get("message") or {}
    if message.get("refusal"):
        raise AssistProviderError("Assistance provider refused the request", category="provider_output")
    content = message.get("content")
    if isinstance(content, list):
        parts = [part.get("text", "") for part in content if isinstance(part, dict)]
        content = "".join(parts)
    if not isinstance(content, str) or not content.strip():
        raise AssistProviderError("Assistance provider returned no content", category="provider_output")
    return content


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
