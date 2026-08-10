from app.schemas.page_analysis import PageAnalysis


class LocalOcrProvider:
    """Development provider. Imports PaddleOCR only when local OCR is selected."""

    name = "local-ocr"

    def analyze_page(
        self,
        book_id: str,
        page_number: int,
        image_path: str,
    ) -> PageAnalysis:
        from app.document.ocr import create_page_analysis

        return create_page_analysis(book_id, page_number, image_path)

    def enrich_interactions(
        self,
        image_path: str,
        analysis: PageAnalysis,
    ) -> PageAnalysis:
        from app.document.interaction_detection import detect_interactions

        return detect_interactions(image_path, analysis)
