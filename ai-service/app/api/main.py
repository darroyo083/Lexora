from fastapi import FastAPI
from app.schemas.page_analysis import AnalyzePageRequest, AnalyzePageResponse

app = FastAPI(title="Lexora AI Service", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok"}


def _get_ocr():
    from app.document.ocr import create_page_analysis

    return create_page_analysis


@app.post("/internal/document-analysis/pages", response_model=AnalyzePageResponse)
def analyze_page(request: AnalyzePageRequest):
    create_page_analysis = _get_ocr()
    analysis = create_page_analysis(
        book_id=request.bookId,
        page_number=request.pageNumber,
        image_path=request.imagePath,
    )

    return AnalyzePageResponse(
        pageNumber=analysis.pageNumber,
        width=analysis.dimensions.sourceWidth,
        height=analysis.dimensions.sourceHeight,
        language=analysis.language,
        textSpans=[
            {
                "id": s.id,
                "text": s.text,
                "confidence": s.confidence,
                "confidenceScope": s.confidenceScope,
                "parentLineId": s.parentLineId,
                "bbox": s.bbox.model_dump(),
            }
            for s in analysis.textSpans
        ],
        processor=analysis.processor.model_dump(mode="json"),
    )
