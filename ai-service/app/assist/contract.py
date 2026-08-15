"""Typed contracts for the internal assist endpoint.

The backend reconstructs canonical exercise context from Lexora's own trusted
data and sends it here as plain data. This module never accepts free-form
prompts, arbitrary message arrays, or provider configuration from a caller.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field

AssistAction = Literal["hint", "explain", "translate", "check", "ask"]
AssistVerdict = Literal["likely_correct", "likely_incorrect", "uncertain"]
TargetLanguage = Literal["en", "es"]


class AssistContext(BaseModel):
    title: str = ""
    instruction: str = ""
    source: str = ""
    exerciseKind: str = ""
    options: list[str] = Field(default_factory=list)
    answer: Optional[str] = None
    sourceLanguage: str = "de"
    targetLanguage: Optional[TargetLanguage] = None
    question: Optional[str] = Field(default=None, max_length=400)


class AssistRequest(BaseModel):
    action: AssistAction
    context: AssistContext


class AssistResponse(BaseModel):
    action: AssistAction
    content: str
    verdict: Optional[AssistVerdict] = None


class AssistProviderError(RuntimeError):
    """Safe, non-sensitive provider failure surfaced to the backend."""

    def __init__(self, message: str, *, category: str = "provider_error") -> None:
        super().__init__(message)
        self.category = category
