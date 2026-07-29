# Lexora

Some scanned language books lack selectable text, click-to-translate, vocabulary persistence, and interactive exercises. Lexora preserves the original page while adding the interactive learning tools that static scans are missing.

**Status:** PoC 0 complete. Lexora currently proves per-page OCR, persistence, and zoom-safe overlays on scanned PDFs. Interactive learning features remain planned.

## What Works Today

- Scanned PDF upload and original-page rendering with PDF.js
- Explicit per-page processing through PDFBox and PaddleOCR
- Persisted `PageAnalysis` JSONB for each processed page
- Normalized OCR geometry in the `[0,1]` range
- Aligned overlays at 75%, 100%, 125%, and 150% zoom
- Clickable OCR spans with text, confidence, and geometry debug data
- Immediate reuse of persisted `READY` pages without rerunning OCR
- Retry for `FAILED` pages
- Real coarse stages: `PENDING`, `RASTERIZING`, `OCR`, `PERSISTING`, `READY`, `FAILED`
- Book, selected page, and OCR overlay preference restoration after refresh
- PDF-area loading skeleton during restoration
- Four-service Docker Compose development workflow

## Not Implemented Yet

- Interactive fill-in-the-blank exercises
- Click-to-translate
- Contextual vocabulary persistence
- Exercise correction and explanations
- Higher-level visual understanding
- Optional VLM or Gemini-based analysis
- RAG or book chat

## Architecture

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React 19, TypeScript 7, Vite 8, PDF.js 6.2 | PDF rendering, page status, progress, and OCR overlays |
| Backend | Java 21, Spring Boot 4.1, PDFBox, PostgreSQL 18 | Upload, rasterization, processing orchestration, and persistence |
| AI service | Python 3.12, FastAPI, PaddleOCR 3.7 | OCR, coordinate normalization, and processor metadata |

See [`docs/architecture.md`](docs/architecture.md) and [`docs/page-analysis.md`](docs/page-analysis.md) for the durable technical contract.

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
