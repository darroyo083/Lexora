# Persisted PageAnalysis v0.2

`PageAnalysis` is the per-page document result stored as JSONB in `book_pages.analysis`. It stores OCR spans and graphical exercise blanks in source-image coordinates, never browser viewport pixels.

## Persisted Shape

```json
{
  "schemaVersion": "0.2.0",
  "pageNumber": 11,
  "width": 2285,
  "height": 3122,
  "language": "de",
  "textSpans": [],
  "exerciseBlanks": [
    {
      "id": "blank-11-1",
      "kind": "fill-in-line",
      "lineBbox": { "x": 0.21, "y": 0.10, "width": 0.09, "height": 0.001 },
      "interactionBbox": { "x": 0.21, "y": 0.086, "width": 0.09, "height": 0.018 },
      "detectionMethod": "horizontal-line-v1",
      "candidateScore": 0.89,
      "nearbyTextSpanIds": ["span-11-2", "span-11-3"]
    }
  ],
  "blankDetection": {
    "detectionMethod": "horizontal-line-v1",
    "rawCandidateCount": 76,
    "acceptedCount": 37,
    "durationMs": 192
  },
  "processor": {
    "engine": "PaddleOCR",
    "engineVersion": "3.7.0",
    "model": "PP-OCRv6",
    "language": "de",
    "parameters": {},
    "processedAt": "2026-07-30T17:04:00Z",
    "durationMs": 18943
  }
}
```

`width` and `height` are the PDFBox raster dimensions. They are validation and provenance values, not universal page constants.

## Geometry

| Property | Contract |
|---|---|
| Origin | Top-left `(0,0)` |
| Range | Each bbox component is normalized to `[0,1]` |
| Reference | Original PDFBox raster before OCR or OpenCV pixel operations |
| Persistence | Resolution-independent values only |
| Rendering | CSS percentages relative to the displayed PDF canvas wrapper |

For source pixels `(left, top, right, bottom)`:

```text
x      = left / width
y      = top / height
width  = (right - left) / width
height = (bottom - top) / height
```

`lineBbox` describes the detected printed line. `interactionBbox` is taller and uses nearby OCR height; the physical line is positioned near the text baseline. Input width always follows the detected line width.

PaddleOCR orientation classification, document unwarping, and text-line orientation remain disabled. OpenCV changes pixel values only; it does not rotate, crop, resize, deskew, or perspective-correct the geometry reference.

## Scores and Provenance

`candidateScore` is a deterministic heuristic score based on relative line width, aspect ratio, and nearby OCR evidence. It is not a probability and is not called confidence. `detectionMethod` identifies the heuristic version and can be either `horizontal-line-v1` (full-word blanks) or `short-suffix-line-v1` (conservative verb-ending blanks).

`blankDetection` stores only concise operational metadata: raw and accepted counts plus duration. It does not contain images, contours, or large debug payloads.

## Compatibility

- Missing `exerciseBlanks` normalizes to an empty list.
- Missing `schemaVersion` is treated as `legacy`.
- A legacy `READY` page remains readable and is not reprocessed automatically.
- The frontend exposes **Update analysis** for legacy pages. This explicitly reuses the raster where available and runs the current OCR and blank pipeline.
- A current v0.2 `READY` page restores through GET only.

## Persistence

A successful final analysis is stored atomically with `processing_status = READY`. Refresh and page navigation load the same JSONB geometry without rasterization, OCR, or blank detection. A processing or detection exception stores `FAILED` with a technical `failureReason`; the existing Retry action claims a new attempt.
