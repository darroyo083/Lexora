import { useCallback, useEffect, useRef } from 'react';
import { Sun, Moon } from 'lucide-react';
import type { ThemeMode } from '../state/theme';
import { ZOOM_OPTIONS } from '../reader/zoom';
import type { ProcessControl, ProcessingTarget } from '../reader/processing';

interface BookInfo {
  id: string;
  pageCount: number;
}

interface Props {
  book: BookInfo | null;
  selectedPage: number;
  onSelectPage: (page: number) => void;
  onUpload: (file: File) => void;
  onProcessPage: () => void;
  processControl: ProcessControl;
  processButtonLabel: string;
  processing: boolean;
  processingBusy: boolean;
  processingTarget: ProcessingTarget | null;
  pageStage: string | null;
  status: string;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  rotation: number;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  devMode: boolean;
  onToggleDevMode: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

function useRepeatPageAction(onStep: () => void, disabled: boolean) {
  const timeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    stop();
    if (disabled) return;
    onStep();
    timeoutRef.current = window.setTimeout(() => {
      intervalRef.current = window.setInterval(() => {
        onStep();
      }, 100);
    }, 350);
  }, [disabled, onStep, stop]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  return {
    onMouseDown: (e: React.MouseEvent) => {
      if (e.button === 0) start();
    },
    onMouseUp: stop,
    onMouseLeave: stop,
    onTouchStart: start,
    onTouchEnd: stop,
    onTouchCancel: stop,
    onClick: (e: React.MouseEvent) => {
      e.preventDefault();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
        onStep();
      }
    },
  };
}

export default function ReaderToolbar({
  book,
  selectedPage,
  onSelectPage,
  onUpload,
  onProcessPage,
  processControl,
  processButtonLabel,
  processing,
  processingBusy,
  processingTarget,
  pageStage,
  status,
  zoom,
  onZoomChange,
  rotation,
  onRotateLeft,
  onRotateRight,
  devMode,
  onToggleDevMode,
  theme,
  onToggleTheme,
}: Props) {
  const canGoPrev = book ? selectedPage > 1 : false;
  const canGoNext = book ? selectedPage < book.pageCount : false;

  const selectedPageRef = useRef(selectedPage);
  const bookRef = useRef(book);
  selectedPageRef.current = selectedPage;
  bookRef.current = book;

  const stepPrev = useCallback(() => {
    if (selectedPageRef.current > 1) {
      onSelectPage(selectedPageRef.current - 1);
    }
  }, [onSelectPage]);

  const stepNext = useCallback(() => {
    if (bookRef.current && selectedPageRef.current < bookRef.current.pageCount) {
      onSelectPage(selectedPageRef.current + 1);
    }
  }, [onSelectPage]);

  const prevHandlers = useRepeatPageAction(stepPrev, !canGoPrev);
  const nextHandlers = useRepeatPageAction(stepNext, !canGoNext);

  const innerContent = (
    <>
      <div className="toolbar-left">
        <div className="logo-group">
          <span className="brand-logo">Lexora</span>
          <span className="doc-tag">Workbook Reader</span>
        </div>

        <label className="upload-btn" title="Upload a scanned workbook PDF">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>Upload PDF</span>
          <input
            type="file"
            accept=".pdf"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onUpload(file);
            }}
          />
        </label>
      </div>

      <div className="toolbar-center">
        {book && (
          <div className="page-nav-group" aria-label="Page Navigation">
            <button
              type="button"
              className="page-nav-btn"
              disabled={!canGoPrev}
              title="Previous Page (Left Arrow / K)"
              aria-label="Previous Page"
              {...prevHandlers}
            >
              ‹
            </button>

            <span className="page-info">
              Page
              <input
                type="number"
                min={1}
                max={book.pageCount}
                value={selectedPage}
                aria-label={`Go to page, currently page ${selectedPage} of ${book.pageCount}`}
                onChange={(event) => {
                  const nextPage = Math.max(1, Math.min(book.pageCount, Number(event.target.value)));
                  onSelectPage(nextPage);
                }}
                className="page-input"
              />
              <span className="page-total">/ {book.pageCount}</span>
            </span>

            <button
              type="button"
              className="page-nav-btn"
              disabled={!canGoNext}
              title="Next Page (Right Arrow / J)"
              aria-label="Next Page"
              {...nextHandlers}
            >
              ›
            </button>
          </div>
        )}

        <div className="view-controls">
          <select
            value={zoom}
            onChange={(event) => onZoomChange(Number(event.target.value))}
            className="zoom-select"
            aria-label="Zoom Level"
          >
            {ZOOM_OPTIONS.map((option) => (
              <option key={option} value={option}>{Math.round(option * 100)}%</option>
            ))}
          </select>

          {book && (
            <div className="rotate-controls" aria-label="Page rotation">
              <button
                type="button"
                className="rotate-btn"
                aria-label="Rotate page left"
                title="Rotate page left"
                onClick={onRotateLeft}
              >
                ↺
              </button>
              <span className="rotate-degree" aria-live="polite">
                {rotation}°
              </span>
              <button
                type="button"
                className="rotate-btn"
                aria-label="Rotate page right"
                title="Rotate page right"
                onClick={onRotateRight}
              >
                ↻
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="toolbar-right">
        {book && (
          <div className="analysis-action-group">
            <button
              type="button"
              className="process-btn"
              onClick={onProcessPage}
              disabled={processControl === 'none' || processControl === 'processed' || processing || processingBusy}
            >
              {processButtonLabel}
            </button>
            {processingBusy && !processing && (
              <span className="status">Processing page {processingTarget?.pageNumber}…</span>
            )}
            {pageStage === 'FAILED' && (
              <span className="status status-error">Failed. Retry is available.</span>
            )}
            {status === 'uploading' && <span className="status">Uploading...</span>}
          </div>
        )}

        <button
          type="button"
          className="theme-toggle-btn"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`}
          aria-label="Toggle Theme Mode"
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        <button
          type="button"
          className={`dev-toggle-btn ${devMode ? 'active' : ''}`}
          title={`Developer Mode (${devMode ? 'ON' : 'OFF'}) — Ctrl+Shift+D`}
          aria-label="Toggle Developer Mode"
          onClick={onToggleDevMode}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m18 16 4-4-4-4" />
            <path d="m6 8-4 4 4 4" />
            <path d="m14.5 4-5 16" />
          </svg>
          <span className="dev-toggle-badge">{devMode ? 'DEV ON' : 'DEV'}</span>
        </button>
      </div>
    </>
  );

  return (
    <header className="toolbar reader-toolbar">
      <div className="toolbar-inner">
        {innerContent}
      </div>
    </header>
  );
}
