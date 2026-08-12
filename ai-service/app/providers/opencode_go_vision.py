"""External OpenCode Go Vision provider for production page analysis.

OpenCode Go (https://opencode.ai/zen/go) exposes OpenAI-compatible
``/v1/chat/completions`` endpoints. MiMo-V2.5 is served through the
``@ai-sdk/openai-compatible`` format documented at https://opencode.ai/docs/go:
standard ``image_url`` content parts for images and ``json_object``
response format for structured output. Authentication is a server-side
Bearer credential issued from the OpenCode console.

The provider deliberately does not depend on the OpenCode CLI: Lexora
production calls the OpenCode Go HTTP API directly.
"""

import base64
import hashlib
import json
import logging
import mimetypes
import os
import re
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image
from pydantic import ValidationError

from app.providers.base import AnalysisProviderError
from app.providers.choice_normalization import normalize_choice_targets
from app.schemas.page_analysis import PageAnalysis, ProcessorMetadata


logger = logging.getLogger(__name__)

DEFAULT_ENDPOINT = "https://opencode.ai/zen/go/v1/chat/completions"
DEFAULT_MODEL = "mimo-v2.5"
DEFAULT_TIMEOUT_SECONDS = 90
DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024

SYSTEM_INSTRUCTIONS = """You analyze one language-workbook page for Lexora.
Return only valid JSON matching the supplied JSON Schema. Preserve source text and normalized geometry.
Coordinates are fractions of the image width and height in the range 0 to 1.
Detect only evidence visible on this page. Never invent theory, prompts, choices,
answers, or answer-key content. Identify semanticExercises only from visible numbered
or clearly bounded source exercises. Each semantic exercise must preserve the visible
title and instruction, reference every related detected interaction exactly once, and
include only supporting context spans inside that source exercise. If an interaction is uncertain,
omit it. Empty arrays are correct when evidence is insufficient. Nearby text IDs must
refer to returned text spans. The page number and pixel dimensions must match the
request exactly. Use vision-structured-v1 for every detectionMethod field."""

_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL)


def _strict_schema() -> dict[str, Any]:
    schema = deepcopy(PageAnalysis.model_json_schema())

    def normalize(node: Any) -> None:
        if isinstance(node, dict):
            node.pop("default", None)
            properties = node.get("properties")
            if isinstance(properties, dict):
                node["required"] = list(properties)
                node["additionalProperties"] = False
            for value in node.values():
                normalize(value)
        elif isinstance(node, list):
            for value in node:
                normalize(value)

    normalize(schema)
    parameters = schema["$defs"]["ProcessorMetadata"]["properties"]["parameters"]
    parameters.clear()
    parameters.update({"type": "object", "properties": {}, "additionalProperties": False})
    return schema


def _strip_code_fence(text: str) -> str:
    match = _CODE_FENCE_RE.match(text.strip())
    return match.group(1) if match else text.strip()


def _extract_message_text(response: dict[str, Any]) -> str:
    choices = response.get("choices") or []
    if not choices:
        raise AnalysisProviderError("Vision provider returned no completion")
    choice = choices[0]
    if choice.get("finish_reason") in ("length", "content_filter"):
        raise AnalysisProviderError("Vision provider output was truncated or filtered")
    message = choice.get("message") or {}
    if message.get("refusal"):
        raise AnalysisProviderError("Vision provider refused the page analysis")
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise AnalysisProviderError("Vision provider returned no structured page analysis")
    return content


class OpenCodeGoVisionProvider:
    """Concrete OpenCode Go chat/completions provider for server-side analysis."""

    name = "opencode-go"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        endpoint: str | None = None,
        timeout_seconds: int | None = None,
        max_image_bytes: int | None = None,
        sender: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
    ) -> None:
        self.api_key = api_key or os.getenv("OPENCODE_GO_API_KEY", "")
        self.model = model or os.getenv("OPENCODE_GO_MODEL", DEFAULT_MODEL)
        self.endpoint = endpoint or os.getenv("OPENCODE_GO_BASE_URL", DEFAULT_ENDPOINT)
        self.timeout_seconds = timeout_seconds or int(
            os.getenv("LEXORA_PROVIDER_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS))
        )
        self.max_image_bytes = max_image_bytes or int(
            os.getenv("LEXORA_MAX_IMAGE_BYTES", str(DEFAULT_MAX_IMAGE_BYTES))
        )
        self._sender = sender or self._send
        if not self.api_key:
            raise AnalysisProviderError("OPENCODE_GO_API_KEY is required for the OpenCode Go provider")
        if not self.endpoint.startswith("https://"):
            raise AnalysisProviderError("OpenCode Go provider endpoint must use HTTPS")

    def analyze_page(
        self,
        book_id: str,
        page_number: int,
        image_path: str,
    ) -> PageAnalysis:
        path = Path(image_path)
        try:
            size = path.stat().st_size
        except OSError as error:
            raise AnalysisProviderError("Page image is unavailable for analysis") from error
        if size <= 0 or size > self.max_image_bytes:
            raise AnalysisProviderError("Page image exceeds the configured analysis limit")

        try:
            with Image.open(path) as image:
                width, height = image.size
        except Exception as error:
            raise AnalysisProviderError("Page image is invalid or unsupported") from error

        mime_type = mimetypes.guess_type(path.name)[0] or "image/png"
        if mime_type not in {"image/png", "image/jpeg", "image/webp"}:
            raise AnalysisProviderError("Page image type is unsupported")
        image_data = base64.b64encode(path.read_bytes()).decode("ascii")
        payload = self._request_payload(
            book_id=book_id,
            page_number=page_number,
            width=width,
            height=height,
            image_url=f"data:{mime_type};base64,{image_data}",
        )

        started = time.monotonic()
        response = self._sender(payload)
        try:
            raw = json.loads(_strip_code_fence(_extract_message_text(response)))
            analysis = PageAnalysis.model_validate(raw)
        except (json.JSONDecodeError, ValidationError, TypeError) as error:
            raise AnalysisProviderError(
                "Vision provider output failed Lexora contract validation"
            ) from error

        if (
            analysis.pageNumber != page_number
            or analysis.width != width
            or analysis.height != height
        ):
            raise AnalysisProviderError("Vision provider output does not match the source page")

        analysis = normalize_choice_targets(analysis)
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return analysis.model_copy(
            update={
                "processor": ProcessorMetadata(
                    engine="opencode-go-vision",
                    engineVersion="v1",
                    model=self.model,
                    language=analysis.language,
                    parameters={},
                    processedAt=datetime.now(timezone.utc),
                    durationMs=elapsed_ms,
                )
            }
        )

    def enrich_interactions(
        self,
        image_path: str,
        analysis: PageAnalysis,
    ) -> PageAnalysis:
        del image_path
        return analysis

    def _request_payload(
        self,
        *,
        book_id: str,
        page_number: int,
        width: int,
        height: int,
        image_url: str,
    ) -> dict[str, Any]:
        return {
            "model": self.model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": (
                        SYSTEM_INSTRUCTIONS
                        + "\n\nJSON Schema:\n"
                        + json.dumps(_strict_schema(), separators=(",", ":"))
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                f"Analyze source page {page_number}. "
                                f"The raster is exactly {width}x{height} pixels."
                            ),
                        },
                        {"type": "image_url", "image_url": {"url": image_url, "detail": "auto"}},
                    ],
                },
            ],
            "max_tokens": 16000,
            "user": hashlib.sha256(book_id.encode("utf-8")).hexdigest()[:32],
        }

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
            logger.info("OpenCode Go provider HTTP attempt=%s", attempt + 1)
            try:
                with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                    return json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as error:
                retryable = error.code == 429 or error.code >= 500
                if retryable and attempt == 0:
                    time.sleep(0.5)
                    continue
                logger.warning("OpenCode Go provider request failed status=%s", error.code)
                raise AnalysisProviderError("Vision provider request failed") from error
            except (TimeoutError, urllib.error.URLError, json.JSONDecodeError) as error:
                if attempt == 0:
                    time.sleep(0.5)
                    continue
                raise AnalysisProviderError("Vision provider is unavailable") from error
        raise AnalysisProviderError("Vision provider is unavailable")
