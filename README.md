# Lexora

Some scanned language books lack selectable text, click-to-translate, vocabulary persistence, and interactive exercises. Lexora preserves the original page while adding the interactive learning tools that static scans are missing.

**Status:** PoC 1 complete. Lexora detects graphical fill-in lines locally and places zoom-safe HTML inputs over the original scanned page. Answer checking and broader exercise understanding remain planned.

## What Works Today

- Scanned PDF upload and original-page rendering with PDF.js
- Explicit per-page processing through PDFBox and PaddleOCR
- Persisted `PageAnalysis` JSONB for each processed page
- Normalized OCR geometry in the `[0,1]` range
- Aligned overlays at 75%, 100%, 125%, 150%, 175%, and 200% zoom
- Clickable OCR spans with text, confidence, and geometry debug data
- Deterministic OpenCV detection of printed horizontal answer lines, including a conservative short-suffix path and table/grid line rejection
- Persisted normalized physical-line and interaction geometry
- Transparent, keyboard-accessible inputs that scale with PDF zoom
- Local exercise answers persisted per browser, book, and page
- Separate OCR and blank-detection debug overlays
- Immediate reuse of persisted `READY` pages without rerunning OCR
- In-page analysis overlay with real stage labels instead of a percentage bar
- Retry for `FAILED` pages
- Real coarse stages: `PENDING`, `RASTERIZING`, `OCR`, `DETECTING_BLANKS`, `PERSISTING`, `READY`, `FAILED`
- Book, selected page, and debug overlay preference restoration after refresh
- PDF-area loading skeleton during restoration
- Four-service Docker Compose development workflow

## Notes

- Exercise answers are stored only in the browser's `localStorage` under `lexora.exerciseAnswers.v1`. They persist across navigation and refresh, but are per-browser data, not cloud or user-account data.
- Answers are attached to a stable blank fingerprint. If a page is reprocessed and a blank moves or the schema changes, the old answer is ignored rather than attached to the wrong blank.

## Not Implemented Yet

- Click-to-translate
- Contextual vocabulary persistence
- Exercise correction and explanations
- Backend or account-based answer persistence
- Higher-level visual understanding
- Optional VLM or Gemini-based analysis
- RAG or book chat

## Architecture

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React 19, TypeScript 7, Vite 8, PDF.js 6.2 | PDF rendering, page status, OCR overlays, and interactive blank inputs |
| Backend | Java 21, Spring Boot 4.1, PDFBox, PostgreSQL 18 | Upload, rasterization, processing orchestration, and persistence |
| AI service | Python 3.12, FastAPI, PaddleOCR 3.7, OpenCV 4.10 | OCR, graphical blank detection, normalization, and processor metadata |

See [`docs/architecture.md`](docs/architecture.md), [`docs/page-analysis.md`](docs/page-analysis.md), and [`docs/exercise-detection.md`](docs/exercise-detection.md) for the durable technical contract.

## Demo

The screenshots use an original synthetic page processed by the real application. No workbook page is committed.

### OCR page analysis

![Lexora OCR page analysis](docs/images/lexora-ocr-demo.png)

### Interactive fill-in-the-blank overlay

![Lexora interactive exercise](docs/images/lexora-fill-blank-demo.png)

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
