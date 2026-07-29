# Persisted PageAnalysis

`PageAnalysis` is the per-page OCR result stored as JSONB in `book_pages.analysis`. It describes text in source-image coordinates and never stores browser viewport pixels.

## Persisted Shape

The current FastAPI response persisted by Spring has this shape:

```json
{
  "pageNumber": 10,
  "width": 2284,
  "height": 3121,
  "language": "de",
  "textSpans": [
    {
      "id": "span-10-0",
      "text": "Ich bin, du hast, er möchte",
      "confidence": 0.99,
      "confidenceScope": "line",
      "parentLineId": "line-10-0",
      "bbox": {
        "x": 0.13,
        "y": 0.03,
        "width": 0.39,
        "height": 0.03
      }
    }
  ],
  "processor": {
    "engine": "PaddleOCR",
    "engineVersion": "3.7.0",
    "model": "PP-OCRv6",
    "language": "de",
    "parameters": {
      "use_doc_orientation_classify": false,
      "use_doc_unwarping": false,
      "use_textline_orientation": false,
      "paddlepaddle": "3.2.2",
      "word_boxes": "auto (line-level fallback)"
    },
    "processedAt": "2026-07-29T17:54:27Z",
    "durationMs": 23000
  }
}
```

`width` and `height` are the raster dimensions used by PaddleOCR. The example values are from the verified page 10 raster; they are not universal page constants.

## Coordinate Model

| Property | Contract |
|---|---|
| Origin | Top-left `(0,0)` |
| Range | Each bbox component is normalized to `[0,1]` |
| Source | Original PDFBox raster before OCR preprocessing |
| Persistence | Resolution-independent values only |
| Rendering | CSS percentages relative to the displayed PDF canvas wrapper |

For a source pixel box `(left, top, right, bottom)`:

```text
x      = left / sourceWidth
y      = top / sourceHeight
width  = (right - left) / sourceWidth
height = (bottom - top) / sourceHeight
```

The frontend renders `x`, `y`, `width`, and `height` directly as percentages. Canvas intrinsic dimensions may be scaled for `devicePixelRatio`, but canvas CSS dimensions and the overlay rectangle remain identical.

## Geometry Preservation

PaddleOCR preprocessing that changes document geometry is disabled:

- `use_doc_orientation_classify = false`
- `use_doc_unwarping = false`
- `use_textline_orientation = false`

This is a correctness requirement. Normalizing boxes from a warped image against original raster dimensions produces systematic displacement even when both images report the same width and height.

## Text and Confidence

| Field | Meaning |
|---|---|
| `id` | Stable identifier within the page result |
| `text` | Recognized line or word text |
| `confidence` | PaddleOCR recognition confidence in `[0,1]` |
| `confidenceScope` | Currently `line` |
| `parentLineId` | Source line for word-derived spans |
| `bbox` | Normalized source rectangle |

When PaddleOCR exposes word boxes, words inherit their parent line confidence. Otherwise Lexora stores a line-level fallback box.

## Persistence and Reuse

- A successful page is stored with `processing_status = READY` and its JSONB analysis.
- Opening or returning to a `READY` page loads the stored JSON and never starts OCR.
- A hard refresh restores the current book, PDF, selected page, and existing page analysis.
- A `FAILED` page retains its failure reason and can be explicitly retried.
- Missing pages remain unprocessed until the user chooses **Process**.
