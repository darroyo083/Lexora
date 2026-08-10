from typing import Protocol

from app.schemas.page_analysis import PageAnalysis


class AnalysisProvider(Protocol):
    name: str

    def analyze_page(
        self,
        book_id: str,
        page_number: int,
        image_path: str,
    ) -> PageAnalysis: ...

    def enrich_interactions(
        self,
        image_path: str,
        analysis: PageAnalysis,
    ) -> PageAnalysis: ...


class AnalysisProviderError(RuntimeError):
    """Safe, non-sensitive provider failure surfaced to orchestration."""
