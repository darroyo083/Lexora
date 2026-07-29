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

## PoC 1: Fill-in-the-Blank Exercise Detection (Not Started)

- [ ] Detect exercise regions from page analysis
- [ ] Detect answer areas and blank geometry
- [ ] Overlay interactive inputs on the original page
- [ ] Persist exercise models
- [ ] Preserve exercise alignment across zoom levels

## Planned Product Capabilities

### Learning tools

- [ ] Click-to-translate
- [ ] Contextual vocabulary persistence
- [ ] Interactive fill-in-the-blank exercises
- [ ] Exercise correction and explanations
- [ ] Highlights and annotations

### Analysis

- [ ] Higher-level visual understanding
- [ ] Optional VLM or Gemini-based analysis where useful
- [ ] Additional exercise types

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
