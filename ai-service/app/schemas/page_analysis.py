from datetime import datetime, timezone
from pydantic import BaseModel, Field


class BBox(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(ge=0, le=1)
    height: float = Field(ge=0, le=1)


class Dimensions(BaseModel):
    sourceWidth: int = Field(gt=0)
    sourceHeight: int = Field(gt=0)


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
    durationMs: int


class PageAnalysis(BaseModel):
    schemaVersion: str = "0.1.0"
    pageNumber: int = Field(ge=1)
    dimensions: Dimensions
    language: str
    textSpans: list[TextSpan] = Field(default_factory=list)
    processor: ProcessorMetadata


class AnalyzePageRequest(BaseModel):
    bookId: str
    pageNumber: int = Field(ge=1)
    imagePath: str


class AnalyzePageResponse(BaseModel):
    pageNumber: int
    width: int
    height: int
    language: str
    textSpans: list[dict] = Field(default_factory=list)
    processor: dict
