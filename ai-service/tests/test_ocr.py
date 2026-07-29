from unittest.mock import MagicMock, patch

from app.document.ocr import create_page_analysis


def test_disables_geometry_changing_preprocessing():
    page_result = {
        "rec_texts": ["Test"],
        "rec_scores": [0.99],
        "rec_boxes": [[10, 20, 110, 60]],
    }

    with (
        patch("app.document.ocr.PaddleOCR") as paddle_ocr,
        patch("PIL.Image.open") as image_open,
    ):
        image_open.return_value.size = (200, 100)
        paddle_ocr.return_value.predict.return_value = [page_result]

        create_page_analysis("book", 1, "page.png")

    paddle_ocr.assert_called_once_with(
        lang="de",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )
