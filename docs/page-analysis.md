# PageAnalysis

The central data model representing what Lexora understands about a page.

## Schema

```json
{
  "schemaVersion": "0.1.0",
  "pageNumber": 5,
  "dimensions": {
    "sourceWidth": 2480,
    "sourceHeight": 3508
  },
  "language": "de",
  "textSpans": [
    {
      "id": "span-5-0-0",
      "text": "wahrscheinlich",
      "confidence": 0.97,
      "confidenceScope": "line",
      "parentLineId": "line-5-0",
      "bbox": {
        "x": 0.31,
        "y": 0.42,
        "width": 0.09,
        "height": 0.018
      }
    }
  ],
  "processor": {
    "engine": "PaddleOCR",
    "engineVersion": "3.7.0",
    "model": "PP-OCRv6",
    "language": "de",
    "parameters": {"use_angle_cls": false},
    "processedAt": "2026-07-29T10:00:00Z",
    "durationMs": 350
  }
}
```

## Coordinate System

- **Origin:** top-left (0, 0)
- **Range:** normalized [0, 1]
- **Resolution independent:** same values across any DPI, zoom, or viewport
- **Source dimensions** preserved for debug pixel reconstruction via `denormalizeBBox()`

CSS absolute pixel positions for overlays are computed at render time:

```
viewportLeft = bbox.x * viewportPixelWidth
viewportTop  = bbox.y * viewportPixelHeight
viewportWidth  = bbox.width * viewportPixelWidth
viewportHeight = bbox.height * viewportPixelHeight
```

Never persist viewport-dependent coordinates.

## TextSpan

| Field | Type | Description |
|---|---|---|
| id | string | Unique span identifier (`span-{page}-{line}-{word}`) |
| text | string | Recognized text |
| confidence | float | Recognition confidence (0-1) |
| confidenceScope | string | Granularity of the confidence value (`"line"`) |
| parentLineId | string? | ID of the detected text line containing this span |
| bbox | BBox | Normalized bounding box |

## Confidence Scope

PaddleOCR provides **line-level** recognition confidence. When CTC-derived word boxes are available, each word span inherits its parent line's confidence. This means:

- Two words on the same line show identical confidence values
- Confidence reflects recognition quality of the entire line, not individual words
- The `confidenceScope` field explicitly records this lineage

## Processor Metadata

Enables traceability for page analysis reproduction:

- `engine` / `engineVersion`: OCR engine identity
- `model`: Specific model used (e.g., PP-OCRv6)
- `language`: Language configuration
- `parameters`: Non-default settings (angle classification disabled for clean scans)
- `processedAt`: UTC timestamp
- `durationMs`: Processing wall-clock time

## Normalization Functions

### Python

```python
def normalize_bbox(left, top, right, bottom, source_width, source_height) -> (x, y, w, h)
def denormalize_bbox(x, y, w, h, source_width, source_height) -> (left, top, right, bottom)
```

### TypeScript

```typescript
function normalizeBBox(pixelLeft, pixelTop, pixelRight, pixelBottom, sw, sh): BBox
function denormalizeBBox(bbox, sw, sh): { left, top, right, bottom }
function documentToViewport(bbox, vpWidth, vpHeight): { left, top, width, height }
```

Both implementations clamp values to [0, 1] and round-trip cleanly.
