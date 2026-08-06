import type { PageProcessingStatus } from '../api/client';

export const ACTIVE_STAGES: PageProcessingStatus[] = [
  'PENDING', 'RASTERIZING', 'OCR', 'DETECTING_INTERACTIONS', 'PERSISTING',
];

export const PROCESSING_MESSAGE_INTERVAL_MS = 3000;

/**
 * After F5 the in-flight browser POST is gone but the backend job may still
 * be running. A read-only tracker poll follows an active-stage current page
 * to its terminal state so the restored page does not stay stuck in a shell
 * after the backend actually finished.
 */
export const RECOVERY_POLL_INTERVAL_MS = 1000;
export const RECOVERY_POLL_MAX_TICKS = 60;

export interface RectLike {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface VisibleIntersection {
  center: Point;
  width: number;
}

export function visibleIntersection(pageRect: RectLike, viewportRect: RectLike): VisibleIntersection | null {
  const left = Math.max(pageRect.left, viewportRect.left);
  const right = Math.min(pageRect.right, viewportRect.right);
  const top = Math.max(pageRect.top, viewportRect.top);
  const bottom = Math.min(pageRect.bottom, viewportRect.bottom);

  if (left >= right || top >= bottom) return null;

  return {
    center: {
      x: (left + right) / 2,
      y: (top + bottom) / 2,
    },
    width: right - left,
  };
}

export interface ProcessingStageCopy {
  title: string;
  messages: readonly string[];
}

export const PROCESSING_STAGE_COPY: Record<PageProcessingStatus, ProcessingStageCopy> = {
  PENDING: {
    title: 'Preparing the page',
    messages: [
      'Starting page processing',
      'Loading the selected page',
      'Preparing analysis inputs',
    ],
  },
  RASTERIZING: {
    title: 'Preparing the page',
    messages: [
      'Rendering the document for analysis',
      'Preserving page geometry',
      'Preparing visual content',
    ],
  },
  OCR: {
    title: 'Reading the page',
    messages: [
      'Locating text across the page',
      'Mapping text to its original position',
      'Recognizing the page structure',
    ],
  },
  DETECTING_INTERACTIONS: {
    title: 'Finding interactions',
    messages: [
      'Locating answer areas',
      'Identifying response fields',
      'Mapping interactive regions',
    ],
  },
  PERSISTING: {
    title: 'Finalizing the page',
    messages: [
      'Saving page analysis',
      'Storing interactive geometry',
      'Preparing the page for use',
    ],
  },
  READY: {
    title: 'Analysis ready',
    messages: [],
  },
  FAILED: {
    title: 'Analysis failed',
    messages: [],
  },
};

export const PROCESSING_STAGE_LABELS: Record<PageProcessingStatus, string> =
  Object.fromEntries(
    Object.entries(PROCESSING_STAGE_COPY).map(([stage, copy]) => [stage, copy.title]),
  ) as Record<PageProcessingStatus, string>;

export function isProcessingStage(stage: PageProcessingStatus | null): boolean {
  return stage !== null && ACTIVE_STAGES.includes(stage);
}

export interface ProcessingTarget {
  bookId: string;
  pageNumber: number;
}

/**
 * Whether the page currently being viewed is itself the page that a heavy
 * processing request is analyzing. A global in-flight lock must never drive
 * the visual processing state of a page that is not the processing target.
 */
export function isCurrentPageProcessing(
  target: ProcessingTarget | null,
  bookId: string | undefined,
  pageNumber: number,
): boolean {
  return target !== null && target.bookId === bookId && target.pageNumber === pageNumber;
}

/**
 * The visible stage for the CURRENT page. A persisted page status wins; the
 * synthetic PENDING is only used while the current page is the processing
 * target but its resource has not been observed as processing yet. Other pages
 * never inherit a processing stage from an unrelated in-flight request.
 */
export function currentPageStage(
  pageStatus: PageProcessingStatus | null | undefined,
  currentPageProcessing: boolean,
): PageProcessingStatus | null {
  if (pageStatus != null) return pageStatus;
  return currentPageProcessing ? 'PENDING' : null;
}

export function stageCopy(stage: PageProcessingStatus | null): ProcessingStageCopy | null {
  return stage ? PROCESSING_STAGE_COPY[stage] : null;
}

export function stageMessages(stage: PageProcessingStatus | null): readonly string[] {
  if (stage === null || !isProcessingStage(stage)) return [];
  return PROCESSING_STAGE_COPY[stage].messages;
}

export function stageLabel(stage: PageProcessingStatus | null): string | null {
  return stageCopy(stage)?.title ?? null;
}

export type ProcessControl = 'process' | 'update' | 'retry' | 'processed' | 'processing' | 'none';

export function resolveProcessControl(
  stage: PageProcessingStatus | null,
  action: 'process' | 'update' | 'none',
): ProcessControl {
  if (action === 'update') return 'update';
  if (stage === 'READY') return 'processed';
  if (stage === 'FAILED') return 'retry';
  if (stage !== null && ACTIVE_STAGES.includes(stage)) return 'processing';
  return 'process';
}

export function processLabel(control: ProcessControl): string {
  switch (control) {
    case 'update': return 'Update analysis';
    case 'processed': return 'Processed';
    case 'retry': return 'Retry';
    case 'processing': return 'Processing';
    default: return 'Process';
  }
}
