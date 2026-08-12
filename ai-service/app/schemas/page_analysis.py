from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, model_validator


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
        "horizontal-line-v1", "short-suffix-line-v1", "vision-structured-v1"
    ] = "horizontal-line-v1"
    candidateScore: float = Field(ge=0, le=1)
    nearbyTextSpanIds: list[str] = Field(default_factory=list)


class BlankDetectionMetadata(BaseModel):
    detectionMethod: Literal[
        "horizontal-line-v1", "vision-structured-v1"
    ] = "horizontal-line-v1"
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
    detectionMethod: Literal[
        "empty-ring-v1", "vision-structured-v1"
    ] = "empty-ring-v1"
    candidateScore: float = Field(ge=0, le=1)
    nearbyTextSpanIds: list[str] = Field(default_factory=list)


class ChoiceDetectionMetadata(BaseModel):
    detectionMethod: Literal[
        "empty-ring-v1", "vision-structured-v1"
    ] = "empty-ring-v1"
    rawCandidateCount: int = Field(ge=0)
    acceptedCount: int = Field(ge=0)
    groupCount: int = Field(ge=0)
    durationMs: int = Field(ge=0)


class ChoiceGridCell(BaseModel):
    id: str
    optionId: str
    cellBbox: BBox
    interactionBbox: BBox


class ChoiceGridRow(BaseModel):
    id: str
    rowBbox: BBox
    promptBbox: BBox | None = None
    nearbyTextSpanIds: list[str] = Field(default_factory=list)
    cells: list[ChoiceGridCell] = Field(default_factory=list)


class ChoiceGrid(BaseModel):
    id: str
    kind: Literal["choice-grid"] = "choice-grid"
    gridBbox: BBox
    optionGroupId: str
    detectionMethod: Literal[
        "table-grid-v1", "vision-structured-v1"
    ] = "table-grid-v1"
    candidateScore: float = Field(ge=0, le=1)
    rows: list[ChoiceGridRow] = Field(default_factory=list)


class ChoiceGridDetectionMetadata(BaseModel):
    detectionMethod: Literal[
        "table-grid-v1", "vision-structured-v1"
    ] = "table-grid-v1"
    rawCandidateCount: int = Field(ge=0)
    acceptedCount: int = Field(ge=0)
    groupCount: int = Field(ge=0)
    durationMs: int = Field(ge=0)


class SentenceOrderingItem(BaseModel):
    id: str
    text: str
    bbox: BBox
    originalIndex: int = Field(ge=1)


class SentenceOrderingInteraction(BaseModel):
    id: str
    kind: Literal["sentence-ordering"] = "sentence-ordering"
    bbox: BBox
    exerciseId: str
    promptIndex: int = Field(ge=1)
    detectionMethod: Literal[
        "sentence-ordering-v1", "vision-structured-v1"
    ] = "sentence-ordering-v1"
    candidateScore: float = Field(ge=0, le=1)
    nearbyTextSpanIds: list[str] = Field(default_factory=list)
    items: list[SentenceOrderingItem] = Field(default_factory=list)


class SentenceOrderingDetectionMetadata(BaseModel):
    detectionMethod: Literal[
        "sentence-ordering-v1", "vision-structured-v1"
    ] = "sentence-ordering-v1"
    rawCandidateCount: int = Field(ge=0)
    acceptedCount: int = Field(ge=0)
    groupCount: int = Field(ge=0)
    durationMs: int = Field(ge=0)


class MatchingItem(BaseModel):
    id: str
    label: str = ""
    text: str = ""
    bbox: BBox
    anchorBbox: BBox | None = None
    nearbyTextSpanIds: list[str] = Field(default_factory=list)


class MatchingInteraction(BaseModel):
    id: str
    kind: Literal["matching"] = "matching"
    bbox: BBox
    detectionMethod: Literal[
        "matching-v1", "vision-structured-v1"
    ] = "matching-v1"
    candidateScore: float = Field(ge=0, le=1)
    cardinality: Literal["one-to-one"] = "one-to-one"
    nearbyTextSpanIds: list[str] = Field(default_factory=list)
    leftItems: list[MatchingItem] = Field(default_factory=list)
    rightItems: list[MatchingItem] = Field(default_factory=list)


class MatchingDetectionMetadata(BaseModel):
    detectionMethod: Literal[
        "matching-v1", "vision-structured-v1"
    ] = "matching-v1"
    rawCandidateCount: int = Field(ge=0)
    acceptedCount: int = Field(ge=0)
    groupCount: int = Field(ge=0)
    durationMs: int = Field(ge=0)


class FreeTextLine(BaseModel):
    id: str
    bbox: BBox


class FreeTextInteraction(BaseModel):
    id: str
    kind: Literal["free-text"] = "free-text"
    bbox: BBox
    detectionMethod: Literal[
        "free-text-v1", "vision-structured-v1"
    ] = "free-text-v1"
    candidateScore: float = Field(ge=0, le=1)
    nearbyTextSpanIds: list[str] = Field(default_factory=list)
    responseLines: list[FreeTextLine] = Field(default_factory=list)


class FreeTextDetectionMetadata(BaseModel):
    detectionMethod: Literal[
        "free-text-v1", "vision-structured-v1"
    ] = "free-text-v1"
    rawCandidateCount: int = Field(ge=0)
    acceptedCount: int = Field(ge=0)
    groupCount: int = Field(ge=0)
    durationMs: int = Field(ge=0)


class SemanticExercise(BaseModel):
    id: str
    number: str | None = None
    title: str | None = None
    instruction: str | None = None
    kind: Literal[
        "fill-blank", "choice", "choice-grid", "sentence-ordering",
        "matching", "free-text",
    ]
    bbox: BBox
    sourceOrder: int = Field(ge=1)
    interactionIds: list[str] = Field(min_length=1)
    contextSpanIds: list[str] = Field(default_factory=list)
    detectionMethod: Literal["vision-semantic-v1"] = "vision-semantic-v1"
    confidence: float = Field(ge=0, le=1)


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
    choiceGrids: list[ChoiceGrid] = Field(default_factory=list)
    choiceGridDetection: ChoiceGridDetectionMetadata | None = None
    sentenceOrderings: list[SentenceOrderingInteraction] = Field(default_factory=list)
    sentenceOrderingDetection: SentenceOrderingDetectionMetadata | None = None
    matchingInteractions: list[MatchingInteraction] = Field(default_factory=list)
    matchingDetection: MatchingDetectionMetadata | None = None
    freeTextInteractions: list[FreeTextInteraction] = Field(default_factory=list)
    freeTextDetection: FreeTextDetectionMetadata | None = None
    semanticExercises: list[SemanticExercise] = Field(default_factory=list)
    processor: ProcessorMetadata

    @model_validator(mode="after")
    def validate_semantic_references(self):
        span_ids = {span.id for span in self.textSpans}
        interaction_ids = {
            *(blank.id for blank in self.exerciseBlanks),
            *(target.id for target in self.choiceTargets),
            *(grid.id for grid in self.choiceGrids),
            *(ordering.id for ordering in self.sentenceOrderings),
            *(matching.id for matching in self.matchingInteractions),
            *(free_text.id for free_text in self.freeTextInteractions),
        }
        exercise_ids: set[str] = set()
        referenced_interactions: set[str] = set()
        for exercise in self.semanticExercises:
            if exercise.id in exercise_ids:
                raise ValueError(f"Duplicate semantic exercise id: {exercise.id}")
            exercise_ids.add(exercise.id)
            unknown_interactions = set(exercise.interactionIds) - interaction_ids
            if unknown_interactions:
                raise ValueError(
                    f"Semantic exercise {exercise.id} references unknown interactions: "
                    f"{sorted(unknown_interactions)}"
                )
            duplicate_membership = set(exercise.interactionIds) & referenced_interactions
            if duplicate_membership:
                raise ValueError(
                    f"Interactions belong to multiple semantic exercises: "
                    f"{sorted(duplicate_membership)}"
                )
            referenced_interactions.update(exercise.interactionIds)
            unknown_spans = set(exercise.contextSpanIds) - span_ids
            if unknown_spans:
                raise ValueError(
                    f"Semantic exercise {exercise.id} references unknown spans: "
                    f"{sorted(unknown_spans)}"
                )
        return self


class AnalyzePageRequest(BaseModel):
    bookId: str
    pageNumber: int = Field(ge=1)
    imagePath: str


class DetectInteractionsRequest(BaseModel):
    imagePath: str
    analysis: PageAnalysis


AnalyzePageResponse = PageAnalysis
