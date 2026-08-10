import type {
  BBox,
  ChoiceGrid,
  ChoiceGroup,
  ChoiceTarget,
  ExerciseBlank,
  FreeTextInteraction,
  MatchingInteraction,
  SentenceOrderingInteraction,
} from '../reader/types';

export interface LessonSource {
  bookId: string;
  pageNumber: number;
  schemaVersion: string;
  processorEngine: string;
  processedAt: string;
}

export interface LessonEvidence {
  spanIds: string[];
  interactionIds: string[];
  bboxes: BBox[];
  confidence: number | null;
  detectionMethods: string[];
}

interface LessonBlockBase {
  id: string;
  sourceY: number;
  prompt: string | null;
  evidence: LessonEvidence;
}

export interface SourceParagraph {
  id: string;
  text: string;
  spanIds: string[];
}

export interface ContextLessonBlock extends LessonBlockBase {
  kind: 'context';
  variant: 'theory' | 'instruction' | 'example';
  paragraphs: SourceParagraph[];
}

export interface FillBlankLessonBlock extends LessonBlockBase {
  kind: 'fill-blank';
  blanks: ExerciseBlank[];
}

export interface ChoiceLessonBlock extends LessonBlockBase {
  kind: 'choice';
  targets: ChoiceTarget[];
  group: ChoiceGroup | null;
}

export interface ChoiceGridLessonBlock extends LessonBlockBase {
  kind: 'choice-grid';
  grid: ChoiceGrid;
  group: ChoiceGroup | null;
}

export interface OrderingLessonBlock extends LessonBlockBase {
  kind: 'sentence-ordering';
  exerciseId: string;
  interactions: SentenceOrderingInteraction[];
}

export interface MatchingLessonBlock extends LessonBlockBase {
  kind: 'matching';
  interaction: MatchingInteraction;
}

export interface FreeTextLessonBlock extends LessonBlockBase {
  kind: 'free-text';
  interaction: FreeTextInteraction;
}

export type LessonBlock =
  | ContextLessonBlock
  | FillBlankLessonBlock
  | ChoiceLessonBlock
  | ChoiceGridLessonBlock
  | OrderingLessonBlock
  | MatchingLessonBlock
  | FreeTextLessonBlock;

export interface LessonSection {
  id: string;
  heading: string | null;
  blocks: LessonBlock[];
}

export interface Lesson {
  id: string;
  title: string;
  unitNumber: number | null;
  unitTitle: string | null;
  source: LessonSource;
  sections: LessonSection[];
  blockCount: number;
  interactionCount: number;
}

export type LessonUnavailableReason =
  | 'ANALYSIS_UNAVAILABLE'
  | 'SOURCE_MISMATCH'
  | 'NO_MEANINGFUL_CONTENT';

export type LessonProjection =
  | { status: 'AVAILABLE'; lesson: Lesson }
  | { status: 'UNAVAILABLE'; reason: LessonUnavailableReason };

export interface LessonUnitContext {
  number: number;
  title?: string | null;
}
