# Graphical Exercise Detection

Lexora detects printed exercise interactions locally with OpenCV. OCR recognizes nearby language; OpenCV finds the graphical structures themselves. No Gemini, VLM, cloud OCR, external model, or remote image analysis is used.

Six detector families exist today:

- **Fill-in blanks** (this document): printed horizontal answer lines.
- **Choice markers** ([`choice-interactions.md`](choice-interactions.md)): hollow circular answer targets with numbered option legends.
- **Choice grids** ([`choice-grid-interactions.md`](choice-grid-interactions.md)): tables of empty answer cells under short column headers, kept distinct from static grammar tables.
- **Sentence ordering** ([`sentence-ordering-interactions.md`](sentence-ordering-interactions.md)): fragment rows separated by printed dot glyphs that the learner reorders.
- **Matching** ([`matching-interactions.md`](matching-interactions.md)): two columns of items connected by printed anchor-dot pairs (one-to-one).
- **FreeText** ([`free-text-interactions.md`](free-text-interactions.md)): stacks of isolated long writing lines with prompt proximity, kept explicitly separate from FillBlank lines.

All run in the same FastAPI interaction-detection operation against the same unmodified 300 DPI raster and OCR result.

## Pipeline

1. Read the same unmodified 300 DPI raster used by OCR.
2. Convert a same-size copy to grayscale.
3. Apply adaptive Gaussian thresholding to retain light gray scan lines.
4. Use one horizontal morphological opening pass.
5. Extract contour bounding rectangles as raw candidates.
6. Filter with normalized geometry, light surroundings, OCR proximity, text overlap, and left/right context.
7. Run a dedicated conservative short-suffix path for small verb-ending blanks.
8. Reject text-occupied structural table lines.
9. Sort accepted lines top-to-bottom and left-to-right.
10. Normalize line and interaction rectangles to `[0,1]`.

Adaptive thresholding replaced the initial Otsu attempt because Otsu retained only dark fragments of light gray synthetic scan lines. A second detector was not added because the adaptive pass recovered the complete structures with lower complexity.

## Full-Word Path (`horizontal-line-v1`)

The main path accepts lines with a full-word width, thin geometry, light surroundings, and OCR spatial context. It also requires the line area to be empty: text ink directly above the line means the structure is a printed underline or an occupied table row, not a writing blank.

## Short-Suffix Path (`short-suffix-line-v1`)

Tiny verb-ending blanks sit inside long OCR sentence spans, so the full-word context checks reject them. A separate conservative path accepts short lines (roughly 0.02 to 0.06 of page width) only when all of these hold:

- the line has light surroundings and no text ink directly above it;
- actual text ink exists on the same row band immediately left or right of the line;
- the line is not part of a table or grid (no nearby vertical border and no parallel horizontal line within a tight gap).

This recovers small endings without lowering the global minimum line width, so text strokes, hyphens without adjacent text, and image edges stay rejected. Each accepted blank records its provenance in `detectionMethod`.

## Table and Grid Rejection

Grammar tables and boxed regions can contain horizontal lines that look like blanks. A candidate is rejected as a text-occupied structural line when text ink sits directly above it **and** it has structural context: a nearby vertical border or a parallel line within a tight vertical gap. Clean blanks that happen to sit inside a table (for example answer cells) are not rejected.

## Central Thresholds

`DetectionThresholds` in `ai-service/app/document/blank_detection.py` contains all detector parameters. Geometry values are relative to image width or height.

| Signal | Purpose |
|---|---|
| Morphology kernel width | Extract horizontal structures at page-relative scale |
| Min/max normalized width | Reject tiny marks and long page/table rules |
| Thickness and aspect ratio | Reject text-like or non-horizontal components |
| Nearby OCR distance | Associate lines with text without requiring exact recognition |
| Text overlap | Reject short underlines and choice outlines |
| Light surroundings | Reject lines inside colored tables and illustrations |
| Ink above the line | Distinguish writing blanks from printed underlines and occupied table rows |
| Adjacent row-band text | Confirm short-suffix blanks are next to real words |
| Vertical border and parallel-line context | Reject table and grid structures |

The detector deliberately uses OCR as spatial evidence, not semantic proof. Imperfect German recognition can still produce a valid blank.

## Interaction Geometry

The physical line rectangle remains available as `lineBbox`. `interactionBbox` keeps the same horizontal extent and derives its height from the median nearby OCR span height. The line sits at a fixed proportion of that derived height, approximating a text baseline without CSS pixel offsets.

The frontend renders both rectangles in the PDF canvas wrapper. Input font size is computed transiently from normalized interaction height and the current PDF.js viewport height, so position, size, and text scale together at every zoom level.

## Debugging

- **Show OCR boxes** displays clickable blue OCR geometry.
- **Show blank detection** displays the physical line, interaction area, candidate ID, and heuristic score.
- Focusing an input shows its provenance and normalized coordinates in the debug panel.

The toggles coexist and are persisted locally. Debug visuals do not alter stored analysis.

## Verification

Verification uses generated images and the public synthetic demo. The fixture set
covers full-word and suffix blanks, text-occupied tables, dialogue rows, and
negative pages without printable answer lines. Detector timing is measured
separately from the optional local OCR provider.

Browser verification covered 75%, 100%, 125%, 150%, 175%, and 200% zoom, typed text, top/middle/bottom regions, navigation, hard refresh, local answer persistence, current-analysis GET restoration, OCR/debug coexistence, the in-page processing overlay with real stage labels, reduced-motion fallback, FAILED retry, and console inspection.

## Tests

Python tests generate synthetic images at runtime. They cover valid and multiple blanks, varying widths, long rules, noise, text-like components, colored image regions, missing OCR context, empty pages, edge bounds, deterministic ordering, dimension mismatch, short-suffix acceptance, punctuation rejection, text-occupied table rejection, and preservation of valid non-table blanks. Java tests cover the v0.2 contract, legacy defaults, stage order, forced updates, retry, and failures. Frontend tests cover normalization, current/legacy restoration decisions, ordering, interaction geometry, stale-state clearing, answer persistence isolation and fingerprints, zoom options, processing stage labels, reduced-motion styles, and API behavior.

## Known Limits

- A clean hyphen printed between two words could be accepted as a suffix blank; German workbooks rarely use this pattern, and it is not filtered out to avoid rejecting genuine short blanks.
- Very dense table cells whose answer line sits directly under printed text can still be treated as structural.
- Curved, dotted, vertical, boxed, or handwritten answer areas are not supported.
- The candidate score is heuristic and is not calibrated across book designs.
- PoC 1 does not understand prompts, answers, grammar, or correctness.
