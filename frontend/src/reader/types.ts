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
  detectionMethod: 'horizontal-line-v1' | 'short-suffix-line-v1' | 'vision-structured-v1';
  candidateScore: number;
  nearbyTextSpanIds: string[];
}

export interface BlankDetectionMetadata {
  detectionMethod: 'horizontal-line-v1' | 'vision-structured-v1';
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
  detectionMethod: 'empty-ring-v1' | 'vision-structured-v1';
  candidateScore: number;
  nearbyTextSpanIds: string[];
}

export interface ChoiceDetectionMetadata {
  detectionMethod: 'empty-ring-v1' | 'vision-structured-v1';
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
  detectionMethod: 'table-grid-v1' | 'vision-structured-v1';
  candidateScore: number;
  rows: ChoiceGridRow[];
}

export interface ChoiceGridDetectionMetadata {
  detectionMethod: 'table-grid-v1' | 'vision-structured-v1';
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
  detectionMethod: 'sentence-ordering-v1' | 'vision-structured-v1';
  candidateScore: number;
  nearbyTextSpanIds: string[];
  items: SentenceOrderingItem[];
}

export interface SentenceOrderingDetectionMetadata {
  detectionMethod: 'sentence-ordering-v1' | 'vision-structured-v1';
  rawCandidateCount: number;
  acceptedCount: number;
  groupCount: number;
  durationMs: number;
}

export interface MatchingItem {
  id: string;
  label: string;
  text: string;
  bbox: BBox;
  anchorBbox: BBox | null;
  nearbyTextSpanIds: string[];
}

export interface MatchingInteraction {
  id: string;
  kind: 'matching';
  bbox: BBox;
  detectionMethod: 'matching-v1' | 'vision-structured-v1';
  candidateScore: number;
  cardinality: 'one-to-one';
  nearbyTextSpanIds: string[];
  leftItems: MatchingItem[];
  rightItems: MatchingItem[];
}

export interface MatchingDetectionMetadata {
  detectionMethod: 'matching-v1' | 'vision-structured-v1';
  rawCandidateCount: number;
  acceptedCount: number;
  groupCount: number;
  durationMs: number;
}

export interface FreeTextLine {
  id: string;
  bbox: BBox;
}

export interface FreeTextInteraction {
  id: string;
  kind: 'free-text';
  bbox: BBox;
  detectionMethod: 'free-text-v1' | 'vision-structured-v1';
  candidateScore: number;
  nearbyTextSpanIds: string[];
  responseLines: FreeTextLine[];
}

export interface FreeTextDetectionMetadata {
  detectionMethod: 'free-text-v1' | 'vision-structured-v1';
  rawCandidateCount: number;
  acceptedCount: number;
  groupCount: number;
  durationMs: number;
}

export interface SemanticExercise {
  id: string;
  number: string | null;
  title: string | null;
  instruction: string | null;
  kind: 'fill-blank' | 'choice' | 'choice-grid' | 'sentence-ordering' | 'matching' | 'free-text';
  bbox: BBox;
  sourceOrder: number;
  interactionIds: string[];
  contextSpanIds: string[];
  detectionMethod: 'vision-semantic-v1';
  confidence: number;
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
  matchingInteractions: MatchingInteraction[];
  matchingDetection: MatchingDetectionMetadata | null;
  freeTextInteractions: FreeTextInteraction[];
  freeTextDetection: FreeTextDetectionMetadata | null;
  semanticExercises: SemanticExercise[];
  processor: ProcessorMetadata;
}
