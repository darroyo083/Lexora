import { useState, useCallback } from 'react';
import PageViewer from './reader/PageViewer';
import DebugPanel from './reader/DebugPanel';
import type { TextSpan } from './reader/types';
import { fetchPageAnalysis } from './api/client';

type Status = 'idle' | 'uploading' | 'processing' | 'ready';

interface BookInfo {
  id: string;
  pageCount: number;
}

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [book, setBook] = useState<BookInfo | null>(null);
  const [selectedPage, setSelectedPage] = useState(1);
  const [spans, setSpans] = useState<TextSpan[]>([]);
  const [selectedSpan, setSelectedSpan] = useState<TextSpan | null>(null);
  const [showBoxes, setShowBoxes] = useState(false);
  const [zoom, setZoom] = useState(1.0);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);

  const handleUpload = useCallback(async (file: File) => {
    setStatus('uploading');
    const form = new FormData();
    form.append('file', file);
    form.append('language', 'de');

    const res = await fetch('/api/books', { method: 'POST', body: form });
    const info: BookInfo = await res.json();
    setBook(info);

    const buffer = await file.arrayBuffer();
    setPdfData(buffer);

    setStatus('processing');
    const analysis = await fetchPageAnalysis(info.id, selectedPage);
    setSpans(analysis.textSpans);
    setStatus('ready');
  }, [selectedPage]);

  const handleProcessPage = useCallback(async () => {
    if (!book) return;
    setStatus('processing');
    const analysis = await fetchPageAnalysis(book.id, selectedPage);
    setSpans(analysis.textSpans);
    setStatus('ready');
  }, [book, selectedPage]);

  const handleSpanClick = useCallback((span: TextSpan) => {
    setSelectedSpan(span);
  }, []);

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Lexora PoC 0</h1>
        <div className="toolbar-controls">
          <label className="upload-btn">
            Upload PDF
            <input
              type="file"
              accept=".pdf"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
          </label>

          {book && (
            <>
              <span className="page-info">
                Page
                <input
                  type="number"
                  min={1}
                  max={book.pageCount}
                  value={selectedPage}
                  onChange={(e) => setSelectedPage(Number(e.target.value))}
                  className="page-input"
                />
                / {book.pageCount}
              </span>
              <button onClick={handleProcessPage} disabled={status === 'processing'}>
                Process
              </button>
            </>
          )}

          <select
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="zoom-select"
          >
            <option value={0.75}>75%</option>
            <option value={1.0}>100%</option>
            <option value={1.25}>125%</option>
            <option value={1.5}>150%</option>
          </select>

          <label className="toggle">
            <input
              type="checkbox"
              checked={showBoxes}
              onChange={(e) => setShowBoxes(e.target.checked)}
            />
            Show OCR boxes
          </label>

          {status === 'processing' && <span className="status">Processing...</span>}
        </div>
      </header>

      <main className="reader-layout">
        <div className="page-area">
          {pdfData ? (
            <PageViewer
              pdfData={pdfData}
              pageNumber={selectedPage}
              spans={spans}
              zoom={zoom}
              showBoxes={showBoxes}
              onSpanClick={handleSpanClick}
            />
          ) : (
            <div className="empty-state">
              Upload a scanned PDF to begin
            </div>
          )}
        </div>
        <DebugPanel span={selectedSpan} />
      </main>
    </div>
  );
}
