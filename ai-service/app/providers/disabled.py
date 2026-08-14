"""A no-op analysis provider for deployments that only run text assistance.

The production public stack keeps ai-service internal for the optional
Contextual AI Assistance feature and does not run document analysis. This
provider lets the service start without PaddleOCR or a Vision API key while
making the analysis endpoints fail closed (503) if ever called.
"""

from app.providers.base import AnalysisProviderError
from app.schemas.page_analysis import PageAnalysis


class DisabledAnalysisProvider:
    name = "disabled"

    def analyze_page(self, book_id: str, page_number: int, image_path: str) -> PageAnalysis:
        del book_id, page_number, image_path
        raise AnalysisProviderError("Document analysis is disabled in this deployment")

    def enrich_interactions(self, image_path: str, analysis: PageAnalysis) -> PageAnalysis:
        del image_path, analysis
        raise AnalysisProviderError("Document analysis is disabled in this deployment")
