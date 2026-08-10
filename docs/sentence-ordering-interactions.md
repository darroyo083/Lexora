# PoC 4: Sentence-Ordering Interactions

## Goal

Detect and answer **sentence-ordering** exercises: printed rows where phrase
fragments appear in an intentionally unordered sequence and the learner must
reconstruct the correct sentence. PoC 4 covers detection, rendering, click-to-order
interaction, and local answer persistence. It does NOT grade answers.

## What counts as sentence ordering

The defining evidence is that the visible fragments themselves are intended to be
reordered. Concretely, in this workbook family:

- An OCR line contains **2+ inline separator glyphs** (`•` U+2022 or `·` U+00B7)
  between phrase chunks → 3+ non-empty fragments on one printed line.
- Several consecutive such lines (2+, usually 4-9) form one exercise, with tight
  uniform vertical spacing.
- Fragment lengths vary strongly (short words mixed with phrases) — uniform
  single-word lists (verb banks for fill-in exercises) are rejected.

Non-ordering content is deliberately NOT detected:

- normal prose, numbered lists without separators
- matching exercises (two columns, no inline separators)
- grammar boxes, examples/pre-filled sentences
- word banks whose items are uniform single words

## Terminal punctuation is orderable

For these scrambled-sentence exercises punctuation is part of the scramble:
the learner must explicitly place it. `.`, `?` and `!` are independent
ORDERABLE items — selectable source fragments, numbered chips, moveable and
removable like any other fragment, counted in itemCount/fingerprints.

Both OCR readings normalize to the same items:

- `mitnehmen?` → `["mitnehmen", "?"]`
- `mitnehmen • ?` → `["mitnehmen", "?"]`
- `Hotel.` → `["Hotel", "."]`, `kommen!` → `["kommen", "!"]`

Nothing is appended automatically; punctuation renders wherever the learner
placed it (`mitnehmen? ich` stays `mitnehmen? ich`).

Other punctuation is NOT blindly split: commas, colons, semicolons and
abbreviation periods (`z.B.`, `usw.`, `d.h.`, `u.a.`) stay attached unless
OCR already produced them as standalone fragments. Prompts whose item
structure changed (fingerprint itemCount) drop stale persisted answers, per
the existing invalidation contract.

> **Known follow-up (non-blocking for PoC 5):** punctuation
> splitting/detection is ACCEPTED for PoC 4 but not fully solved. Some real
> workbook cases (attached vs. standalone marks, multi-mark runs,
> abbreviation-like periods) still need additional hardening later. The
> behavior above is the accepted baseline; do not treat it as final.

## Two-column exercises

Some exercises print prompts in two side-by-side columns on the same row grid
(PDF 15 exercise 3: numbers 1,2,3 in the left column, 4,5 in the right, the
last row wrapping onto a continuation line). The detector:

1. clusters the block's lines into columns by their left edge — an x-cluster
   only becomes a real column when its lines share print rows (vertical band
   overlap) with lines of another cluster, so indented dialogue rows (`Herr
   Guzman:` / `Portier:`) and margin lines stay a single column;
2. attributes margin row numbers **per column** — a digit on the left margin
   can never label a right-column line;
3. groups continuation lines **within their own column**: an unnumbered line
   merges into the previous line of the SAME column (tight gap), or — for
   wrapped lines printed on the neighbouring column's row grid — when its band
   aligns with a numbered row in another column. A continuation never attaches
   to a geometrically closer row in another column;
4. emits prompts in the stable reading order the layout represents: left
   column top-to-bottom, then right column top-to-bottom. Single-column
   exercises keep pure top-to-bottom order; the rule is inferred from
   geometry, not hardcoded for all exercises.

## Wrapped (multi-line) prompts

A prompt that wraps onto a second printed line is merged back into one logical
prompt. A line is treated as a continuation when it carries **no row number of
its own** and sits **far closer to the previous line than the block's ordinary
prompt spacing** (0.75 × median positive gap). Row numbers are attributed
greedily: each margin digit span belongs to exactly one line (top-down), so a
continuation sitting 1-2px below its numbered prompt does not inherit that
number. Unnumbered lines with a normal prompt gap stay standalone prompts
(some exercises omit printed numbers). Numbered rows are never continuations.

## Detection

- Module: `ai-service/app/document/sentence_ordering_detection.py`
- Method: `sentence-ordering-v1`
- Evidence chain:
  1. **Text evidence**: line spans with ≥2 inline `•`/`·` separators (≥3 fragments).
  2. **Pixel evidence**: OpenCV finds compact mid-height ink blobs inside each line
     band — these are the printed separator dots. They confirm boundaries and
     recover dots OCR misreads as hyphens.
  3. **Block grouping**: consecutive candidate lines with bounded vertical gap
     form an exercise (2+ lines).
  4. **Column detection**: within a block, lines cluster by left edge; clusters
     sharing print rows are columns, everything else stays one column.
  5. **Variance filter**: block-average fragment-length coefficient of variation
     ≥ 0.30 rejects uniform word banks.
  6. **Continuation merging**: wrapped lines (above) join their prompt, per
     column, using gap and print-row-alignment evidence.
- Fragment geometry: greedy assignment of separator dots to proportional
  text-length boundary estimates (monotonic, deterministic). Falls back to pure
  proportional split when dots are unavailable.
- A merged row number (`1 Am letzten Wochenende …`) is stripped when the row
  starts left of the block's fragment column.
- OCR text is preserved verbatim — no invented corrections, no AI.

## Data model (additive, schemaVersion stays `0.2.0`)

```jsonc
{
  "sentenceOrderings": [{
    "id": "sentence-ordering-33-1-1",
    "kind": "sentence-ordering",
    "bbox": { "x": 0.151, "y": 0.078, "width": 0.476, "height": 0.015 },
    "exerciseId": "sentence-order-exercise-33-1",
    "promptIndex": 1,
    "detectionMethod": "sentence-ordering-v1",
    "candidateScore": 0.95,
    "nearbyTextSpanIds": ["span-33-1"],
    "items": [{
      "id": "sentence-ordering-33-1-1-item-1",
      "text": "Am letzten Wochenende",
      "bbox": { "x": 0.151, "y": 0.078, "width": 0.208, "height": 0.015 },
      "originalIndex": 1
    }]
  }],
  "sentenceOrderingDetection": {
    "detectionMethod": "sentence-ordering-v1",
    "rawCandidateCount": 22, "acceptedCount": 22, "groupCount": 4, "durationMs": 110
  }
}
```

One interaction per prompt row; `exerciseId` groups rows into the printed
exercise. IDs are deterministic (`page-block-row` / `-item-index`). Old analyses
without these fields deserialize to empty collections on every layer.

## Answer persistence

- Same store as PoC 1-3 (`lexora.exerciseAnswers.v1`), new kind
  `sentence-ordering`.
- `value` = comma-joined ordered **item IDs** (`orderedItemIds`); text is never
  identity, so duplicate fragment texts keep distinct positions.
- Fingerprint: `schemaVersion | detectionMethod | interaction bbox (4 decimals) |
  item count`. Rotation, zoom, and view state never change it; a reprocessed
  page whose geometry or fragment count changed invalidates stale answers.
- Partial orders persist (no completion requirement).

## Frontend UX (click-to-order, floating bubbles or docked panel)

- Printed fragments remain the visual source of truth. Each fragment gets a
  transparent hit button over its printed text; clicking appends it to the
  active prompt's order (click again to remove). Used fragments show a small
  position badge; the active prompt's fragments get a subtle highlight.
- **Two presentation modes for the same answer UI; both share one interaction
  state.** Mode is a small persisted view preference (`lexora.orderingMode`),
  never part of `PageAnalysis`, answer fingerprints, or answer values.
  - **Floating (default):** one compact bubble per detected exercise, collapsed
    by default and labeled with exercise progress (e.g. `Ordering 2/6`).
    Clicking a bubble expands the ordering controls; clicking a printed
    fragment opens and focuses the correct exercise's bubble. Only one bubble
    is expanded at a time. The expanded bubble is draggable by its grip
    header, and offers minimize (collapse), Dock, and Close. Closing hides the
    bubble; clicking any fragment of that exercise reopens it. When floating,
    the right rail is freed for Debug.
  - **Docked:** "Dock" moves the SAME UI into the existing right rail as an
    Ordering/Debug tab pair; the rail provides "Float" to return to bubbles.
    Float → Dock → Float preserves the active prompt, ordered chips, partial
    answers, and progress exactly.
- **Bubble positioning is derived from the exercise bbox** (beside the
  exercise when space allows, otherwise below, preferring minimal overlap) and
  clamped so a bubble never spawns partially outside the visible reader area.
  Dragged pixel positions are session-only: they may persist while the page
  stays mounted, but are recalculated from geometry after F5, reopen, rotation,
  or a zoom/layout change. Position never enters fingerprints, and dragging
  never mutates answers or fragment geometry.
- **Bubbles are draggable in BOTH forms.** Collapsed bubbles drag from anywhere
  on their surface; expanded bubbles drag from the grip header only (the inner
  buttons stay clickable). One shared pointer state machine distinguishes a
  click from a drag by a small movement threshold (5 px): a normal click still
  expands the collapsed bubble, tiny jitter never nudges it, and releasing
  after a drag keeps the bubble collapsed without expanding it. Dragged
  positions stay clamped to the visible reader area and are shared between the
  collapsed and expanded forms of the same exercise.
- The panel/bubble shows the active prompt's constructed sentence as numbered
  chips, with previous/next prompt navigation (within the exercise),
  per-prompt reset, and a progress line. Chips: click to remove;
  ArrowLeft/ArrowRight move; Delete/Backspace removes.
- Fragments, bubbles, and controls are real buttons — fully keyboard
  reachable, with aria-labels and polite live regions. Dragging is optional
  (never required for functionality).
- Fragment geometry uses the shared `rotateBBox` overlay; bubble and panel
  content stay upright at 90°/180°/270° while fragment hit areas rotate with
  the page. Bubbles belong to the document/page/exercise, so a future
  two-page view can render one floating layer per `PageViewer` instance.

## Reader view state

- **Zoom persists across refresh** (`lexora.zoom`, document-level): F5 restores
  the selected zoom, navigation never resets it, rotation and answers restore
  independently, and the default stays 100% with tolerant localStorage parsing.

## Processing concurrency

- Only one heavy page-processing operation runs at a time. A global in-flight
  lock prevents concurrent processing, but the lock is kept separate from the
  CURRENT page's visual state: the reader tracks the processing **target**
  (`bookId` + `pageNumber`) and shows the full-page processing shell only on
  that page. While page 33 is analyzed, every other page renders normally —
  a READY page shows its PDF and persisted analysis, an unprocessed page shows
  its normal empty reader state — and its Process/Update action is disabled
  with a "Processing page 33…" indicator naming the target. Navigating away
  does NOT abort the in-flight request; the target clears when it completes
  (success or failure), so no destination page stays stuck behind a stale
  processing shell. Returning to the target page re-fetches it and shows READY
  without an F5.
- The backend treats client disconnects during response writes
  (`ClientAbortException` / broken pipe, e.g. after navigation or F5) as
  expected, logs them at INFO, and does not surface them as unhandled errors.
  Genuine server failures still log at ERROR with a 500 response.

## Debug visualization

"Show ordering detection" toggle renders per-exercise dashed bounds, per-prompt
bounds, and per-item boxes with IDs and the score, rotated with the page.

## Verification

Generated fixtures and the public synthetic demo cover multi-prompt groups,
two-column reading order, wrapped continuations, punctuation chips, mixed
interaction pages, prose and word-bank rejection, and negative pages.

Detector timing: ~60-190 ms per page on CPU (PaddleOCR excluded).

## Hybrid ordering/transformation limitation

Some prompts combine ordering with conjugation or another transformation. The
printed fragments alone are insufficient to construct a grammatical answer.
Lexora therefore records only the learner's chosen order and does not claim to
solve the transformation; FreeText or another explicit interaction is the
appropriate future model.

## Known limitations

- Terminal punctuation (`. ? !`) splitting is accepted but not fully hardened:
  some layouts (attached vs. standalone marks, multi-mark runs,
  abbreviation-like periods) need additional refinement later. **Non-blocking
  for PoC 5.**
- Rows with ≤2 printed fragments are not detected.
- A separator dot OCR misreads as `-` keeps two fragments merged (boundaries
  still correct; text shows the OCR hyphen).
- An unnumbered wrap whose band does not align with a numbered row of a
  neighbouring column and whose gap is not significantly tighter than the
  column's prompt spacing is not merged.
- Uniform word banks adjacent to real ordering rows would be hard to reject.
- No answer-key grading; answers are the learner's chosen order only.

## Browser behavior (verified)

Headless-Chromium checks cover zoom/refresh
persistence (150/200%), zoom across navigation, side panel outside the PDF,
tabs/collapse/reopen, prev/next/reset, chips + keyboard (Enter, arrows,
Delete), view-state combo (zoom 200% + rotation 90° + partial answer + F5),
punctuation consistency, multi-prompt grouping, merged continuations,
single-flight processing with navigation mid-flight (result persists, no
client-abort noise), and zero console errors.
