# PoC 5: Matching Interactions (Complete)

## Goal

Detect and answer **matching** exercises: two columns of items where the
learner connects each item on one side with the corresponding item on the
other side. PoC 5 covers deterministic detection, on-page pairing UX, one-to-one
answer state, and local answer persistence. It does NOT know the correct
pairing and does NOT grade answers (Answer Key + Correction is a later PoC).

## What counts as matching (clean two-column, one-to-one)

The defining printed structure is the **connection anchor**: each item prints a
small isolated dot between the two columns. In this workbook family the layout
is:

```
[left item text] [number] •   • [letter] [right item text]
                 left anchor   right anchor
```

- The left column's items end with a printed **left anchor dot**; the right
  column's items start with a printed **right anchor dot**. Both dot columns
  are vertically aligned across every row of the exercise.
- Items are numbered on the left (`1`, `2`, ...) and lettered on the right
  (`A`, `B`, ...) — labels are supportive evidence, never required.
- The right column is deliberately NOT in left-row order (the learner's task is
  to find the correct pairs). Detection NEVER uses row alignment as an answer.
- The exercise occupies a clear local region with no examples/header/footer
  rows inside it.

Only `cardinality: one-to-one` is supported. One-to-many, many-to-many and
image-to-text matching are explicitly out of scope (see Limitations).

## Detection (`matching-v1`)

Module: `ai-service/app/document/matching_detection.py` (additive; runs inside
the existing `DETECTING_INTERACTIONS` stage on the same raster and OCR result).

Evidence chain:

1. **Anchor dots (raster)** — connected components on a fixed-threshold binary:
   small filled roughly-round blobs (page-relative size range) that are
   **isolated**: no other ink within a page-relative margin. This single rule
   rejects `?`/`!` bottom dots, i-dots, umlaut fragments and number periods,
   which always have glyph ink nearby. Real anchors sit alone in the whitespace
   between the columns.
2. **Anchor columns** — the surviving dots cluster by x with a tight
   x-spread limit. Real columns align to ~1 px; punctuation and letter
   fragments scatter. A column needs ≥2 dots (a missing anchor can leave a
   clean side with only two survivors; the row-count gate still rejects weak
   two-row candidates).
3. **Column pairs** — two columns left/right of each other (gap ≥ 0.02 of page
   width). Rows are formed by pairing dots of the two columns whose y differs
   by ≤ 0.0015 of page height: both anchors of a printed row share the same
   print band, while number periods sit visibly above their row's anchors and
   never pair.
4. **Row groups** — consecutive rows split into separate exercises when the
   vertical gap is ≥ 1.8× the median row spacing (stacked exercises share their
   anchor columns; page 106 has three of them).
5. **Text evidence (OCR)** — each row must have real text on both sides:
   spans left of the left-anchor column and right of the right-anchor column,
   inside the row's band. Low-confidence OCR garbage (dot glyphs OCR cannot
   classify) is dropped. Rows without both-side text are excluded; a candidate
   needs ≥3 valid rows, ≥3 items per side, |left−right| ≤ 1, text ratio ≥ 0.75
   and paired-anchor ratio ≥ 0.5.
6. **Labels** — tolerant, optional: left labels are standalone digit spans
   (`1`, `1.`) or a digit glued to the text; right labels are standalone single
   uppercase letters or the first character of a glued item (`ABei …` → `A`).
   Ordinary words (`Anna`, `Diese`) are never labels (second character must be
   uppercase, a space, or end of text).
7. **Items** — assembled in printed reading order per side (left column
   top-to-bottom, right column top-to-bottom, independently). Wrapped lines in
   the same row band merge into one item. Each item carries its text bbox and,
   when the dot survived, its anchor bbox (a missing anchor leaves
   `anchorBbox: null`; the item stays).

Scoring: `0.4·pairedRatio + 0.3·textRatio + 0.15·symmetry + 0.15·labelRatio`,
acceptance threshold 0.62. Preferring to MISS an ambiguous exercise over
producing false positives: plain two-column prose, unrelated numbered lists,
vocabulary lists without anchors, FillBlank rows, SentenceOrdering separator
dots (varying x per line — never aligned columns), grammar tables whose `?`
glyphs look like dots (isolation rule), page headers/footers, and weak
1–2-dot candidates are all rejected.

## Data model (additive, schemaVersion stays `0.2.0`)

```jsonc
{
  "matchingInteractions": [{
    "id": "matching-49-1",
    "kind": "matching",
    "bbox": { "x": 0.175, "y": 0.406, "width": 0.715, "height": 0.135 },
    "detectionMethod": "matching-v1",
    "candidateScore": 0.9875,
    "cardinality": "one-to-one",
    "nearbyTextSpanIds": ["span-49-26", "span-49-28"],
    "leftItems": [{
      "id": "matching-49-1-left-1",
      "label": "1",
      "text": "Synthetic left item text",
      "bbox": { "x": 0.195, "y": 0.406, "width": 0.305, "height": 0.014 },
      "anchorBbox": { "x": 0.545, "y": 0.415, "width": 0.003, "height": 0.003 },
      "nearbyTextSpanIds": ["span-49-26"]
    }],
    "rightItems": [{
      "id": "matching-49-1-right-1",
      "label": "A",
      "text": "Synthetic right item text",
      "bbox": { "x": 0.593, "y": 0.407, "width": 0.219, "height": 0.014 },
      "anchorBbox": null,
      "nearbyTextSpanIds": ["span-49-28"]
    }]
  }],
  "matchingDetection": {
    "detectionMethod": "matching-v1",
    "rawCandidateCount": 1, "acceptedCount": 1, "groupCount": 1, "durationMs": 88
  }
}
```

One interaction per exercise. IDs are deterministic
(`matching-{page}-{index}`, items `-left-{i}` / `-right-{j}`). Old analyses
without these fields deserialize to empty collections on every layer; no DB
migration is needed.

## Answer representation

Same store as PoC 1–4 (`lexora.exerciseAnswers.v1`), new kind `matching`.

- `value` = JSON object mapping **left item IDs → right item IDs**:
  `{"matching-49-1-left-1": "matching-49-1-right-3", ...}`.
- One-to-one is enforced structurally by the reducer: creating a pair frees
  both items from any previous pair, so a right item can never be connected
  twice and a left item keeps at most one connection.
- Partial answers persist (no completion requirement). Unpairing/reset removes
  the stored answer entirely.
- Fingerprint: `schemaVersion | detectionMethod | interaction bbox (4 decimals) |
  left count | right count`. Rotation, zoom and view state never change it; a
  reprocessed page whose geometry or item counts changed invalidates stale
  answers.

## Frontend UX

- **Hit areas** — every left/right item is a transparent keyboard-accessible
  button over its printed text (printed page stays the visual source of truth).
- **Selection** — click a left item to make it the active source, then a right
  item to create the pair; the reverse (right → left) works too. Clicking the
  active item again clears the selection. Matched items show a subtle tint;
  the active item shows a stronger ring.
- **Connection lines** — a `pointer-events: none` SVG draws one thin line per
  pair between the printed **anchor dots** (falling back to the text edge when
  an anchor is missing, so lines never run through text). Lines use the shared
  normalized geometry + `rotateBBox` machinery: they follow zoom, rotation
  (0/90/180/270) and resize automatically.
- **Unpair** — a matched right item shows a small ✕ at its anchor; clicking it
  removes that pair.
- **Reset** — a compact pill appears above the exercise once any pair exists.
- **Isolation** — selection and answers are scoped per interaction id: items of
  exercise A can never pair with items of exercise B (verified on page 106's
  three stacked exercises).
- All controls are real buttons with aria-labels and visible focus; matching is
  fully keyboard-operable, never mouse-only.

## Debug visualization

"Show matching detection" toggle renders per-exercise dashed bounds
(id/score/cardinality), per-item boxes (label + side, left/right colored),
and green anchor rectangles — all rotated with the page. Development-only.

## Verified real pages (private workbook, uncommitted)

| Page | Result |
| --- | --- |
| 49 (primary, printed 53, exercise 5) | exactly 1 interaction, 6 left + 6 right items, all 12 anchors, numeric left / alphabetic right labels (printed `6` not OCR'd), score 0.99, coexists with 20 FillBlank rows on the same page |
| 48 | 1 interaction, 4+4, one right anchor missing in print → `anchorBbox: null` on that item |
| 106 | 3 stacked interactions (5+5 each), shared anchor columns split by row gap |
| 188 | 2 stacked interactions (4+4 each) |
| 130 | 1 interaction, 6+6 |
| 182 | 1 interaction, 4+4 (page also has 3 ordering prompts) |
| 8 | 1 interaction, 6+6 |
| 29 | 1 interaction, 6+6 (page also has its known ChoiceGrid; regions do not overlap) |
| 5, 20, 70, 243 | 0 detections (scan-flagged dot columns rejected) |
| 11, 16, 18, 44, 100, 120, 39 | 0 detections (FillBlank / Choice / prose pages) |
| 15, 21 | 0 detections (ChoiceGrid + ordering pages; grid/ordering interactions unchanged) |
| 33, 65 | 0 detections (sentence-ordering pages; 239 candidate column pairs on 33 all rejected) |

Detector timing: matching-v1 alone ~70–130 ms per page on CPU (PaddleOCR
excluded); the whole detect-interactions endpoint is ~600–850 ms dominated by
the other detectors and serialization.

## Known limitations

- Only `one-to-one` matching; one-to-many and many-to-many are unsupported.
- Only exercises with printed anchor dots are detected. Matching without
  anchors needs stronger future inference.
- The anchor-dot isolation rule assumes the anchors sit in whitespace; layouts
  with labels glued within ~10 px of the anchor can lose the anchor (the item
  still works, with the line falling back to the text edge).
- Items whose OCR text is entirely missing on one side drop that row; with
  more than one such row the exercise is rejected.
- Exercises stacked without a title-line gap (same row spacing) merge into one
  interaction.
- Side-by-side exercises whose columns interleave horizontally are not
  supported (span-to-exercise assignment is per row band).
- The printed right-side order is preserved, never treated as the answer.
- Answer correctness is unknown until the Answer Key + Correction PoC; every
  learner match is neutral.
- Irregular layouts (very uneven rows, heavily wrapped items) may not be
  detected — the detector prefers misses over false positives.

## Future complex variants (documented, NOT implemented)

- one-to-many / many-to-many matching
- image-to-text matching (images as items)
- matching without explicit printed anchors
- mixed exercise layouts (matching + transformation), similar to the
  sentence-ordering hybrid on PDF 21

## Browser behavior (verified)

48 headless-Chromium checks: detection (12 hit areas on page 49), left→right
and right→left pairing, one-to-one replacement (reusing a matched right item
frees its old left item), unpair, reset, reverse pairing, persistence across
page navigation and F5, rotation 90°/270°, zoom 150%/200%, line/anchor
geometric alignment at 0°, 90° and 200% (endpoints at the exact printed anchor
centers), multi-exercise isolation on page 106 (cross-exercise clicks never
pair), keyboard activation, matching debug overlay, Update analysis flow on a
negative page, zero console errors.
