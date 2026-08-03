from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field


class BBox(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(ge=0, le=1)
    height: float = Field(ge=0, le=1)


class TextSpan(BaseModel):
    id: str
    text: str
    confidence: float = Field(ge=0, le=1)
    confidenceScope: str
    parentLineId: str | None = None
    bbox: BBox


class ProcessorMetadata(BaseModel):
    engine: str
    engineVersion: str
    model: str
    language: str
    parameters: dict = Field(default_factory=dict)
    processedAt: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    durationMs: int = Field(ge=0)


class ExerciseBlank(BaseModel):
    id: str
    kind: Literal["fill-in-line"] = "fill-in-line"
    lineBbox: BBox
    interactionBbox: BBox
    detectionMethod: Literal[
        "horizontal-line-v1", "short-suffix-line-v1"
    ] = "horizontal-line-v1"
    candidateScore: float = Field(ge=0, le=1)
    nearbyTextSpanIds: list[str] = Field(default_factory=list)


class BlankDetectionMetadata(BaseModel):
    detectionMethod: Literal["horizontal-line-v1"] = "horizontal-line-v1"
    rawCandidateCount: int = Field(ge=0)
    acceptedCount: int = Field(ge=0)
    durationMs: int = Field(ge=0)


class ChoiceOption(BaseModel):
    id: str
    label: str


class ChoiceGroup(BaseModel):
    id: str
    options: list[ChoiceOption] = Field(default_factory=list)


class ChoiceTarget(BaseModel):
    id: str
    kind: Literal["choice"] = "choice"
    targetBbox: BBox
    interactionBbox: BBox
    optionGroupId: str | None = None
    detectionMethod: Literal["empty-ring-v1"] = "empty-ring-v1"
    candidateScore: float = Field(ge=0, le=1)
    nearbyTextSpanIds: list[str] = Field(default_factory=list)


class ChoiceDetectionMetadata(BaseModel):
    detectionMethod: Literal["empty-ring-v1"] = "empty-ring-v1"
    rawCandidateCount: int = Field(ge=0)
    acceptedCount: int = Field(ge=0)
    groupCount: int = Field(ge=0)
    durationMs: int = Field(ge=0)


class PageAnalysis(BaseModel):
    schemaVersion: Literal["0.2.0"] = "0.2.0"
    pageNumber: int = Field(ge=1)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    language: str
    textSpans: list[TextSpan] = Field(default_factory=list)
    exerciseBlanks: list[ExerciseBlank] = Field(default_factory=list)
    blankDetection: BlankDetectionMetadata | None = None
    choiceGroups: list[ChoiceGroup] = Field(default_factory=list)
    choiceTargets: list[ChoiceTarget] = Field(default_factory=list)
    choiceDetection: ChoiceDetectionMetadata | None = None
    processor: ProcessorMetadata


class AnalyzePageRequest(BaseModel):
    bookId: str
    pageNumber: int = Field(ge=1)
    imagePath: str


class DetectInteractionsRequest(BaseModel):
    imagePath: str
    analysis: PageAnalysis


AnalyzePageResponse = PageAnalysis
