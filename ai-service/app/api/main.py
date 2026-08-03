from fastapi import FastAPI, HTTPException

from app.schemas.page_analysis import (
    AnalyzePageRequest,
    AnalyzePageResponse,
    DetectInteractionsRequest,
    PageAnalysis,
)


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
