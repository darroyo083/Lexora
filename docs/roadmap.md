# Roadmap

## PoC 0: OCR Overlay on Scanned Pages (Complete)

- [x] Upload and persist a scanned PDF
- [x] Render original pages with PDF.js
- [x] Rasterize an explicitly selected page at 300 DPI
- [x] Run local German OCR with PaddleOCR
- [x] Preserve source geometry by disabling orientation and unwarping transforms
- [x] Normalize OCR boxes to `[0,1]`
- [x] Persist one JSONB analysis per processed page
- [x] Reuse `READY` pages without rerunning OCR
- [x] Retry `FAILED` pages
- [x] Expose real coarse processing stages and deterministic stage progress
- [x] Maintain overlay alignment at 75%, 100%, 125%, and 150%
- [x] Inspect clickable spans and confidence data
- [x] Restore the book, page, analysis, and OCR-box preference after refresh
- [x] Show a PDF-area skeleton during restoration
- [x] Run the complete local stack through Docker Compose

PoC 0 processing remains intentionally explicit and per page. It does not automatically process a newly uploaded book or a page opened during navigation.

## PoC 1: Fill-in-the-Blank Exercise Detection (Complete)

- [x] Detect graphical horizontal answer lines without a VLM
- [x] Derive physical-line and interaction geometry
- [x] Overlay interactive HTML inputs on the original page
- [x] Persist blank geometry in `PageAnalysis` v0.2
- [x] Preserve input and text alignment at 75%, 100%, 125%, 150%, 175%, and 200%
- [x] Restore current analyses without rerunning OCR or OpenCV
- [x] Offer explicit updates for legacy READY analyses
- [x] Recover tiny verb-ending suffix blanks through a conservative short-suffix path
- [x] Reject text-occupied structural grammar-table lines
- [x] Persist exercise answers locally per browser, book, and page
- [x] Replace the toolbar percentage bar with an in-page analysis overlay and real stage labels

PoC 1 is intentionally heuristic. It validates horizontal graphical blanks, not general exercise understanding. Very dense table cells and a clean hyphen between words remain known edge cases.

## PoC 2: Choice-Marker Interactions (Complete)

- [x] Detect hollow circular answer markers locally without a VLM (`empty-ring-v1`)
- [x] Persist `ChoiceTarget` geometry and `ChoiceGroup` option sets additively in `PageAnalysis` v0.2
- [x] Extract numbered `1 = ...` legends deterministically and attach targets to option groups
- [x] Render transparent, keyboard-accessible hit areas on the printed circles
- [x] Open a compact anchored selector with the group options and a clear action
- [x] Display the selected value centered inside the printed circle, scaling with zoom
- [x] Persist structured `targetId -> optionId` answers locally per browser, book, and page
- [x] Keep selection aligned at 75%, 100%, 125%, 150%, 175%, and 200% zoom
- [x] Restore choices across navigation and hard refresh; ignore stale interaction fingerprints
- [x] Rename the pipeline stage to `DETECTING_INTERACTIONS` with a `V004` migration
- [x] Offer explicit **Update analysis** for pre-PoC 2 pages instead of silent reprocessing
- [x] Add a distinct choice-detection debug overlay and inspection panel
- [x] Verify on PDF page 16 (printed page 20) and a second marker page (PDF 18)

PoC 2 is intentionally structural. It detects markers and structures the learner's selection; it does not know which option is correct, does not extract answer keys, and does not implement grading or explanations.

## PoC 3: Choice-Grid Interactions (Complete)

- [x] Detect interactive choice grids locally without a VLM (`table-grid-v1`)
- [x] Reject static/explanatory grammar tables and dialogue pages
- [x] Extract short column headers as a shared `ChoiceGroup` (`ja / nein / doch`)
- [x] Persist normalized grid, row, and cell geometry additively in `PageAnalysis` v0.2
- [x] Render transparent radio targets over the printed answer cells
- [x] One structured selection per row (`rowId -> optionId`), replacing on change
- [x] Display a restrained `×` centered in the selected cell, scaling with zoom
- [x] Persist grid answers locally per browser, book, and page with row fingerprints
- [x] Restore selections across navigation and hard refresh
- [x] Keyboard-accessible rows via native radio-group semantics
- [x] Add a distinct choice-grid debug overlay
- [x] Verify on PDF page 29 (printed page 33) and a second real grid (PDF 15)
- [x] Verify negative static-table pages (PDF 12, 44, 120) produce no grids

PoC 3 is intentionally structural. It detects grids and structures one selection per row; it does not know which option is correct, does not extract answer keys, and does not implement grading or explanations.

## PoC 4: Sentence-Ordering Interactions (Complete)

- [x] Detect sentence-ordering prompt rows locally without a VLM (`sentence-ordering-v1`)
- [x] Use printed separator-dot glyphs (`•`/`·`) in OCR text plus OpenCV dot evidence in each line band
- [x] Group consecutive prompt rows into exercises; reject prose, matching layouts, grammar boxes, examples, and uniform word banks
- [x] Persist interaction, exercise, and per-item normalized geometry additively in `PageAnalysis` v0.2
- [x] Deterministic item IDs (`page-block-row-item-index`); duplicate fragment texts keep distinct identities
- [x] Render transparent, keyboard-accessible hit areas over each printed fragment
- [x] Click-to-order UX: fragments append with position badges; click again to remove
- [x] Floating per-exercise answer card with numbered chips, previous/next prompt, per-prompt reset, and progress
- [x] Chips support click-to-remove, ArrowLeft/ArrowRight moves, and Delete removal
- [x] Persist partial and complete `orderedItemIds` answers locally (kind `sentence-ordering`)
- [x] Fingerprints ignore rotation, zoom, and view state; stale geometry/count invalidates answers
- [x] Restore orders across navigation and hard refresh; mixed stores with PoC 1-3 answers verified
- [x] Rotate 0/90/180/270 with upright cards; zoom to 200% with aligned targets
- [x] Add a distinct sentence-ordering debug overlay
- [x] Verify primary PDF 33 (4 exercises / 22 prompts), secondary PDF 65, and negatives (11, 16, 29, 30, 15, 21, 22, 8, 9, 10, 100, 120)
- [x] Hardening: zoom persists across F5; terminal punctuation (`. ? !`) normalized as independent orderable items, attached and standalone OCR forms equivalent, abbreviations (`usw.`/`z.B.`) preserved
- [x] Hardening: wrapped continuation lines merge into their prompt (PDF 15 exercise 3 = exactly 5 prompts)
- [x] Hardening: two-column exercises — column structure inferred from geometry (shared print rows), continuations group within their own column, reading order left column top-to-bottom then right column top-to-bottom; indented dialogue rows stay single-column
- [x] Hardening: collapsed floating bubbles are draggable too — shared click-vs-drag pointer state (5 px threshold), click still expands, release after drag stays collapsed, clamped to the visible reader area
- [x] Hardening: answer UI moved from floating cards to a side panel outside the PDF (tabbed with Debug, collapsible, keyboard-accessible)
- [x] Hardening: single-flight processing — one heavy analysis at a time, navigation no longer aborts it, client disconnects logged as expected not as errors
- [x] Hardening: processing target identity separate from the global lock — only the analyzed page shows the processing shell; other pages render normally with a "Processing page N…" indicator and a disabled Process action, no stale shell on navigation
- [x] Hardening: PDF 21 hybrid ordering/transformation variant documented as a limitation for a later FreeText interaction
- [x] Hardening: explicit **Update analysis** action on any `READY` page with persisted analysis reruns OCR + detection on demand (single-flight, no auto-reprocess)
- [x] Hardening: ordering presentation returns to floating per-exercise bubbles (one expanded at a time, drag handle, collapse/close/reopen) with Dock → right-rail panel → Float round-trip sharing one answer state; smart default position from exercise geometry, session-only drag positions, upright at all rotations/zooms

PoC 4 is intentionally structural. It detects ordering prompts and records the learner's chosen sequence; it does not know the correct order, does not parse the answer key, and does not implement grading or explanations.

### Known follow-up (non-blocking for PoC 5)

- Terminal punctuation (`. ? !`) is now represented as ORDERABLE
  sentence-ordering items, and that behavior is ACCEPTED for PoC 4. However,
  punctuation splitting/detection still needs additional refinement on some
  real workbook pages (edge cases around attached vs. standalone marks,
  multi-mark runs, and abbreviation-like periods). This is recorded as a
  known follow-up for later hardening — do NOT treat punctuation detection as
  fully solved.

## PoC 5: Matching Interactions (Complete)

- [x] Detect clean two-column one-to-one matching exercises locally without a VLM (`matching-v1`)
- [x] Use printed connection anchor dots as the primary evidence: isolated small filled blobs forming two perfectly aligned vertical columns
- [x] Reject punctuation glyphs (`?`/`!`/periods), prose, unrelated lists, vocabulary columns, FillBlank rows, ChoiceGrid tables, SentenceOrdering separator dots, headers/footers, and weak 1–2-dot candidates
- [x] Persist interaction, item, and anchor normalized geometry additively in `PageAnalysis` v0.2 (no migration)
- [x] Deterministic IDs (`matching-page-index`, items `-left-i` / `-right-j`)
- [x] Tolerant label detection: numeric left (`1`–`6`) and alphabetic right (`A`–`F`) labels, standalone or glued; ordinary uppercase words never become labels
- [x] Multi-line (wrapped) items grouped within their row band; reading order per side independent of the printed right-side scramble
- [x] Multiple exercises per page: stacked exercises share anchor columns and split by row gap (page 106 = 3 exercises, page 188 = 2)
- [x] Missing single anchors tolerated (`anchorBbox: null`, item still interactive)
- [x] Click-to-pair UX directly on the page: left → right and right → left, active-item highlight, thin SVG connection lines between printed anchors
- [x] One-to-one enforced structurally: rematching frees both previous partners; unpair via anchor ✕; compact reset pill per exercise
- [x] Persist partial `leftItemId -> rightItemId` answers locally (kind `matching`)
- [x] Fingerprints ignore rotation/zoom/view state; stale geometry or item-count changes invalidate answers
- [x] Restore pairs across navigation and hard refresh; mixed stores with PoC 1–4 answers verified
- [x] Lines and hitboxes rotate 0/90/180/270 and zoom to 200% with the shared normalized geometry (`rotateBBox`)
- [x] Exercise-isolated state: clicks in exercise A never connect to exercise B
- [x] Keyboard-accessible item buttons with aria labels and focus styles; no mouse-only paths
- [x] Add a distinct matching debug overlay (exercise/items/anchors, left/right colored)
- [x] Verify primary PDF 49 (printed 53, exercise 5: exactly 1 interaction, 6+6 items, 12/12 anchors) and secondaries 48, 106 (×3), 188 (×2), 130, 182, 8, 29
- [x] Verify negatives: 5, 11, 15, 16, 18, 20, 21, 30, 33, 39, 44, 65, 70, 100, 120, 243 (0 detections; all prior interaction types unchanged)
- [x] Detector runtime ~70–130 ms/page (matching-v1 alone)

PoC 5 is intentionally structural. It detects clean two-column one-to-one
exercises and records the learner's chosen pairs; it does NOT know which pairs
are correct, does not parse the answer key, and does not implement grading or
explanations (Answer Key + Correction is a later PoC).

### Known follow-up (for later hardening)

- Matching exercises without printed anchor dots are not detected.
- One-to-many / many-to-many / image-to-text matching are out of scope.
- Exercises stacked without a title-line gap merge into one interaction;
  side-by-side exercises with horizontally interleaved columns are not
  supported.

## Planned Product Capabilities

### Learning tools

- [ ] Click-to-translate
- [ ] Contextual vocabulary persistence
- [x] Interactive graphical fill-in-the-blank placement
- [x] Interactive choice-marker placement
- [x] Interactive choice-grid placement
- [x] Interactive sentence-ordering placement
- [x] Interactive matching placement (one-to-one)
- [ ] Exercise correction and explanations
- [ ] Highlights and annotations

### Analysis

- [ ] Higher-level visual understanding
- [ ] Optional VLM or Gemini-based analysis where useful
- [x] Graphical fill-in-the-blank placement
- [x] Choice-marker interactions (`targetId -> optionId`)
- [x] Choice-grid interactions (`rowId -> selectedColumnOptionId`)
- [x] Sentence-ordering interactions (`interactionId -> orderedItemIds`)
- [x] Matching interactions (`leftItemId -> rightItemId`, one-to-one)
- [ ] Matching variants: one-to-many, many-to-many, image-to-text
- [ ] Exercise correction and explanations

### Books and processing

- [ ] Book library UI
- [ ] Background multi-page processing
- [ ] Page thumbnails or continuous navigation
- [ ] Processing history and operational controls

### Later

- [ ] RAG or book chat
- [ ] User authentication
- [ ] Mobile adaptation
- [ ] EPUB or DOCX support
- [ ] LinguaTint integration
