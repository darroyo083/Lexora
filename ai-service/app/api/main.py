from fastapi import FastAPI, HTTPException

from app.schemas.page_analysis import (
    AnalyzePageRequest,
    AnalyzePageResponse,
    DetectExerciseBlanksRequest,
    PageAnalysis,
)


app = FastAPI(title="Lexora AI Service", version="0.2.0")


@app.get("/health")
def health():
    return {"status": "ok"}


def _get_ocr():
    from app.document.ocr import create_page_analysis

    return create_page_analysis


def _get_blank_detector():
    from app.document.blank_detection import detect_exercise_blanks

    return detect_exercise_blanks


@app.post("/internal/document-analysis/pages", response_model=AnalyzePageResponse)
def analyze_page(request: AnalyzePageRequest):
    return _get_ocr()(
        book_id=request.bookId,
        page_number=request.pageNumber,
        image_path=request.imagePath,
    )


@app.post(
    "/internal/document-analysis/pages/exercise-blanks",
    response_model=PageAnalysis,
)
def analyze_exercise_blanks(request: DetectExerciseBlanksRequest):
    try:
        return _get_blank_detector()(request.imagePath, request.analysis)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
