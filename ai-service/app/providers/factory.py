import importlib.util
import os
from functools import lru_cache

from app.providers.base import AnalysisProvider, AnalysisProviderError
from app.providers.opencode_go_vision import OpenCodeGoVisionProvider


@lru_cache(maxsize=1)
def get_analysis_provider() -> AnalysisProvider:
    provider = os.getenv("LEXORA_ANALYSIS_PROVIDER", "local-ocr").strip().lower()
    if provider == "disabled":
        from app.providers.disabled import DisabledAnalysisProvider

        return DisabledAnalysisProvider()
    if provider == "local-ocr":
        if importlib.util.find_spec("paddleocr") is None:
            raise AnalysisProviderError(
                "Local OCR provider selected, but PaddleOCR is not installed"
            )
        from app.providers.local_ocr import LocalOcrProvider

        return LocalOcrProvider()
    if provider == "opencode-go":
        return OpenCodeGoVisionProvider()
    raise AnalysisProviderError(f"Unsupported analysis provider: {provider}")


def reset_analysis_provider() -> None:
    get_analysis_provider.cache_clear()
