from fastapi import FastAPI, HTTPException

from app.schemas.page_analysis import (
    AnalyzePageRequest,
    AnalyzePageResponse,
    DetectInteractionsRequest,
    PageAnalysis,
)
from app.answer_key.schema import ExtractAnswerKeyRequest, ExtractAnswerKeyResponse


app = FastAPI(title="Lexora AI Service", version="0.2.0")


@app.get("/health")
def health():
    return {"status": "ok"}


def _get_ocr():
    from app.document.ocr import create_page_analysis

    return create_page_analysis


def _get_interaction_detector():
    from app.document.interaction_detection import detect_interactions

    return detect_interactions


@app.post("/internal/document-analysis/pages", response_model=AnalyzePageResponse)
def analyze_page(request: AnalyzePageRequest):
    return _get_ocr()(
        book_id=request.bookId,
        page_number=request.pageNumber,
        image_path=request.imagePath,
    )


@app.post(
    "/internal/document-analysis/pages/interactions",
    response_model=PageAnalysis,
)
def analyze_interactions(request: DetectInteractionsRequest):
    try:
        return _get_interaction_detector()(request.imagePath, request.analysis)
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
        ocr_fn = _get_ocr()
        analysis = ocr_fn(
            book_id=request.bookId,
            page_number=0,
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
