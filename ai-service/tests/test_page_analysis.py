import json
from app.schemas.page_analysis import (
    BBox,
    Dimensions,
    TextSpan,
    PageAnalysis,
    ProcessorMetadata,
    AnalyzePageRequest,
    AnalyzePageResponse,
)


class TestSchemas:
    def test_bbox_validation(self):
        b = BBox(x=0.5, y=0.3, width=0.2, height=0.1)
        assert b.x == 0.5

    def test_bbox_clamps(self):
        b = BBox(x=1.0, y=1.0, width=1.0, height=1.0)
        assert b.x + b.width == 2.0  # allowed — we clamp in normalization

    def test_dimensions(self):
        d = Dimensions(sourceWidth=2480, sourceHeight=3508)
        assert d.sourceWidth == 2480

    def test_text_span(self):
        ts = TextSpan(
            id="span-1-0",
            text="Beispiel",
            confidence=0.97,
            confidenceScope="line",
            bbox=BBox(x=0.31, y=0.42, width=0.09, height=0.018),
        )
        d = ts.model_dump()
        assert d["id"] == "span-1-0"

    def test_page_analysis_json(self):
        pa = PageAnalysis(
            pageNumber=1,
            dimensions=Dimensions(sourceWidth=2480, sourceHeight=3508),
            language="de",
            textSpans=[
                TextSpan(
                    id="s1",
                    text="Hallo",
                    confidence=0.98,
                    confidenceScope="line",
                    bbox=BBox(x=0.1, y=0.2, width=0.15, height=0.02),
                )
            ],
            processor=ProcessorMetadata(
                engine="PaddleOCR",
                engineVersion="3.7.0",
                model="PP-OCRv6",
                language="de",
                durationMs=350,
            ),
        )
        j = pa.model_dump_json()
        data = json.loads(j)
        assert data["schemaVersion"] == "0.1.0"
        assert data["pageNumber"] == 1
        assert len(data["textSpans"]) == 1

    def test_analyze_request(self):
        req = AnalyzePageRequest(
            bookId="abc-123",
            pageNumber=5,
            imagePath="/tmp/page5.png",
        )
        assert req.bookId == "abc-123"

    def test_analyze_response(self):
        resp = AnalyzePageResponse(
            pageNumber=3,
            width=2480,
            height=3508,
            language="de",
            textSpans=[],
            processor={"engine": "test", "model": "fake"},
        )
        assert resp.pageNumber == 3
