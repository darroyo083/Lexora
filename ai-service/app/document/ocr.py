import logging
import time

from paddleocr import PaddleOCR  # type: ignore[import-untyped]

from app.schemas.page_analysis import (
    BBox,
    TextSpan,
    PageAnalysis,
    ProcessorMetadata,
)
from app.document.normalization import normalize_bbox
from app.document.encoding import repair_utf8


logger = logging.getLogger(__name__)


def create_page_analysis(
    book_id: str,
    page_number: int,
    image_path: str,
) -> PageAnalysis:
    from PIL import Image

    img = Image.open(image_path)
    source_width, source_height = img.size

    logger.info("OCR started page=%s image=%s", page_number, image_path)

    ocr = PaddleOCR(
        lang="de",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )

    t0 = time.monotonic()
    result = ocr.predict(str(image_path))
    elapsed_ms = int((time.monotonic() - t0) * 1000)

    page_result = result[0]

    raw_spans: list[dict] = []
    for i, line_text in enumerate(page_result.get("rec_texts", [])):
        line_conf = float(page_result.get("rec_scores", [0.0])[i])
        line_id = f"line-{page_number}-{i}"

        word_boxes = page_result.get("text_word_boxes", [])
        word_texts = page_result.get("text_word", [])

        if i < len(word_boxes) and word_boxes[i] and i < len(word_texts):
            for j, (word, wbox) in enumerate(
                zip(word_texts[i], word_boxes[i])
            ):
                if not word or not word.strip():
                    continue
                word = repair_utf8(word)
                left, top, right, bottom = wbox
                nx, ny, nw, nh = normalize_bbox(
                    left, top, right, bottom,
                    source_width, source_height,
                )
                raw_spans.append({
                    "id": f"span-{page_number}-{i}-{j}",
                    "text": word,
                    "confidence": line_conf,
                    "confidenceScope": "line",
                    "parentLineId": line_id,
                    "x": nx,
                    "y": ny,
                    "width": nw,
                    "height": nh,
                })
        else:
            rec_boxes = page_result.get("rec_boxes", [])
            if i < len(rec_boxes):
                left, top, right, bottom = rec_boxes[i]
                nx, ny, nw, nh = normalize_bbox(
                    left, top, right, bottom,
                    source_width, source_height,
                )
                raw_spans.append({
                    "id": f"span-{page_number}-{i}",
                    "text": repair_utf8(line_text),
                    "confidence": line_conf,
                    "confidenceScope": "line",
                    "parentLineId": line_id,
                    "x": nx,
                    "y": ny,
                    "width": nw,
                    "height": nh,
                })

    spans = [
        TextSpan(
            id=s["id"],
            text=s["text"],
            confidence=s["confidence"],
            confidenceScope=s["confidenceScope"],
            parentLineId=s.get("parentLineId"),
            bbox=BBox(
                x=s["x"],
                y=s["y"],
                width=s["width"],
                height=s["height"],
            ),
        )
        for s in raw_spans
    ]

    analysis = PageAnalysis(
        pageNumber=page_number,
        width=source_width,
        height=source_height,
        language="de",
        textSpans=spans,
        exerciseBlanks=[],
        blankDetection=None,
        processor=ProcessorMetadata(
            engine="PaddleOCR",
            engineVersion="3.7.0",
            model="PP-OCRv6",
            language="de",
            parameters={
                "use_doc_orientation_classify": False,
                "use_doc_unwarping": False,
                "use_textline_orientation": False,
                "paddlepaddle": "3.2.2",
                "word_boxes": "auto (line-level fallback)",
            },
            durationMs=elapsed_ms,
        ),
    )
    logger.info(
        "OCR completed page=%s spans=%s duration_ms=%s",
        page_number,
        len(spans),
        elapsed_ms,
    )
    return analysis
