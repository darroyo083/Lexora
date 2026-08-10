# Choice-Grid Interactions

PoC 3 adds a third graphical exercise interaction: **choice grids**. Workbooks contain exercises where each row is a sentence or question and the learner marks exactly one option per row from a set of printed column headers (for example `ja / nein / doch`). Lexora detects the grid structure locally, renders transparent radio targets over the real answer cells, and persists one structured selection per row.

No Gemini, VLM, cloud OCR, or external image analysis is used.

## Scope

- Supported pattern: a bordered (or partially bordered) table with
  - a prompt column containing one sentence/question per row;
  - two or more answer columns headed by short printed labels;
  - empty answer cells (one per row and column);
  - horizontal separator rules (solid or nearly solid) between rows.
- One selection per row: choosing a different column replaces the previous selection in that row.
- Answer correctness is not implemented. Lexora does not know whether `ja`, `nein` or `doch` is correct.

## Detection Strategy (`table-grid-v1`)

Deterministic OpenCV analysis in `ai-service/app/document/grid_detection.py`, reusing the same 300 DPI raster and OCR result as the other detectors:

1. Grayscale conversion and one adaptive Gaussian threshold pass (same parameters as blank and choice detection).
2. Morphological line extraction: long horizontal runs and tall vertical runs.
3. Horizontal rules are clustered into candidate grids by left-edge alignment and row spacing.
4. A candidate becomes a grid only when all of these hold:
   - at least three horizontal rules and two vertical dividers within the rules' extent;
   - vertical dividers must cross the rules' vertical range (rules from other tables are ignored);
   - short OCR tokens above the first rule align with the answer columns, sit above the cells' top edge, and form a single header line;
   - each row band has prompt text in the prompt column;
   - every answer cell of the row is empty after the printed grid lines are masked out (static tables with printed cell content are rejected).
5. Accepted grids produce one `ChoiceGrid` with rows, cells, and a shared `ChoiceGroup` of column labels read from the page.

The detector deliberately distinguishes interactive grids from static/explanatory grammar tables: **TABLE != CHOICE GRID**. A table only becomes an interaction when its cells are empty, its columns have short header labels, and its rows have prompt text.

## Static-Table Rejection

Reference tables, conjugation tables, and decorative boxes are rejected by:

- cell-content check: any printed text inside an answer cell invalidates the row (grid lines themselves are masked out first);
- header check: labels must be short tokens, above the cells, and on a single line (dialogue fragments spread over multiple lines do not qualify);
- vertical-divider check: dividers must cross the row rules.

Generated negative fixtures include static grammar tables and dialogue layouts;
neither produces a grid.

## Persisted Shape

Additive to `PageAnalysis` v0.2 (schema version remains `0.2.0`):

```json
{
  "choiceGrids": [
    {
      "id": "choice-grid-29-1",
      "kind": "choice-grid",
      "gridBbox": { "x": 0.154, "y": 0.396, "width": 0.768, "height": 0.189 },
      "optionGroupId": "grid-group-29-1",
      "detectionMethod": "table-grid-v1",
      "candidateScore": 1.0,
      "rows": [
        {
          "id": "choice-grid-29-1-row-1",
          "rowBbox": { "x": 0.154, "y": 0.415, "width": 0.768, "height": 0.023 },
          "promptBbox": { "x": 0.187, "y": 0.419, "width": 0.279, "height": 0.013 },
          "nearbyTextSpanIds": ["span-29-46"],
          "cells": [
            {
              "id": "choice-grid-29-1-row-1-cell-1",
              "optionId": "grid-group-29-1-ja",
              "cellBbox": { "x": 0.581, "y": 0.415, "width": 0.114, "height": 0.023 },
              "interactionBbox": { "x": 0.581, "y": 0.415, "width": 0.114, "height": 0.023 }
            }
          ]
        }
      ]
    }
  ],
  "choiceGridDetection": {
    "detectionMethod": "table-grid-v1",
    "rawCandidateCount": 22,
    "acceptedCount": 1,
    "groupCount": 1,
    "durationMs": 168
  }
}
```

Column options reuse the existing `ChoiceGroup`/`ChoiceOption` model (`grid-group-29-1` with labels `ja`, `nein`, `doch`). All geometry is normalized `[0,1]` page coordinates.

## Answer Model

Structured local answers keyed by row id:

```json
"choice-grid-29-1-row-4": {
  "fingerprint": "0.2.0|table-grid-v1|grid-group-29-1|0.1540|0.4877|0.7680|0.0238",
  "kind": "choice-grid",
  "value": "grid-group-29-1-doch"
}
```

The stored value is the selected option id, never a coordinate. Row fingerprints include schema version, detection method, option group, and row geometry; after reprocessing, a moved row or changed group ignores the old answer. Choices persist across navigation, refresh, and zoom, and coexist with fill-blank and choice-marker answers in the same store.

## Frontend Behavior

- Each row renders as a `radiogroup` of native, visually hidden radio inputs positioned over the real answer cells (row `name` grouping gives arrow-key navigation for free).
- Selecting a cell renders a restrained `×` centered in the printed cell, scaled with zoom.
- Changing selection replaces the mark in that row; rows are independent.
- Radios are disabled while a page is processing; focus is visible via an outline.
- **Show grid detection** renders distinct debug geometry (cyan grid bounds, row bands, and cell boxes with ids and labels), separate from OCR, blank, and choice debug overlays.

## Processing

Grid detection runs inside the existing `DETECTING_INTERACTIONS` stage, in the same FastAPI interaction operation as blank and choice detection. No new pipeline state was added. Detection takes roughly 160–210 ms per page versus 13–25 s for PaddleOCR.

## Verification

Acceptance uses generated grids and the public synthetic demo. Fixtures cover
short column headers, empty selectable cells, pre-filled-row exclusion, dotted
separator limits, static-table rejection, and dialogue/fill-blank negatives.

Browser verification covered selection, replacement, one mark per row,
arrow-key navigation, refresh/navigation persistence, page isolation, 75–200%
zoom alignment, scrolling, mixed interaction pages, and analysis updates.

## Known Limits

- The supported pattern requires empty answer cells; grids whose cells contain printed text are treated as static tables.
- Dotted row separators are only partially supported: rows separated by dashed/dotted rules with gaps larger than the morphological kernel may merge.
- Header labels must be short tokens on a single line; multi-line option legends are not extracted.
- Grids without vertical dividers (only horizontal rules) are rejected because columns cannot be determined.
- `candidateScore` is a heuristic and not calibrated across book designs.
- Answer correctness, scoring, and explanations are not implemented.

## Future Interaction Types

- **MatchingInteraction**: structured pairing (`leftItemId -> rightItemId`); the visual connection line will be presentation only.
- **SentenceOrderingInteraction**, **FreeTextInteraction**, and other families remain future work.

None of these are implemented in PoC 3.
