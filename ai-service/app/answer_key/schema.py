from pydantic import BaseModel, Field

from app.answer_key.parser import AnswerKeyEntry


class ExtractAnswerKeyRequest(BaseModel):
    bookId: str
    rasterPaths: list[str] = Field(min_length=1)
    publisher: str = "cornelsen"


class ExtractAnswerKeyResponse(BaseModel):
    bookId: str
    extractionMethod: str
    parserVersion: str
    sourcePageRange: str
    entries: list[AnswerKeyEntry]
    entryCount: int
