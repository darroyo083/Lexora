# Lexora

Some scanned language books lack selectable text, click-to-translate, vocabulary persistence, and interactive exercises. Lexora preserves the original page while adding the interactive learning tools that static scans are missing.

**Status:** PoC 4 complete; PoC 5 (matching) complete; PoC 6 (free-text writing) complete. Lexora detects graphical fill-in lines, circular choice markers, interactive choice grids, sentence-ordering rows, matching exercises, and free-text writing areas locally, and places zoom-safe inputs, selectors, radio targets, ordering chips, matching pair lines, and writing overlays over the original scanned page. Answer checking and broader exercise understanding remain planned.

## What Works Today

- Scanned PDF upload and original-page rendering with PDF.js
- Explicit per-page processing through PDFBox and PaddleOCR
- Persisted `PageAnalysis` JSONB for each processed page
- Normalized OCR geometry in the `[0,1]` range
- Aligned overlays at 75%, 100%, 125%, 150%, 175%, and 200% zoom
- Clickable OCR spans with text, confidence, and geometry debug data
- Deterministic OpenCV detection of printed horizontal answer lines, including a conservative short-suffix path and table/grid line rejection
- Deterministic OpenCV detection of hollow circular choice markers with numbered option-set extraction from `1 = ...` legends
- Deterministic OpenCV detection of interactive choice grids (rows of empty answer cells under short column headers), rejecting static/explanatory grammar tables
- Deterministic OpenCV detection of sentence-ordering rows (separator-dot fragments) and matching exercises (aligned printed anchor dots)
- Deterministic OpenCV detection of free-text writing areas (isolated long writing-line stacks with prompt proximity), kept explicitly separate from FillBlank lines
- Persisted normalized physical and interaction geometry for blanks, choice targets, grid rows/cells, ordering items, matching items/anchors, and free-text response lines
- Transparent, keyboard-accessible inputs, choice targets, grid radio targets, ordering fragments, matching item buttons, and free-text writing inputs/textareas that scale with PDF zoom
- Compact anchored choice selector (option buttons + clear) with Escape/click-outside closing and arrow-key navigation
- Choice-grid rows as radio groups: one structured selection per row, replaced on change, with arrow-key navigation
- Click-to-order sentence fragments with floating per-exercise cards or a docked panel (one shared answer state)
- Click-to-pair matching: left → right pairing with thin SVG connection lines between printed anchors, one-to-one replacement, unpair, and per-exercise reset
- Free-text writing: single-line inputs or multi-line textareas aligned to the printed writing lines, with text persisted per browser/book/page
- Structured local answers per browser, book, and page: typed text for blanks, `targetId -> optionId` for choice markers, `rowId -> optionId` for grid rows, `orderedItemIds` for ordering, `leftItemId -> rightItemId` pairs for matching, raw learner text for free-text areas
- Separate OCR, blank-detection, choice-detection, grid-detection, ordering-detection, matching-detection, and free-text-detection debug overlays
- Immediate reuse of persisted `READY` pages without rerunning OCR
- In-page analysis overlay with real stage labels instead of a percentage bar
- Retry for `FAILED` pages
- Real coarse stages: `PENDING`, `RASTERIZING`, `OCR`, `DETECTING_INTERACTIONS`, `PERSISTING`, `READY`, `FAILED`
- Explicit **Update analysis** for legacy and pre-PoC 3 pages
- Book, selected page, and debug overlay preference restoration after refresh
- PDF-area loading skeleton during restoration
- Four-service Docker Compose development workflow

## Notes

- Exercise answers are stored only in the browser's `localStorage` under `lexora.exerciseAnswers.v1`. They persist across navigation and refresh, but are per-browser data, not cloud or user-account data.
- Answers are attached to a stable interaction fingerprint. If a page is reprocessed and a blank or choice target moves or its option group changes, the old answer is ignored rather than attached to the wrong interaction.
- Choice answers are structured option IDs (for example `choice-group-16-1-3`), never rendered coordinates. Lexora does not know whether the chosen option is correct.
- Choice-grid answers are structured per row (`grid-row-id -> option-id`), one selection per row. Lexora does not know whether the chosen option is correct.
- Sentence-ordering answers are ordered item IDs; matching answers are `leftItemId -> rightItemId` pairs with one-to-one enforcement; free-text answers are the learner's own text. Lexora does not know the correct order, the correct pairs, or whether a written response is correct.

## Not Implemented Yet

- Click-to-translate
- Contextual vocabulary persistence
- Exercise correction and explanations
- Answer-key matching (PoC 5 records learner pairs only)
- Matching variants: one-to-many, many-to-many, image-to-text, no-anchor layouts
- Backend or account-based answer persistence
- Higher-level visual understanding
- Optional VLM or Gemini-based analysis
- RAG or book chat

## Architecture

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React 19, TypeScript 7, Vite 8, PDF.js 6.2 | PDF rendering, page status, OCR overlays, interactive blank inputs, choice selectors, grid targets, ordering chips, matching pair lines, and free-text writing overlays |
| Backend | Java 21, Spring Boot 4.1, PDFBox, PostgreSQL 18 | Upload, rasterization, processing orchestration, and persistence |
| AI service | Python 3.12, FastAPI, PaddleOCR 3.7, OpenCV 4.10 | OCR, graphical blank/choice-marker/choice-grid/ordering/matching/free-text detection, normalization, and processor metadata |

See [`docs/architecture.md`](docs/architecture.md), [`docs/page-analysis.md`](docs/page-analysis.md), [`docs/exercise-detection.md`](docs/exercise-detection.md), [`docs/choice-interactions.md`](docs/choice-interactions.md), [`docs/choice-grid-interactions.md`](docs/choice-grid-interactions.md), [`docs/sentence-ordering-interactions.md`](docs/sentence-ordering-interactions.md), [`docs/matching-interactions.md`](docs/matching-interactions.md), and [`docs/free-text-interactions.md`](docs/free-text-interactions.md) for the durable technical contract.

## Demo

The screenshots use original synthetic pages processed by the real application. No workbook page is committed.

### OCR page analysis

![Lexora OCR page analysis](docs/images/lexora-ocr-demo.png)

### Interactive fill-in-the-blank overlay

![Lexora interactive exercise](docs/images/lexora-fill-blank-demo.png)

### Choice-marker interaction with selected values

![Lexora choice-marker interaction](docs/images/lexora-choice-demo.png)

## Local Development

Prerequisite: Docker Desktop with Docker Compose on Windows, macOS, or Linux.

```powershell
./scripts/dev-up.ps1
```

Open <http://localhost:5173>, upload a scanned PDF, select a page, and choose **Process**. Services run detached; inspect them with:

```powershell
./scripts/dev-status.ps1
./scripts/dev-logs.ps1
./scripts/dev-down.ps1
```

Equivalent direct command:

```bash
docker compose up -d --build
```

## Tests

```powershell
docker compose --profile test run --rm --build ai-test
cd backend; ./mvnw.cmd test
cd ../frontend; npm test -- --run
npm run build
```

## Roadmap

See [`docs/roadmap.md`](docs/roadmap.md). Planned capabilities are intentionally not presented as implemented.

## License

Not yet determined. All rights reserved during the PoC phase.
