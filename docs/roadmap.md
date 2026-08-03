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

## Planned Product Capabilities

### Learning tools

- [ ] Click-to-translate
- [ ] Contextual vocabulary persistence
- [x] Interactive graphical fill-in-the-blank placement
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
