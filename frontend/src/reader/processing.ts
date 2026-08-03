import type { PageProcessingStatus } from '../api/client';

export const ACTIVE_STAGES: PageProcessingStatus[] = [
  'PENDING', 'RASTERIZING', 'OCR', 'DETECTING_BLANKS', 'PERSISTING',
];

export const PROCESSING_MESSAGE_INTERVAL_MS = 3000;

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
  DETECTING_BLANKS: {
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
