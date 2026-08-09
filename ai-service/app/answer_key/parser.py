from abc import ABC, abstractmethod
from typing import Literal

from pydantic import BaseModel, Field


class TextExpectedAnswer(BaseModel):
    type: Literal["Text"] = "Text"
    value: str
    alternatives: list[str] = Field(default_factory=list)


class MatchingPair(BaseModel):
    leftLabel: str
    rightLabel: str


class MatchingExpectedAnswer(BaseModel):
    type: Literal["Matching"] = "Matching"
    pairs: list[MatchingPair] = Field(default_factory=list)


class ReferenceExpectedAnswer(BaseModel):
    type: Literal["Reference"] = "Reference"
    modelText: str
    sourceHint: str = ""


class AnswerKeyEntry(BaseModel):
    pageNumber: int = Field(ge=1)
    exerciseNumber: str | None = None
    interactionKind: Literal[
        "FillBlank", "Choice", "ChoiceGrid",
        "SentenceOrdering", "Matching", "FreeText",
    ]
    ordinal: int = Field(ge=1)
    expectedValue: str
    alternatives: list[str] = Field(default_factory=list)
    caseSensitive: bool = False
    punctuationRequired: bool = False
    normalizationMode: Literal[
        "strict", "lenient_german", "relaxed",
    ] = "strict"
    rawSolutionText: str = ""
    confidence: float = Field(default=0.0, ge=0, le=1)
    mappingWarnings: list[str] = Field(default_factory=list)
    typedPayload: TextExpectedAnswer | MatchingExpectedAnswer | ReferenceExpectedAnswer | None = None


class AnswerKeyParser(ABC):
    @abstractmethod
    def publisher(self) -> str:
        ...

    @abstractmethod
    def parse(self, text_spans: list[dict]) -> list[AnswerKeyEntry]:
        ...
