import json
from app.schemas.page_analysis import (
    BBox,
    BlankDetectionMetadata,
    ExerciseBlank,
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

    def test_bbox_components_are_bounded(self):
        b = BBox(x=1.0, y=1.0, width=1.0, height=1.0)
        assert b.x == 1.0
        assert b.width == 1.0

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
            width=2480,
            height=3508,
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
        assert data["schemaVersion"] == "0.2.0"
        assert data["pageNumber"] == 1
        assert len(data["textSpans"]) == 1
        assert data["exerciseBlanks"] == []
        assert data["blankDetection"] is None

    def test_analyze_request(self):
        req = AnalyzePageRequest(
            bookId="abc-123",
            pageNumber=5,
            imagePath="/tmp/page5.png",
        )
        assert req.bookId == "abc-123"

    def test_analyze_response(self):
        resp = AnalyzePageResponse(
            schemaVersion="0.2.0",
            pageNumber=3,
            width=2480,
            height=3508,
            language="de",
            textSpans=[],
            exerciseBlanks=[
                ExerciseBlank(
                    id="blank-3-1",
                    lineBbox=BBox(x=0.2, y=0.3, width=0.1, height=0.002),
                    interactionBbox=BBox(
                        x=0.2, y=0.29, width=0.1, height=0.02
                    ),
                    candidateScore=0.8,
                    nearbyTextSpanIds=["span-3-1"],
                )
            ],
            blankDetection=BlankDetectionMetadata(
                rawCandidateCount=1,
                acceptedCount=1,
                durationMs=4,
            ),
            processor={
                "engine": "test",
                "engineVersion": "1",
                "model": "fake",
                "language": "de",
                "durationMs": 1,
            },
        )
        assert resp.pageNumber == 3
