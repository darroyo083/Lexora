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

export interface ChoiceOption {
  id: string;
  label: string;
}

export interface ChoiceGroup {
  id: string;
  options: ChoiceOption[];
}

export interface ChoiceTarget {
  id: string;
  kind: 'choice';
  targetBbox: BBox;
  interactionBbox: BBox;
  optionGroupId: string | null;
  detectionMethod: 'empty-ring-v1';
  candidateScore: number;
  nearbyTextSpanIds: string[];
}

export interface ChoiceDetectionMetadata {
  detectionMethod: 'empty-ring-v1';
  rawCandidateCount: number;
  acceptedCount: number;
  groupCount: number;
  durationMs: number;
}

export interface ChoiceGridCell {
  id: string;
  optionId: string;
  cellBbox: BBox;
  interactionBbox: BBox;
}

export interface ChoiceGridRow {
  id: string;
  rowBbox: BBox;
  promptBbox: BBox | null;
  nearbyTextSpanIds: string[];
  cells: ChoiceGridCell[];
}

export interface ChoiceGrid {
  id: string;
  kind: 'choice-grid';
  gridBbox: BBox;
  optionGroupId: string;
  detectionMethod: 'table-grid-v1';
  candidateScore: number;
  rows: ChoiceGridRow[];
}

export interface ChoiceGridDetectionMetadata {
  detectionMethod: 'table-grid-v1';
  rawCandidateCount: number;
  acceptedCount: number;
  groupCount: number;
  durationMs: number;
}

export interface SentenceOrderingItem {
  id: string;
  text: string;
  bbox: BBox;
  originalIndex: number;
}

export interface SentenceOrderingInteraction {
  id: string;
  kind: 'sentence-ordering';
  bbox: BBox;
  exerciseId: string;
  promptIndex: number;
  detectionMethod: 'sentence-ordering-v1';
  candidateScore: number;
  nearbyTextSpanIds: string[];
  items: SentenceOrderingItem[];
}

export interface SentenceOrderingDetectionMetadata {
  detectionMethod: 'sentence-ordering-v1';
  rawCandidateCount: number;
  acceptedCount: number;
  groupCount: number;
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
  choiceGroups: ChoiceGroup[];
  choiceTargets: ChoiceTarget[];
  choiceDetection: ChoiceDetectionMetadata | null;
  choiceGrids: ChoiceGrid[];
  choiceGridDetection: ChoiceGridDetectionMetadata | null;
  sentenceOrderings: SentenceOrderingInteraction[];
  sentenceOrderingDetection: SentenceOrderingDetectionMetadata | null;
  processor: ProcessorMetadata;
}
