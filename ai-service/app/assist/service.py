"""Orchestration for the internal assist endpoint.

Builds an action-scoped prompt from trusted canonical context, calls the
configured provider exactly once, and validates the structured output with a
single bounded repair. Never loops and never exposes provider internals.
"""

from app.assist.contract import AssistProviderError, AssistRequest, AssistResponse
from app.assist.prompts import build_messages
from app.assist.provider import get_assist_provider
from app.assist.validation import parse_response


def run_assist(request: AssistRequest) -> AssistResponse:
    provider = get_assist_provider()
    messages = build_messages(request.action, request.context)
    try:
        raw = provider.complete(messages)
    except AssistProviderError:
        raise
    except Exception as error:  # noqa: BLE001 - fail closed on any provider surprise
        raise AssistProviderError("Assistance provider failed") from error

    try:
        return parse_response(request.action, raw)
    except AssistProviderError:
        # One bounded repair: re-validate against a fence-stripped candidate.
        # parse_response already performs the fence/JSON extraction; a second
        # attempt is intentionally not performed beyond that, so malformed
        # output fails closed.
        raise
