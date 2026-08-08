import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ACTIVE_STAGES,
  currentPageStage,
  isCurrentPageProcessing,
  isProcessingStage,
  processLabel,
  PROCESSING_MESSAGE_INTERVAL_MS,
  PROCESSING_STAGE_COPY,
  PROCESSING_STAGE_LABELS,
  resolveProcessControl,
  stageCopy,
  stageLabel,
  stageMessages,
  visibleIntersection,
} from '../processing';
import { ZOOM_OPTIONS } from '../zoom';

describe('processing stage UI', () => {
  it('maps every active backend stage to stage-local title and leading message copy', () => {
    for (const stage of ACTIVE_STAGES) {
      const copy = stageCopy(stage);

      expect(copy).toEqual(PROCESSING_STAGE_COPY[stage]);
      expect(copy?.title).toBeTruthy();
      expect(copy?.messages[0]).toBeTruthy();
    }

    expect(stageLabel('OCR')).toBe('Reading the page');
    expect(stageMessages('OCR')[0]).toBe('Locating text across the page');

    expect(PROCESSING_STAGE_LABELS).toMatchObject({
      PENDING: 'Preparing the page',
      RASTERIZING: 'Preparing the page',
      OCR: 'Reading the page',
      DETECTING_INTERACTIONS: 'Finding interactions',
      PERSISTING: 'Finalizing the page',
    });
  });

  it('treats only active stages as processing', () => {
    for (const stage of ACTIVE_STAGES) {
      expect(isProcessingStage(stage)).toBe(true);
    }
    expect(isProcessingStage('READY')).toBe(false);
    expect(isProcessingStage('FAILED')).toBe(false);
    expect(isProcessingStage(null)).toBe(false);
  });

  it('keeps a separate multi-message cycle for every active stage', () => {
    const allMessages = ACTIVE_STAGES.flatMap((stage) => {
      const messages = stageMessages(stage);

      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages.length).toBeLessThanOrEqual(3);
      expect(new Set(messages).size).toBe(messages.length);
      expect(messages).toEqual(PROCESSING_STAGE_COPY[stage].messages);
      return messages;
    });

    expect(new Set(allMessages).size).toBe(allMessages.length);
    expect(PROCESSING_MESSAGE_INTERVAL_MS).toBeGreaterThanOrEqual(2800);
    expect(PROCESSING_MESSAGE_INTERVAL_MS).toBeLessThanOrEqual(3200);
  });

  it('keeps active copy truthful and free of queue or progress language', () => {
    const activeCopy = ACTIVE_STAGES.flatMap((stage) => {
      const copy = PROCESSING_STAGE_COPY[stage];
      return [copy.title, ...copy.messages];
    }).join(' ');

    expect(activeCopy).not.toMatch(/queue|queued|job|almost|underway|progress|ready to explore/i);
  });

  it('returns no rotating messages for null or terminal stages', () => {
    expect(stageCopy(null)).toBeNull();
    expect(stageMessages(null)).toEqual([]);
    expect(stageMessages('READY')).toEqual([]);
    expect(stageMessages('FAILED')).toEqual([]);
    expect(stageLabel(null)).toBeNull();
    expect(stageLabel('READY')).toBe('Analysis ready');
    expect(stageLabel('FAILED')).toBe('Analysis failed');
  });

  it('does not expose a numerical percentage for any stage', () => {
    for (const copy of Object.values(PROCESSING_STAGE_COPY)) {
      const text = [copy.title, ...copy.messages].join(' ');
      expect(text).not.toMatch(/\d+%/);
      expect(text).not.toMatch(/\d+(\.\d+)?/);
    }

    for (const label of Object.values(PROCESSING_STAGE_LABELS)) {
      expect(label).not.toMatch(/\d+%/);
      expect(label).not.toMatch(/\d+(\.\d+)?/);
    }
  });

  it('exposes Retry for FAILED and keeps Processed for READY', () => {
    expect(resolveProcessControl('FAILED', 'process')).toBe('retry');
    expect(processLabel('retry')).toBe('Retry');
    expect(resolveProcessControl('READY', 'none')).toBe('processed');
    expect(processLabel('processed')).toBe('Processed');
  });

  it('exposes an explicit Update analysis action for a READY page with persisted analysis', () => {
    expect(resolveProcessControl('READY', 'update')).toBe('update');
    expect(processLabel('update')).toBe('Update analysis');
  });

  it('reports active processing and the plain process action otherwise', () => {
    expect(resolveProcessControl('OCR', 'process')).toBe('processing');
    expect(processLabel('processing')).toBe('Processing');
    expect(resolveProcessControl('PENDING', 'process')).toBe('processing');
    expect(resolveProcessControl(null, 'process')).toBe('process');
  });
});

describe('processing target identity vs global lock', () => {
  const bookId = 'book-1';
  const target = { bookId, pageNumber: 33 };

  it('only treats the page being analyzed as the current processing page', () => {
    expect(isCurrentPageProcessing(target, bookId, 33)).toBe(true);
    expect(isCurrentPageProcessing(target, bookId, 39)).toBe(false);
    expect(isCurrentPageProcessing(target, 'book-2', 33)).toBe(false);
    expect(isCurrentPageProcessing(null, bookId, 33)).toBe(false);
  });

  it('navigating to a READY page B shows B normally, not the processing shell', () => {
    expect(isCurrentPageProcessing(target, bookId, 39)).toBe(false);
    const stage = currentPageStage('READY', isCurrentPageProcessing(target, bookId, 39));
    expect(stage).toBe('READY');
    expect(isProcessingStage(stage)).toBe(false);
  });

  it('navigating to an unprocessed page C shows its normal empty state, not PENDING', () => {
    expect(isCurrentPageProcessing(target, bookId, 40)).toBe(false);
    const stage = currentPageStage(undefined, isCurrentPageProcessing(target, bookId, 40));
    expect(stage).toBeNull();
    expect(isProcessingStage(stage)).toBe(false);
  });

  it('the target page shows the synthetic PENDING only while its resource is absent', () => {
    expect(isCurrentPageProcessing(target, bookId, 33)).toBe(true);
    expect(currentPageStage(undefined, true)).toBe('PENDING');
    expect(currentPageStage('READY', true)).toBe('READY');
    expect(currentPageStage('OCR', true)).toBe('OCR');
  });

  it('completion clears the target so B keeps its own stage with no corruption', () => {
    expect(isCurrentPageProcessing(null, bookId, 39)).toBe(false);
    expect(currentPageStage('READY', false)).toBe('READY');
    expect(currentPageStage(undefined, false)).toBeNull();
    expect(currentPageStage('READY', false)).not.toBe('PENDING');
  });

  it('rapid A -> B -> C navigation never inherits a processing stage', () => {
    for (const page of [33, 34, 35]) {
      const isCurrent = isCurrentPageProcessing(target, bookId, page);
      expect(isCurrent).toBe(page === 33);
      const stage = currentPageStage(page === 33 ? 'PENDING' : 'READY', isCurrent);
      expect(isProcessingStage(stage)).toBe(page === 33);
    }
  });

  it('a persisted active stage on the visible page still shows its overlay', () => {
    expect(currentPageStage('DETECTING_INTERACTIONS', false)).toBe('DETECTING_INTERACTIONS');
    expect(isProcessingStage('DETECTING_INTERACTIONS')).toBe(true);
  });
});

describe('zoom options', () => {
  it('offers the full supported range including 175% and 200%', () => {
    expect(ZOOM_OPTIONS).toContain(1.75);
    expect(ZOOM_OPTIONS).toContain(2.0);
    expect(ZOOM_OPTIONS).toEqual(expect.arrayContaining([0.75, 1.0, 1.25, 1.5]));
  });
});

describe('visible processing position', () => {
  const viewport = { left: 0, right: 765, top: 42, bottom: 637 };

  it('centers in the visible top intersection of a 200% page', () => {
    expect(visibleIntersection(
      { left: -165, right: 931, top: 58, bottom: 1556 },
      viewport,
    )).toEqual({ center: { x: 382.5, y: 347.5 }, width: 765 });
  });

  it('centers in the visible middle intersection of a 200% page', () => {
    expect(visibleIntersection(
      { left: -165, right: 931, top: -400, bottom: 1098 },
      viewport,
    )).toEqual({ center: { x: 382.5, y: 339.5 }, width: 765 });
  });

  it('centers in the visible bottom intersection of a 200% page', () => {
    expect(visibleIntersection(
      { left: -165, right: 931, top: -900, bottom: 598 },
      viewport,
    )).toEqual({ center: { x: 382.5, y: 320 }, width: 765 });
  });

  it('centers the visible horizontal page slice when the page is clipped', () => {
    expect(visibleIntersection(
      { left: -331, right: 765, top: 58, bottom: 1556 },
      viewport,
    )).toEqual({ center: { x: 382.5, y: 347.5 }, width: 765 });
  });

  it('reports the genuinely narrow visible slice when the page edge clips it', () => {
    expect(visibleIntersection(
      { left: -1000, right: 180, top: 58, bottom: 1556 },
      viewport,
    )).toEqual({ center: { x: 90, y: 347.5 }, width: 180 });
  });

  it('reports the full page when the page is smaller than the viewport', () => {
    expect(visibleIntersection(
      { left: 80, right: 560, top: 90, bottom: 480 },
      viewport,
    )).toEqual({ center: { x: 320, y: 285 }, width: 480 });
  });

  it('returns no intersection when the page is outside the reader viewport', () => {
    expect(visibleIntersection(
      { left: 0, right: 1096, top: 700, bottom: 2198 },
      viewport,
    )).toBeNull();
  });
});

describe('reduced-motion support', () => {
  it('disables overlay animation and transitions under prefers-reduced-motion', () => {
    const css = readFileSync(
      fileURLToPath(new URL('../../index.css', import.meta.url)),
      'utf-8',
    );
    expect(css).toMatch(/prefers-reduced-motion\s*:\s*reduce/);
    expect(css).toMatch(/\.page-scan-line,\s*\.processing-spinner-ring\s*\{[^}]*animation\s*:\s*none/);
    expect(css).toMatch(/\.page-scan-line,\s*\.processing-spinner-ring\s*\{[^}]*transition\s*:\s*none/);
    expect(css).toMatch(/page-processing,\s*\.page-processing \*\s*\{[^}]*animation\s*:\s*none/);
    expect(css).toMatch(/page-processing,\s*\.page-processing \*\s*\{[^}]*transition\s*:\s*none/);
    expect(css).toMatch(/page-stack-processing \.page-canvas[\s\S]*filter:\s*blur\(/);
    expect(css).toMatch(/page-processing-detail-message\s*\{[^}]*animation/);
    expect(css).not.toContain('.page-processing-dim');
    expect(css).toMatch(/\.page-processing-content\s*\{[^}]*border-radius:\s*6px/);
    expect(css).toMatch(/\.page-scan-line\s*\{[^}]*animation:\s*scan-sweep-antigravity/);
    expect(css).toMatch(/\.processing-spinner-ring\s*\{[^}]*animation:\s*spinner-rotate/);
    expect(css).toMatch(/\.page-processing-title\s*\{[^}]*animation:\s*text-shimmer-lr/);
    expect(css).not.toContain('halftone-grid-wave');
    expect(css).not.toContain('card-minimal-light');
  });
});

describe('stage announcement integration', () => {
  it('keeps one persistent live region separate from the visual caption', () => {
    const pageViewer = readFileSync(
      fileURLToPath(new URL('../PageViewer.tsx', import.meta.url)),
      'utf-8',
    );

    expect(pageViewer).toContain('aria-busy={processing}');
    expect(pageViewer).toContain('stageLabel(processingStage)');
    expect(pageViewer).toContain(
      '<div className="sr-only" role="status" aria-live="polite" aria-atomic="true">',
    );
    expect((pageViewer.match(/role="status"/g) ?? []).length).toBe(1);
    expect((pageViewer.match(/aria-live="polite"/g) ?? []).length).toBe(1);
  });
});
