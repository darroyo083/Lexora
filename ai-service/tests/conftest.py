import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.schemas.page_analysis import (
    PageAnalysis,
    ProcessorMetadata,
    TextSpan,
    BBox,
)


@pytest.fixture
def fake_analysis():
    return PageAnalysis(
        pageNumber=1,
        width=800,
        height=600,
        language="de",
        textSpans=[
            TextSpan(
                id="span-1-0-0",
                text="Test",
                confidence=0.99,
                confidenceScope="line",
                bbox=BBox(x=0.1, y=0.1, width=0.15, height=0.02),
            )
        ],
        processor=ProcessorMetadata(
            engine="FakeOCR",
            engineVersion="1.0.0",
            model="fake-v1",
            language="de",
            durationMs=10,
        ),
    )
