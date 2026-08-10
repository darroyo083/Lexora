# PoC 6: FreeText Interactions (Complete)

## Goal

Detect and answer **FreeText** exercises: a printed prompt followed by one or
more visibly reserved writing lines where the learner writes their own
response. PoC 6 covers deterministic detection, an on-page writing overlay,
and local answer persistence. It does NOT know the correct answer, does NOT
extract answer keys, does NOT grade, and does NOT use an LLM or vision model
(Answer Key + Correction is a later PoC).

PoC 6 is **COMPLETE** following manual acceptance on representative workbook
pages and coexistence checks with earlier interaction types.

## What counts as FreeText (conservative)

A FreeText response area is a **vertical stack of long horizontal writing
lines that stand alone in their print rows**:

- the lines are long (≥ 0.30 of page width — clearly writing lines, not
  inline blanks) and thin (a printed rule, not a text component);
- **nothing else is printed on a writing line's own row** — no sentence text
  left or right, nothing directly above or below the line within a tight
  band, no table border crossing it;
- the lines form a **stack**: consecutive lines within a tight vertical gap
  (≈ 0.025 of page height) that overlap horizontally (same column);
- a stack of **three or more** clean parallel lines is accepted on line
  evidence alone; **one or two** lines are accepted only when a printed
  **prompt** (OCR text) sits above the stack.

Deliberately NOT FreeText (and not detected as such):

- arbitrary whitespace;
- prose without an answer area;
- paragraph underlines, heading rules, decorative double rules, page footer
  lines, section separators (no stack, no prompt);
- table borders and grid rows (vertical borders or text between the lines);
- FillBlank-style blanks, Choice markers, ChoiceGrids, Matching anchors and
  SentenceOrdering rows (their rows carry other printed content).

The detector prefers **false negatives** over false positives: a hard
FreeText exercise that is missed is acceptable; an overlay sprayed onto
arbitrary whitespace is not.

## FillBlank vs FreeText separation rules (explicit)

FillBlank (`horizontal-line-v1`) and FreeText (`free-text-v1`) both look at
horizontal printed lines, so the boundary is explicit:

| Signal | FillBlank | FreeText |
|---|---|---|
| Line width | 0.02–0.45 of page width | ≥ 0.30 of page width |
| Row band content | text on the same row (left/right) | row band completely empty |
| Ink above/below the line | tolerated (sentence structure) | rejected within tight bands |
| Vertical borders | rejected (structural tables) | rejected |
| Parallel lines | single line per blank | stack of 2+ aligned lines |
| Prompt above | not required | required for 1–2-line stacks |

The decisive rule: **a line whose row contains only the line itself belongs
to FreeText; a line embedded in a row with other printed content belongs to
FillBlank.** In the ambiguous width band (0.30–0.45) the row-band emptiness
and stack tests decide.

When FreeText claims a line, the same line is **removed from
`exerciseBlanks`** (they come from the same contour, so the boxes are
near-identical; IoU ≥ 0.5): one response area is never simultaneously a
FillBlank blank and a FreeText response. All other blanks on the page are
untouched, so valid FillBlank detections (including on PoC 1–5 verified
pages) are preserved.

## Detection (`free-text-v1`)

Module: `ai-service/app/document/free_text_detection.py` (additive; runs
inside the existing `DETECTING_INTERACTIONS` stage on the same raster and OCR
result).

Evidence chain:

1. **Long thin lines (raster)** — same adaptive threshold + horizontal
   morphology pass as blank detection: width ratio 0.30–0.97, thickness ≤
   0.012 of page height, aspect ≥ 20, light surroundings.
2. **Row isolation (raster)** — for each line: ink left/right of the line in
   the row band must be < 3%, ink in a tight band above the line < 6% and
   below it < 8%, and no vertical strip may cross the line. This single rule
   rejects underlines, table rows, grid cells, and any line belonging to
   printed text.
3. **Stacks (geometry)** — surviving lines cluster by column (horizontal
   overlap ≥ 0.5 of the shorter line) and then by vertical gap (≤ 0.025 of
   page height). Side-by-side stacks with interleaved rows never merge.
4. **Prompt evidence (OCR)** — spans with confidence ≥ 0.5 whose center lies
   within the stack's x-range (± 0.05) and above the stack (within 0.18 of
   page height) count as the printed prompt.
5. **Acceptance** — stack ≥ 3 lines, or ≥ 1 line with a prompt. Score:
   `0.45·lineCount + 0.35·width + 0.20·prompt`, threshold 0.55 (metadata only;
   acceptance is decided by the stack rules).
6. **Interactions** — one interaction per stack, ordered top-to-bottom;
   `bbox` is the union of the response lines (the writing area); each line
   carries its own bbox; nearby text = the prompt spans.

Runtime is ~100–200 ms per page on CPU (PaddleOCR excluded) — one extra
threshold + morphology pass over the same raster, no re-OCR, no network.

## Data model (additive, schemaVersion stays `0.2.0`)

```jsonc
{
  "freeTextInteractions": [{
    "id": "free-text-28-1",
    "kind": "free-text",
    "bbox": { "x": 0.451, "y": 0.572, "width": 0.468, "height": 0.216 },
    "detectionMethod": "free-text-v1",
    "candidateScore": 0.9333,
    "nearbyTextSpanIds": ["span-28-1"],
    "responseLines": [
      { "id": "free-text-28-1-line-1", "bbox": { "x": 0.451, "y": 0.572, "width": 0.468, "height": 0.0013 } },
      { "id": "free-text-28-1-line-2", "bbox": { "x": 0.451, "y": 0.596, "width": 0.468, "height": 0.0013 } }
    ]
  }],
  "freeTextDetection": {
    "detectionMethod": "free-text-v1",
    "rawCandidateCount": 11, "acceptedCount": 1, "groupCount": 1, "durationMs": 88
  }
}
```

IDs are deterministic (`free-text-{page}-{index}`, lines
`free-text-{page}-{index}-line-{j}`). Old analyses without these fields
deserialize to empty collections on every layer; no DB migration is needed.

## Answer representation

Same store as PoC 1–5 (`lexora.exerciseAnswers.v1`), new kind `free-text`.

- `value` = the raw learner text (multi-line text stored as-is).
- Partial answers persist; clearing the input removes the stored answer
  entirely (empty response state is preserved).
- Fingerprint: `schemaVersion | detectionMethod | interaction bbox
  (4 decimals) | response line count`. Rotation, zoom and view state never
  change it; a reprocessed page whose geometry or line count changed
  invalidates stale answers.

## Frontend UX

- **Single response line** → one text input centered on the printed line
  with a comfortable page-relative writing band.
- **Multi-line response area** → one textarea over the whole writing area
  whose line height matches the printed line spacing, so typed text lands on
  the printed lines.
- The printed page stays the visual source of truth: transparent background,
  no borders, visible focus ring, accessible aria-label built from the
  nearby prompt text.
- Text selection, Ctrl+A, Backspace/Delete, arrow navigation and normal
  keyboard editing work; Enter inserts a newline in the textarea and does
  nothing in the single-line input (nothing ever submits).
- The overlay uses the shared normalized geometry (`rotateBBox` +
  `freeTextInputStyle`), so it follows zoom (75%–200%) and rotation
  (0/90/180/270) like every other interaction overlay.
- No correctness coloring, no "Check answer", no AI feedback.

## Debug visualization

"Show free-text detection" toggle renders the writing-area bounds (id, score,
line count) and each response line as a thin rectangle — all rotated with the
page. Development-only.

## Persistence

Typed text persists in `localStorage` per browser, book, and page: it
survives page navigation and F5, stays isolated between books/pages/
exercises, and stale fingerprints never attach an answer to changed detector
output.

## Verification

Generated fixtures and the public synthetic demo cover long aligned writing
stacks, short prompted areas, mixed interaction pages, text between lines,
labeled form fields, and negative layouts. Single unprompted writing lines are
an intentional conservative false negative.

## Browser behavior (verified)

Headless-Chromium checks against generated pipeline fixtures cover FreeText
coexisting with ChoiceGrid, matching, and FillBlank overlays; text entry,
selection, Ctrl+A, Backspace and deletion
all work; answers persist across page navigation and F5 and stay isolated per
book/page; clearing the input persists as empty (no stale restore); the input
rectangle stays exactly attached to the detected writing area at 75%, 100%,
150% and 200% zoom and under 0°/90°/180°/270° rotation (normalized position
matches the detector bbox within ~0.001); focus ring and aria-labels present;
negative FillBlank and matching fixtures render zero FreeText overlays while
their own interactions still work; zero console errors.

## Known limitations

- The detector is deliberately conservative and can produce false negatives.
- A single writing line without any prompt is never detected (footers and
  decorative rules must stay rejected).
- Writing lines with labels printed on the same row (e.g. `a)` markers) are
  missed (row-band emptiness rule).
- Boxed or form-style writing areas with vertical borders are missed.
- Difficult multi-column layouts may remain unsupported.
- Text rows printed exactly centered between two writing lines (inside
  neither isolation band) could slip through; conservative rules apply.
- The candidate score is heuristic and not calibrated across book designs.
- Answer correctness is unknown until the Answer Key + Correction PoC; every
  learner response is neutral.
- PoC 6 does not understand prompts, grammar, or correctness.
- Detection has no LLM or vision-model dependency.

## Future (documented, NOT implemented)

- Harden SentenceOrdering against false positives on some layouts; this is an
  existing detector issue and was not changed by PoC 6.
- Model hybrid sentence construction, conjugation, and rewriting exercises
  that do not fit the current SentenceOrdering abstraction.
- PoC 6.5: broad UX/UI overhaul of the reader, including explicit convenient
  previous/next or incremental page-navigation controls rather than restoring
  browser-native number-input spinners.
- Answer Key extraction and automatic correction.
- Writing-line detection without printed lines (blank-page writing areas).
