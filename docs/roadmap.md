# Roadmap

## PoC 0 — OCR Overlay on Scanned Page ✅

- [x] Upload a scanned PDF
- [x] Rasterize selected page via PDFBox
- [x] OCR with PaddleOCR (German), obtain text spans and confidence
- [x] Normalize bounding boxes to [0,1]
- [x] Render original PDF with PDF.js
- [x] Display OCR boxes as overlays with perfect alignment
- [x] Click on a word/span to inspect text and confidence
- [x] Zoom 75%, 100%, 125%, 150% with maintained alignment
- [x] Reload without losing processed analysis (JSONB persistence)
- [x] Coordinate transform tests (Python + TypeScript)
- [x] Backend service and API tests

## PoC 1 — Fill-in-the-Blank Exercise Detection

Detect a fill-in-the-blank exercise on a real scanned page and convert the blank into an interactive HTML input positioned over the original gap.

- [ ] Semantic analysis of OCR results to identify exercises
- [ ] AnswerArea detection with per-field geometry
- [ ] Interactive input overlay on detected blanks
- [ ] Persist exercise model alongside PageAnalysis
- [ ] Zoom alignment maintained for exercise overlays

## MVP — Complete Study Workflow

### Books
- [ ] Book library UI
- [ ] Upload flow with progress indication
- [ ] Page navigation (thumbnails or scrolling)

### Processing
- [ ] Multi-page asynchronous processing
- [ ] Processing status per page (PENDING → PROCESSING → READY → FAILED)
- [ ] Retry failed pages
- [ ] Processing progress indication

### Reader
- [ ] Page rendering with all overlay layers
- [ ] Text selection via OCR text layer
- [ ] Highlight creation
- [ ] Annotation persistence

### Vocabulary
- [ ] Word selection → translate via configurable provider
- [ ] Save to vocabulary with context (page, sentence, position)
- [ ] Vocabulary list with filtering
- [ ] Known/learning status

### Exercises
- [ ] Fill-in-the-blank interactive inputs
- [ ] Answer submission and persistence
- [ ] Correction with explanation

## Later

- User authentication (Spring Security)
- Multi-page processing pipeline
- Advanced RAG-style chat (NotebookLM-like)
- LinguaTint integration (semantic word coloring)
- Additional exercise types (multiple choice, matching, ordering)
- EPUB/DOCX support
- Mobile adaptation
