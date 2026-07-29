# Lexora

Lexora transforms static scanned language workbooks into interactive AI-assisted learning environments while preserving the original book page as the visual source of truth.

**Status:** PoC 0 — single-page PDF OCR overlay with clickable word spans.

## Problem

Scanned language books (commonly German workbooks) have no selectable text, no click-to-translate, no vocabulary persistence, and no interactive exercises. Lexora eliminates that friction by understanding the page, preserving it visually, and making it interactive.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript 7, Vite 8, PDF.js 6.2 |
| Backend | Java 21, Spring Boot 4.1, Maven, PostgreSQL 18 |
| AI / OCR | Python 3.12, FastAPI, PaddleOCR 3.7, PaddlePaddle CPU |

## Architecture

```
React (PDF.js canvas + overlay)
      ↓ /api
Spring Boot (books, pages, processing)
      ↓ /internal/document-analysis/pages
FastAPI + PaddleOCR (OCR, layout, PageAnalysis)
      ↓
PostgreSQL (relational metadata + JSONB analysis)
```

See `docs/architecture.md` for details.

## Setup

### Prerequisites

- Java 21
- Maven 3.9+
- Node.js 20+ (22+ recommended for pdfjs-dist)
- Python 3.12
- Docker (for PostgreSQL)

### Quickstart

```bash
docker compose up -d postgres

cd ai-service
pip install -e ".[test]"
uvicorn app.api.main:app --port 8000 &

cd ../backend
./mvnw spring-boot:run &

cd ../frontend
npm install
npm run dev
```

Open http://localhost:5173, upload a scanned PDF, select a page, and click Process.

## Running Tests

```bash
cd ai-service && python -m pytest
cd backend && mvn test
cd frontend && npm test
```

## Roadmap

See `docs/roadmap.md`.

## License

Not yet determined. All rights reserved during PoC phase.
