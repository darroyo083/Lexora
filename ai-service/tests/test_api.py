from fastapi.testclient import TestClient
from unittest.mock import patch
from app.api.main import app
from tests.conftest import fake_analysis


client = TestClient(app)


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
        assert data["language"] == "de"
        assert len(data["textSpans"]) == 1
        assert data["textSpans"][0]["text"] == "Test"
        assert data["processor"]["engine"] == "FakeOCR"

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
