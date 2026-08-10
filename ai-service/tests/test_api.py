from fastapi.testclient import TestClient
from unittest.mock import patch
from app.api.main import app
from app.schemas.page_analysis import (
    BlankDetectionMetadata,
    PageAnalysis,
    ProcessorMetadata,
    TextSpan,
    BBox,
)
from tests.conftest import fake_analysis
from app.providers.base import AnalysisProviderError


client = TestClient(app)


def _answer_key_analysis(spans: list[TextSpan]) -> PageAnalysis:
    return PageAnalysis(
        pageNumber=1,
        width=800,
        height=600,
        language="de",
        textSpans=spans,
        processor=ProcessorMetadata(
            engine="FakeOCR",
            engineVersion="1.0.0",
            model="fake-v1",
            language="de",
            durationMs=10,
        ),
    )


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestAnalyzePage:
    @patch("app.api.main._get_ocr")
    def test_analyze_page_returns_response(self, mock_get_ocr, fake_analysis):
        mock_create = mock_get_ocr.return_value
        mock_create.return_value = fake_analysis

        response = client.post(
            "/internal/document-analysis/pages",
            json={
                "bookId": "test-book",
                "pageNumber": 1,
                "imagePath": "/tmp/test.png",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["pageNumber"] == 1
        assert data["schemaVersion"] == "0.2.0"
        assert data["width"] == 800
        assert data["height"] == 600
        assert data["language"] == "de"
        assert len(data["textSpans"]) == 1
        assert data["textSpans"][0]["text"] == "Test"
        assert data["processor"]["engine"] == "FakeOCR"
        assert data["exerciseBlanks"] == []
        assert data["blankDetection"] is None
        assert data["choiceTargets"] == []
        assert data["choiceGroups"] == []
        assert data["choiceDetection"] is None

    def test_rejects_empty_body(self):
        response = client.post(
            "/internal/document-analysis/pages",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 422

    def test_rejects_null_body(self):
        response = client.post(
            "/internal/document-analysis/pages",
            content="null",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 422

    def test_rejects_missing_fields(self):
        response = client.post(
            "/internal/document-analysis/pages",
            json={"bookId": "abc"},
        )
        assert response.status_code == 422

    @patch("app.api.main._get_ocr")
    def test_provider_failure_is_explicit_and_recoverable(self, mock_get_ocr):
        mock_get_ocr.return_value.side_effect = AnalysisProviderError(
            "Vision provider is unavailable"
        )
        response = client.post(
            "/internal/document-analysis/pages",
            json={
                "bookId": "test-book",
                "pageNumber": 1,
                "imagePath": "/tmp/test.png",
            },
        )
        assert response.status_code == 503
        assert response.json() == {"detail": "Vision provider is unavailable"}

    @patch("app.api.main._get_ocr")
    def test_accepts_all_required_fields(self, mock_get_ocr, fake_analysis):
        mock_get_ocr.return_value.return_value = fake_analysis
        response = client.post(
            "/internal/document-analysis/pages",
            json={
                "bookId": "test-book",
                "pageNumber": 5,
                "imagePath": "/data/page.png",
            },
        )
        # 200 only if OCR mock is active — without mock, this hits real OCR
        # which isn't available in CI. We test the validation passes (not 422).
        assert response.status_code != 422


class TestAnalyzeInteractions:
    @patch("app.api.main._get_interaction_detector")
    def test_returns_enriched_page_analysis(
        self, mock_get_detector, fake_analysis
    ):
        enriched = fake_analysis.model_copy(
            update={
                "blankDetection": BlankDetectionMetadata(
                    rawCandidateCount=0,
                    acceptedCount=0,
                    durationMs=1,
                )
            }
        )
        mock_get_detector.return_value.return_value = enriched

        response = client.post(
            "/internal/document-analysis/pages/interactions",
            json={
                "imagePath": "/data/page.png",
                "analysis": fake_analysis.model_dump(mode="json"),
            },
        )

        assert response.status_code == 200
        assert response.json()["blankDetection"]["acceptedCount"] == 0
        detector = mock_get_detector.return_value
        assert detector.call_args.args[0] == "/data/page.png"

    @patch("app.api.main._get_interaction_detector")
    def test_maps_invalid_image_to_bad_request(
        self, mock_get_detector, fake_analysis
    ):
        mock_get_detector.return_value.side_effect = ValueError("bad image")

        response = client.post(
            "/internal/document-analysis/pages/interactions",
            json={
                "imagePath": "/data/page.png",
                "analysis": fake_analysis.model_dump(mode="json"),
            },
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "bad image"


class TestExtractAnswerKey:
    def _loesungen_analysis(self, page_number: int = 1) -> PageAnalysis:
        return _answer_key_analysis([
            TextSpan(
                id=f"span-{page_number}-0-0",
                text="L\u00f6sungen",
                confidence=0.99,
                confidenceScope="line",
                parentLineId=f"line-{page_number}-0",
                bbox=BBox(x=0.1, y=0.02, width=0.2, height=0.02),
            ),
            TextSpan(
                id=f"span-{page_number}-1-0",
                text="12 Artikel",
                confidence=0.99,
                confidenceScope="line",
                parentLineId=f"line-{page_number}-1",
                bbox=BBox(x=0.1, y=0.05, width=0.2, height=0.02),
            ),
            TextSpan(
                id=f"span-{page_number}-2-0",
                text="1 1. der Hund",
                confidence=0.99,
                confidenceScope="line",
                parentLineId=f"line-{page_number}-2",
                bbox=BBox(x=0.1, y=0.08, width=0.3, height=0.02),
            ),
        ])

    @patch("app.api.main._get_ocr")
    def test_extracts_typed_entries(self, mock_get_ocr):
        mock_get_ocr.return_value.return_value = self._loesungen_analysis()

        response = client.post(
            "/internal/answer-key/extract",
            json={
                "bookId": "book-1",
                "rasterPaths": ["/data/key-page201-300dpi.png"],
                "publisher": "cornelsen",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["bookId"] == "book-1"
        assert data["extractionMethod"] == "cornelsen"
        assert data["parserVersion"] == "1.0.0"
        assert data["entryCount"] == 1
        entry = data["entries"][0]
        assert entry["exerciseNumber"] == "12"
        assert entry["expectedValue"] == "1. der Hund"
        assert entry["typedPayload"]["type"] == "Text"
        assert entry["typedPayload"]["value"] == "1. der Hund"

    @patch("app.api.main._get_ocr")
    def test_forwards_raster_paths_to_ocr(self, mock_get_ocr):
        mock_get_ocr.return_value.return_value = self._loesungen_analysis()

        response = client.post(
            "/internal/answer-key/extract",
            json={
                "bookId": "book-1",
                "rasterPaths": [
                    "/data/key-page201-300dpi.png",
                    "/data/key-page202-300dpi.png",
                ],
                "publisher": "cornelsen",
            },
        )

        assert response.status_code == 200
        ocr = mock_get_ocr.return_value
        assert ocr.call_count == 2
        assert ocr.call_args_list[0].kwargs["image_path"] == "/data/key-page201-300dpi.png"
        assert ocr.call_args_list[1].kwargs["image_path"] == "/data/key-page202-300dpi.png"

    @patch("app.api.main._get_ocr")
    def test_accepts_bounded_production_raster_dpi(self, mock_get_ocr):
        mock_get_ocr.return_value.return_value = self._loesungen_analysis()

        response = client.post(
            "/internal/answer-key/extract",
            json={
                "bookId": "book-1",
                "rasterPaths": ["/data/key-page201-160dpi.png"],
                "publisher": "cornelsen",
            },
        )

        assert response.status_code == 200
        assert mock_get_ocr.return_value.call_args.kwargs["page_number"] == 201

    @patch("app.api.main._get_ocr")
    def test_unknown_publisher_is_bad_request(self, mock_get_ocr):
        mock_get_ocr.return_value.return_value = self._loesungen_analysis()

        response = client.post(
            "/internal/answer-key/extract",
            json={
                "bookId": "book-1",
                "rasterPaths": ["/data/key-page201-300dpi.png"],
                "publisher": "unknown-house",
            },
        )

        assert response.status_code == 400

    @patch("app.api.main._get_ocr")
    def test_no_entries_is_unprocessable(self, mock_get_ocr):
        mock_get_ocr.return_value.return_value = _answer_key_analysis([])

        response = client.post(
            "/internal/answer-key/extract",
            json={
                "bookId": "book-1",
                "rasterPaths": ["/data/key-page201-300dpi.png"],
                "publisher": "cornelsen",
            },
        )

        assert response.status_code == 422

    @patch("app.api.main._get_ocr")
    def test_passes_real_page_number_per_raster(self, mock_get_ocr):
        mock_get_ocr.return_value.return_value = self._loesungen_analysis()

        response = client.post(
            "/internal/answer-key/extract",
            json={
                "bookId": "book-1",
                "rasterPaths": [
                    "/data/key-page201-300dpi.png",
                    "/data/key-page202-300dpi.png",
                    "/data/key-page203-300dpi.png",
                ],
                "publisher": "cornelsen",
            },
        )

        assert response.status_code == 200
        ocr = mock_get_ocr.return_value
        assert ocr.call_count == 3
        for expected_page, call in zip([201, 202, 203], ocr.call_args_list):
            assert call.kwargs["page_number"] == expected_page
            assert (
                call.kwargs["image_path"]
                == f"/data/key-page{expected_page}-300dpi.png"
            )

    @patch("app.api.main._get_ocr")
    def test_page_one_supported_and_never_zero(self, mock_get_ocr):
        mock_get_ocr.return_value.return_value = self._loesungen_analysis()

        response = client.post(
            "/internal/answer-key/extract",
            json={
                "bookId": "book-1",
                "rasterPaths": [
                    "/data/key-page1-300dpi.png",
                    "/data/key-page2-300dpi.png",
                    "/data/key-page3-300dpi.png",
                ],
                "publisher": "cornelsen",
            },
        )

        assert response.status_code == 200
        ocr = mock_get_ocr.return_value
        pages = [call.kwargs["page_number"] for call in ocr.call_args_list]
        assert pages == [1, 2, 3]
        assert all(p >= 1 for p in pages)

    @patch("app.api.main._get_ocr")
    def test_ignores_unrelated_digits_in_filename(self, mock_get_ocr):
        mock_get_ocr.return_value.return_value = self._loesungen_analysis()

        response = client.post(
            "/internal/answer-key/extract",
            json={
                "bookId": "book-1",
                "rasterPaths": [
                    "/data/Grammatik-Aktiv-A1-B1-Ausgabe-page227-300dpi.png",
                ],
                "publisher": "cornelsen",
            },
        )

        assert response.status_code == 200
        ocr = mock_get_ocr.return_value
        assert ocr.call_args_list[0].kwargs["page_number"] == 227

    @patch("app.api.main._get_ocr")
    def test_integration_style_constructs_real_page_analysis(self, mock_get_ocr):
        def _wrapped_ocr(book_id, page_number, image_path):
            return self._loesungen_analysis(page_number=page_number)

        mock_get_ocr.return_value.side_effect = _wrapped_ocr

        response = client.post(
            "/internal/answer-key/extract",
            json={
                "bookId": "book-1",
                "rasterPaths": [
                    "/data/key-page201-300dpi.png",
                    "/data/key-page202-300dpi.png",
                ],
                "publisher": "cornelsen",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert [e["pageNumber"] for e in data["entries"]] == [201, 202]

    @patch("app.api.main._get_ocr")
    def test_entries_carry_source_page_number(self, mock_get_ocr):
        mock_get_ocr.return_value.return_value = self._loesungen_analysis(
            page_number=201
        )

        response = client.post(
            "/internal/answer-key/extract",
            json={
                "bookId": "book-1",
                "rasterPaths": ["/data/key-page201-300dpi.png"],
                "publisher": "cornelsen",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["entryCount"] == 1
        assert data["entries"][0]["pageNumber"] == 201
        assert data["sourcePageRange"] == "201"

    @patch("app.api.main._get_ocr")
    def test_fail_closed_when_page_number_unparseable(self, mock_get_ocr):
        response = client.post(
            "/internal/answer-key/extract",
            json={
                "bookId": "book-1",
                "rasterPaths": ["/data/unknown-raster.png"],
                "publisher": "cornelsen",
            },
        )

        assert response.status_code == 500
        detail = response.json()["detail"]
        assert "/data/unknown-raster.png" in detail
        assert "page" in detail.lower()
        mock_get_ocr.return_value.assert_not_called()
