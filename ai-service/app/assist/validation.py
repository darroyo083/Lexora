"""Strict structured-output validation with at most one bounded repair.

Provider output is never trusted as-is: it is parsed as JSON, coerced to the
typed contract, and fails closed when it cannot be validated. A single repair
attempt strips markdown code fences and extracts the first JSON object; if that
still fails, an error is raised and the caller surfaces a clean failure.
"""

import json
import re
from typing import Any

from app.assist.contract import AssistProviderError, AssistResponse, AssistVerdict

_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL)
_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)

_MAX_CONTENT_CHARS = 4000
_VERDICTS: set[str] = set(AssistVerdict.__args__)  # type: ignore[attr-defined]


def _strip_fence(text: str) -> str:
    match = _CODE_FENCE_RE.match(text.strip())
    return match.group(1).strip() if match else text.strip()


def _extract_json(text: str) -> Any:
    for candidate in (_strip_fence(text),):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass
    match = _OBJECT_RE.search(text)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    raise AssistProviderError("Assistance provider output is not valid JSON")


def _clean_text(value: Any) -> str:
    if not isinstance(value, str):
        raise AssistProviderError("Assistance provider content is not text")
    text = value.strip()
    if not text:
        raise AssistProviderError("Assistance provider content is empty")
    return text[:_MAX_CONTENT_CHARS]


def parse_response(action: str, raw_text: str) -> AssistResponse:
    data = _extract_json(raw_text)
    if not isinstance(data, dict):
        raise AssistProviderError("Assistance provider output is not a JSON object")

    content = _clean_text(data.get("content"))

    verdict = None
    if action == "check":
        raw_verdict = data.get("verdict")
        if raw_verdict not in _VERDICTS:
            raise AssistProviderError(
                "Assistance provider verdict is missing or invalid"
            )
        verdict = raw_verdict

    return AssistResponse(action=action, content=content, verdict=verdict)
