export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextSpan {
  id: string;
  text: string;
  confidence: number;
  confidenceScope: string;
  parentLineId?: string | null;
  bbox: BBox;
}

export interface ProcessorMetadata {
  engine: string;
  engineVersion: string;
  model: string;
  language: string;
  parameters: Record<string, unknown>;
  durationMs: number;
  processedAt: string;
}

export interface ExerciseBlank {
  id: string;
  kind: 'fill-in-line';
  lineBbox: BBox;
  interactionBbox: BBox;
  detectionMethod: 'horizontal-line-v1' | 'short-suffix-line-v1';
  candidateScore: number;
  nearbyTextSpanIds: string[];
}

export interface BlankDetectionMetadata {
  detectionMethod: 'horizontal-line-v1';
  rawCandidateCount: number;
  acceptedCount: number;
  durationMs: number;
}

export interface PageAnalysis {
  schemaVersion: string;
  pageNumber: number;
  width: number;
  height: number;
  language: string;
  textSpans: TextSpan[];
  exerciseBlanks: ExerciseBlank[];
  blankDetection: BlankDetectionMetadata | null;
  processor: ProcessorMetadata;
}
