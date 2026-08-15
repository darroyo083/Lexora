import re
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from app.schemas.page_analysis import (
    AnalyzePageRequest,
    AnalyzePageResponse,
    DetectInteractionsRequest,
    PageAnalysis,
)
from app.answer_key.schema import ExtractAnswerKeyRequest, ExtractAnswerKeyResponse
from app.assist.contract import AssistProviderError, AssistRequest, AssistResponse
from app.assist.service import run_assist
from app.providers.base import AnalysisProviderError
from app.providers.factory import get_analysis_provider


@asynccontextmanager
async def lifespan(_app: FastAPI):
    get_analysis_provider()
    yield


app = FastAPI(title="Lexora AI Service", version="0.3.0", lifespan=lifespan)
logger = logging.getLogger(__name__)

RASTER_PAGE_NUMBER_RE = re.compile(r"-page(\d+)-\d+dpi\.png$")


def _page_number_from_raster_path(raster_path: str) -> int:
    match = RASTER_PAGE_NUMBER_RE.search(raster_path)
    if match is None:
        raise HTTPException(
            status_code=500,
            detail=(
                "Cannot derive source page number from raster filename "
                "(expected '-page<number>-<dpi>dpi.png')"
            ),
        )
    return int(match.group(1))


@app.post("/internal/assist", response_model=AssistResponse)
def assist(request: AssistRequest):
    try:
        return run_assist(request)
    except AssistProviderError as error:
        logger.warning("assist failure action=%s category=%s", request.action, error.category)
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/health")
def health():
    return {"status": "ok"}


def _get_ocr():
    """Compatibility seam for existing deterministic API tests."""
    return get_analysis_provider().analyze_page


def _get_interaction_detector():
    """Compatibility seam for existing deterministic API tests."""
    return get_analysis_provider().enrich_interactions


@app.post("/internal/document-analysis/pages", response_model=AnalyzePageResponse)
def analyze_page(request: AnalyzePageRequest):
    try:
        return _get_ocr()(
            book_id=request.bookId,
            page_number=request.pageNumber,
            image_path=request.imagePath,
        )
    except AnalysisProviderError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post(
    "/internal/document-analysis/pages/interactions",
    response_model=PageAnalysis,
)
def analyze_interactions(request: DetectInteractionsRequest):
    try:
        return _get_interaction_detector()(
            request.imagePath, request.analysis
        )
    except AnalysisProviderError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post(
    "/internal/answer-key/extract",
    response_model=ExtractAnswerKeyResponse,
)
def extract_answer_key(request: ExtractAnswerKeyRequest):
    from app.answer_key.parser import AnswerKeyParser
    from app.answer_key.cornelsen_parser import CornelsenAnswerKeyParser
    from app.answer_key.stub_parser import StubAnswerKeyParser

    parsers: dict[str, AnswerKeyParser] = {
        "cornelsen": CornelsenAnswerKeyParser(),
        "stub": StubAnswerKeyParser(),
    }
    parser = parsers.get(request.publisher.lower())
    if parser is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown publisher: {request.publisher}. Available: {list(parsers.keys())}",
        )

    all_entries: list = []
    for raster_path in request.rasterPaths:
        page_number = _page_number_from_raster_path(raster_path)
        analysis = _get_ocr()(
            book_id=request.bookId,
            page_number=page_number,
            image_path=raster_path,
        )
        raw_spans = [
            {
                "id": s.id,
                "text": s.text,
                "confidence": s.confidence,
                "bbox": {"x": s.bbox.x, "y": s.bbox.y, "width": s.bbox.width, "height": s.bbox.height},
                "parentLineId": getattr(s, "parentLineId", None),
            }
            for s in analysis.textSpans
        ]
        entries = parser.parse(raw_spans)
        all_entries.extend(entries)

    if not all_entries:
        raise HTTPException(
            status_code=422,
            detail="No answer key entries extracted from provided pages",
        )

    min_page = min(e.pageNumber for e in all_entries)
    max_page = max(e.pageNumber for e in all_entries)
    source_range = f"{min_page}-{max_page}" if min_page != max_page else str(min_page)

    return ExtractAnswerKeyResponse(
        bookId=request.bookId,
        extractionMethod=parser.publisher(),
        parserVersion="1.0.0",
        sourcePageRange=source_range,
        entries=all_entries,
        entryCount=len(all_entries),
    )
