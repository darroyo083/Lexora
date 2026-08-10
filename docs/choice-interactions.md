# Choice-Marker Interactions

PoC 2 adds a second graphical exercise interaction: **choice markers**. Scanned workbook pages often contain small empty circles next to sentence rows where the learner writes one value from a small shared option set (for example `1 / 2 / 3`). Lexora detects those printed circles locally and lets the learner tap a circle and pick a value from a compact anchored selector. The original scanned page stays the visual source of truth; the selected value is rendered over the printed circle as presentation only.

No Gemini, VLM, cloud OCR, or external image analysis is used.

## Scope

- Supported marker pattern: small hollow printed circles (rings) embedded in text rows, one value per circle.
- Supported option-set pattern: a numbered legend above the target rows, e.g. `1 = ...`, `2 = ...`, `3 = ...`.
- Detected circles are persisted as `ChoiceTarget`; legends as `ChoiceGroup`.
- Each target stores one structured answer: `targetId -> optionId` (local browser storage only).
- Answer correctness is not implemented. Lexora does not know whether `1`, `2` or `3` is right.

## Detection Strategy (`empty-ring-v1`)

Deterministic OpenCV analysis in `ai-service/app/document/choice_detection.py`, reusing the same 300 DPI raster and OCR result as blank detection:

1. Grayscale conversion and one adaptive Gaussian threshold pass (same parameters as blank detection).
2. `RETR_CCOMP` contour extraction; a candidate must be an outer contour **with a hole** (a ring, not a filled disc).
3. Circle-shape pre-filter: bounding-box aspect near `1`, diameter between page-relative bounds, extent (contour area over box area) above a floor.
4. Rejection filters:
   - interior must be empty (ink inside the ring, like the `P` in a parking icon, rejects);
   - surroundings above/below must be light;
   - the ring must sit on an OCR text row (vertical alignment + horizontal gap);
   - ring diameter must be comparable to the nearby text height (rejects glyph holes in large headings and small letter counters).
5. Accepted targets are sorted top-to-bottom, left-to-right and stored with normalized `[0,1]` geometry.

The detector is deliberately single-pass. It does not stack Hough transforms, ellipse fitting, or multiple threshold passes.

## Option-Group Extraction

For each block of target rows, OCR spans above the block are scanned for numbered legend rows matching `^<digit> = ...`. A cluster of at least two such rows becomes one `ChoiceGroup` whose options are the legend digits in numeric order. All targets of the block reference the group by `optionGroupId`.

If no reliable legend is found, targets are still persisted but carry no `optionGroupId`; the frontend renders them as detection results but does not invent options. This is a reported limitation, not a failure: a page with zero targets or zero groups is a valid analysis.

## Persisted Shape

Additive to `PageAnalysis` v0.2 (schema version remains `0.2.0`):

```json
{
  "choiceGroups": [
    {
      "id": "choice-group-16-1",
      "options": [
        { "id": "choice-group-16-1-1", "label": "1" },
        { "id": "choice-group-16-1-2", "label": "2" },
        { "id": "choice-group-16-1-3", "label": "3" }
      ]
    }
  ],
  "choiceTargets": [
    {
      "id": "choice-16-2",
      "kind": "choice",
      "targetBbox": { "x": 0.345, "y": 0.587, "width": 0.0267, "height": 0.0205 },
      "interactionBbox": { "x": 0.3359, "y": 0.5808, "width": 0.0448, "height": 0.0328 },
      "optionGroupId": "choice-group-16-1",
      "detectionMethod": "empty-ring-v1",
      "candidateScore": 0.985,
      "nearbyTextSpanIds": ["span-16-31", "span-16-32", "span-16-33"]
    }
  ],
  "choiceDetection": {
    "detectionMethod": "empty-ring-v1",
    "rawCandidateCount": 22,
    "acceptedCount": 12,
    "groupCount": 1,
    "durationMs": 154
  }
}
```

`targetBbox` is the physical printed circle. `interactionBbox` is a larger click/touch area derived from the circle diameter and the nearby OCR text height (never fixed screen pixels). Both use the normalized `[0,1]` page coordinate system.

## Interaction Model

`ExerciseBlank` and `ChoiceTarget` share a lightweight discriminated shape (`kind`: `fill-in-line` / `choice`), stable interaction IDs, normalized geometry, detector provenance, and a heuristic `candidateScore`. This is the extensible foundation for later interaction types (`ChoiceGridInteraction`, `MatchingInteraction`); a future `interactions: []` union can wrap these without rewriting the reader.

## Frontend Behavior

- Each detected circle gets a transparent, keyboard-accessible hit area (`button.choice-hit`) aligned to `interactionBbox`.
- Clicking or activating it opens a compact anchored selector (`role="listbox"`) with the group options and a clear (`×`) action. The selector opens below the circle, or above it near the bottom of the page.
- Choosing an option renders the label centered inside the printed circle (`span.choice-value`) with a transparent background; the value scales with zoom.
- The selector closes on selection, on `Escape`, or on outside click. Arrow keys move between options; `Enter`/`Space` select. Focus returns to the target after selection or `Escape`.
- Targets and blanks are disabled while a page is processing.
- **Show choice detection** renders distinct debug geometry (pink target box, purple dashed interaction box, ID/score/group label) separate from blank and OCR debug overlays.

## Answer Model

Answers stay structured and local (browser `localStorage` under `lexora.exerciseAnswers.v1`), keyed by interaction ID with a fingerprint, kind, and value:

```json
"choice-16-2": {
  "fingerprint": "0.2.0|empty-ring-v1|0.3450|0.5870|0.0267|0.0205|choice-group-16-1",
  "kind": "choice",
  "value": "choice-group-16-1-3"
}
```

The stored value is the option ID, never a rendered coordinate. Fingerprints include target geometry, method, group, and schema version; after reprocessing, a moved target or changed group ignores the old answer instead of misattaching it. Choices persist across navigation, refresh, and zoom changes, and remain isolated by book and page. PoC 1 fill-in answers continue to work and are migrated to the unified `kind`/`value` shape on write.

## Processing

Blank detection and choice detection run together in one FastAPI operation (`/internal/document-analysis/pages/interactions`) under the renamed `DETECTING_INTERACTIONS` stage (previously `DETECTING_BLANKS`; `V004` migrates persisted rows). Detection is lightweight: about 140–230 ms per page versus 13–25 s for PaddleOCR. The frontend stage copy ("Finding interactions") is unchanged.

## Verification

Acceptance uses generated ring layouts and public synthetic demo analysis. The
fixtures cover numbered option groups, targets without reliable legends, glyph
holes and decorative-icon rejection, and negative pages without markers.

Browser verification covered: opening the selector, choosing, changing a selection, one value per target, `Escape`, outside click, arrow-key navigation, `Enter`/`Space` selection, navigation and F5 persistence, mixed fill-blank + choice pages, reprocessing with answer survival, 75/100/125/150/175/200% zoom alignment, 200% scrolling, and the update flow for pre-PoC 2 pages.

## Known Limits

- Option groups are extracted from numbered `1 = ...` legends only. Letter legends (`A = ...`) or legends OCR cannot read are not detected; targets remain interactive-free until a group exists, and the analysis reports `groupCount: 0` honestly.
- Only hollow circular markers are supported. Filled discs, checkboxes, squares, and hand-drawn targets are rejected or undetected.
- `candidateScore` is a heuristic and not calibrated across book designs.
- Answer correctness, scoring, and explanations are not implemented and not claimed.
- The primary exercise semantics (which meaning fits which sentence) are never analyzed; the system only structures the learner's selection.

## Future Interaction Types

- **ChoiceGridInteraction**: tables where each row selects one column value (`rowId -> selectedColumnOptionId`). PoC 2 keeps target/group geometry separate so a grid can reuse the same answer store and fingerprint model.
- **MatchingInteraction**: structured pairing (`leftItemId -> rightItemId`); the visual connection line will be presentation only. No arrow-image analysis or VLM flow is planned.

Neither is implemented in PoC 2.
