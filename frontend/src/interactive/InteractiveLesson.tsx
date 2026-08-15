import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CircleCheck,
  Eye,
  ListChecks,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import type { MatchingSelection } from '../reader/matching';
import { parseMatchingAnswer } from '../reader/matching';
import AskLexora from '../components/AskLexora';
import type { ExerciseContext } from '../api/assist';
import { parseOrderedAnswer } from '../reader/ordering';
import {
  isProcessingStage,
  PROCESSING_MESSAGE_INTERVAL_MS,
  stageCopy,
  stageMessages,
} from '../reader/processing';
import type { PageProcessingStatus } from '../api/client';
import type { AnswerResolutionStatus, CorrectionVerdict } from '../state/correction';
import type { Lesson, LessonProjection } from './lesson';
import { readLessonStep, writeLessonStep } from './lessonProgress';
import {
  buildLessonSteps,
  assistExerciseId,
  stepAnswerComplete,
  type ActivityLessonStep,
  type ContextLessonStep,
} from './lessonSteps';

interface Props {
  projection: LessonProjection;
  pageNumber: number;
  pageCount: number;
  pageStage: PageProcessingStatus | null;
  failureReason: string | null;
  pageLoadError: string | null;
  correctionLoadError: string | null;
  answers: Record<string, string>;
  matchingSelection: MatchingSelection | null;
  verdictByItem: Record<string, CorrectionVerdict | undefined>;
  resolutionByItem: Record<string, AnswerResolutionStatus>;
  correctionDetails: Record<string, { correctCount: number; totalCount: number }>;
  reveal: Record<string, boolean>;
  expectedByItem: Record<string, string>;
  canCheck: boolean;
  onSelectPage: (page: number) => void;
  onProcessPage: () => void;
  onRetryPageLoad: () => void;
  onRetryCorrectionLoad: () => void;
  onUseClassic: () => void;
  onAnswerChange: (itemId: string, value: string) => void;
  onChoiceSelect: (choiceId: string, optionId: string) => void;
  onGridSelect: (rowId: string, optionId: string) => void;
  onOrderingItemClick: (interactionId: string, itemId: string) => void;
  onMatchingItemClick: (interactionId: string, itemId: string, side: 'left' | 'right') => void;
  onMatchingUnpair: (interactionId: string, itemId: string) => void;
  onMatchingReset: (interactionId: string) => void;
  onCheck: (itemIds?: string[]) => void;
  onRetry: (itemId: string) => void;
  onReveal: (itemId: string) => void;
  onActiveExerciseChange?: (exercise: {
    exerciseId: string;
    assistExerciseId?: string;
    kind: string;
    answer: string | null;
  } | null) => void;
  assist?: {
    bookId: string | null;
    pageNumber: number;
    exercise: ExerciseContext | null;
    siteKey: string | null;
  } | null;
}

const VERDICT_LABEL: Partial<Record<CorrectionVerdict, string>> = {
  CORRECT: 'Correct',
  INCORRECT: 'Not quite yet',
  PARTIALLY_CORRECT: 'Partly correct',
  UNANSWERED: 'Add an answer first',
  NOT_AUTO_GRADABLE: 'Open response saved',
};

const RESOLUTION_LABEL: Partial<Record<AnswerResolutionStatus, string>> = {
  UNMAPPED: 'Lexora could not map this item to a reliable source answer, so it remains open.',
  AMBIGUOUS: 'The source answer could not be matched unambiguously, so Lexora leaves it open.',
  MISSING: 'The source does not provide a model answer for this item, so Lexora leaves it open.',
  EXTRACTION_UNCERTAIN: 'The source answer is uncertain, so Lexora leaves it open.',
};

const RESOLUTION_HEADING: Partial<Record<AnswerResolutionStatus, string>> = {
  UNMAPPED: 'No reliable source answer',
  AMBIGUOUS: 'Source answer needs review',
  MISSING: 'No model answer',
  EXTRACTION_UNCERTAIN: 'Source answer needs review',
};

const FAMILY_COPY: Record<ActivityLessonStep['block']['kind'], { title: string }> = {
  'fill-blank': { title: 'Complete the sentence' },
  choice: { title: 'Choose an answer' },
  'choice-grid': { title: 'Choose for each row' },
  'sentence-ordering': { title: 'Build the sentence' },
  matching: { title: 'Match the pairs' },
  'free-text': { title: 'Write your answer' },
};

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? true
      : window.matchMedia(REDUCED_MOTION_QUERY).matches
  ));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = () => setReduced(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return reduced;
}

function ProcessingExperience({ stage, onUseClassic }: {
  stage: PageProcessingStatus;
  onUseClassic: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const copy = stageCopy(stage);
  const messages = stageMessages(stage);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    setMessageIndex(0);
    if (reducedMotion || messages.length < 2) return;
    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % messages.length);
    }, PROCESSING_MESSAGE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [messages, reducedMotion]);

  const message = messages[reducedMotion ? 0 : messageIndex] ?? 'Preparing the lesson';
  return (
    <section className="lesson-preparing" aria-labelledby="lesson-preparing-title">
      <div className="lesson-preparing-mark" aria-hidden="true">
        <LoaderCircle size={26} />
      </div>
      <p className="lesson-state-label">Interactive lesson</p>
      <h1 id="lesson-preparing-title" aria-live="polite">
        {copy?.title ?? 'Preparing your lesson'}
      </h1>
      <div className="lesson-processing-message" aria-hidden="true">
        <span key={message}>{message}</span>
      </div>
      <p className="lesson-state-copy">You can open the original page while this finishes.</p>
      <button type="button" className="lesson-secondary-action" onClick={onUseClassic}>
        <BookOpen size={17} aria-hidden="true" /> Open Classic
      </button>
    </section>
  );
}

function CorrectionFeedback({
  itemId,
  verdict,
  resolution,
  detail,
  revealed,
  expected,
  onRetry,
  onReveal,
}: {
  itemId: string;
  verdict: CorrectionVerdict | undefined;
  resolution: AnswerResolutionStatus | undefined;
  detail?: { correctCount: number; totalCount: number };
  revealed: boolean;
  expected?: string;
  onRetry: (itemId: string) => void;
  onReveal: (itemId: string) => void;
}) {
  const neutral = resolution ? RESOLUTION_LABEL[resolution] : undefined;
  const visible = Boolean(verdict || neutral || revealed);
  const canReveal = Boolean(expected) && !revealed && verdict !== 'CORRECT';
  const canRetry = Boolean(verdict && verdict !== 'CORRECT' && verdict !== 'NOT_AUTO_GRADABLE');

  return (
      <div className="lesson-feedback-slot">
      {visible && (
        <div className="lesson-feedback" data-verdict={verdict?.toLowerCase() ?? 'neutral'} role="status">
          <div className="lesson-feedback-copy">
            <strong>{verdict ? VERDICT_LABEL[verdict] : (resolution && RESOLUTION_HEADING[resolution]) ?? 'No reliable source answer'}</strong>
            {detail && <span>{detail.correctCount} of {detail.totalCount} correct.</span>}
            {neutral && <span>{neutral}</span>}
            {verdict === 'NOT_AUTO_GRADABLE' && (
              <span>This open response has no single correct wording. Ask Lexora for non-authoritative feedback.</span>
            )}
            {revealed && expected && <span className="lesson-expected">Answer: {expected}</span>}
          </div>
          {(canRetry || canReveal) && (
            <div className="lesson-feedback-actions">
              {canRetry && (
                <button type="button" onClick={() => onRetry(itemId)}>
                  <RotateCcw size={15} aria-hidden="true" /> Try again
                </button>
              )}
              {canReveal && (
                <button type="button" onClick={() => onReveal(itemId)}>
                  <Eye size={15} aria-hidden="true" /> Reveal
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StepMeta({ step }: { step: ContextLessonStep | ActivityLessonStep }) {
  if (step.kind === 'context') {
    const label = step.block.variant === 'example'
      ? 'Example'
      : step.block.variant === 'instruction' ? 'Instructions' : 'Read';
    return (
      <div className="lesson-step-meta">
        <span>{label}</span>
        {step.partCount > 1 && <span>Part {step.partIndex + 1} of {step.partCount}</span>}
      </div>
    );
  }

  return (
    <div className="lesson-step-meta">
      <span>Exercise {step.activityIndex + 1} of {step.activityCount}</span>
      {step.block.exerciseNumber && <span>Source exercise {step.block.exerciseNumber}</span>}
    </div>
  );
}

function ContextStepView({ step }: { step: ContextLessonStep }) {
  const title = step.block.variant === 'example'
    ? 'Source example'
    : step.block.variant === 'instruction' ? 'Before you begin' : 'From the workbook';
  return (
    <article className="lesson-step lesson-context-step" data-variant={step.block.variant}>
      <StepMeta step={step} />
      <div className="lesson-context-icon" aria-hidden="true">
        {step.block.variant === 'example' ? <Sparkles size={22} /> : <BookOpen size={22} />}
      </div>
      <h2 tabIndex={-1}>{title}</h2>
      <div className="lesson-context-copy">
        {step.paragraphs.map((paragraph) => <p key={paragraph.id}>{paragraph.text}</p>)}
      </div>
    </article>
  );
}

function ActivityStepView({ step, props }: { step: ActivityLessonStep; props: Props }) {
  const { block } = step;
  const family = FAMILY_COPY[block.kind];
  const feedback = (itemId: string) => (
    <CorrectionFeedback
      itemId={itemId}
      verdict={props.verdictByItem[itemId]}
      resolution={props.resolutionByItem[itemId]}
      detail={props.correctionDetails[itemId]}
      revealed={Boolean(props.reveal[itemId])}
      expected={props.expectedByItem[itemId]}
      onRetry={props.onRetry}
      onReveal={props.onReveal}
    />
  );

  const title = block.exerciseTitle || block.prompt || family.title;
  const intro = (
    <>
      <StepMeta step={step} />
      <h2 tabIndex={-1}>{title}</h2>
      {block.instruction && <p className="lesson-exercise-instruction">{block.instruction}</p>}
      {block.contextParagraphs && block.contextParagraphs.length > 0 && (
        <aside className="lesson-inline-context" aria-label="Context from the workbook">
          {block.contextParagraphs.map((paragraph) => <p key={paragraph.id}>{paragraph.text}</p>)}
        </aside>
      )}
    </>
  );

  if (block.kind === 'fill-blank') {
    return (
      <section className="lesson-step lesson-activity-step" data-kind={block.kind}>
        {intro}
        <div className="lesson-exercise-items lesson-fill-items">
          {block.blanks.map((blank, index) => {
            const prompt = block.itemPrompts[blank.id] || `Item ${index + 1}`;
            return <div className="lesson-fill-item" key={blank.id}>
              <label htmlFor={`${blank.id}-answer`}><span>{String.fromCharCode(97 + index)}) {prompt}</span><input id={`${blank.id}-answer`} value={props.answers[blank.id] ?? ''} onChange={(event) => props.onAnswerChange(blank.id, event.target.value)} autoComplete="off" aria-label={`Answer for ${prompt}`} /></label>
              {feedback(blank.id)}
            </div>;
          })}
        </div>
      </section>
    );
  }

  if (block.kind === 'choice') {
    const groupsByTarget = Object.fromEntries(block.targets.map((target) => [
      target.id,
      block.groupsByTarget?.[target.id] ?? block.group,
    ]));
    const hasCompleteGroups = block.targets.every((target) => Boolean(groupsByTarget[target.id]));
    return (
      <section className="lesson-step lesson-activity-step" data-kind={block.kind}>
        {intro}
        {hasCompleteGroups ? (
          <div className="lesson-exercise-items lesson-choice-items">
            {block.targets.map((target, index) => {
              const prompt = block.itemPrompts[target.id] || `Question ${index + 1}`;
              const group = groupsByTarget[target.id]!;
              return <fieldset key={target.id} className="lesson-choice-item"><legend><span>{index + 1}</span>{prompt}</legend><div className="lesson-option-grid">{group.options.map((option) => <label key={option.id} className="lesson-option"><input type="radio" name={target.id} value={option.id} checked={props.answers[target.id] === option.id} onChange={() => props.onChoiceSelect(target.id, option.id)} /><span>{option.label}</span></label>)}</div>{feedback(target.id)}</fieldset>;
            })}
          </div>
        ) : (
          <div className="lesson-neutral-note">
            <BookOpen size={18} aria-hidden="true" />
            <span>The source options could not be resolved safely. Use Classic for this exercise.</span>
          </div>
        )}
      </section>
    );
  }

  if (block.kind === 'choice-grid') {
    return (
      <section className="lesson-step lesson-activity-step" data-kind={block.kind}>
        {intro}
        {block.group ? (
          <div className="lesson-choice-grid" role="group" aria-label={title}>
            <div className="lesson-choice-grid-head"><span>Item</span>{block.group.options.map((option) => <span key={option.id}>{option.label}</span>)}</div>
            {block.grid.rows.map((row, index) => <div className="lesson-choice-grid-row" key={row.id}><strong>{block.rowPrompts[row.id] || `Item ${index + 1}`}</strong>{block.group!.options.map((option) => <label key={option.id}><span className="sr-only">{block.rowPrompts[row.id] || `Item ${index + 1}`}: {option.label}</span><input type="radio" name={row.id} value={option.id} checked={props.answers[row.id] === option.id} onChange={() => props.onGridSelect(row.id, option.id)} /></label>)}</div>)}
            {feedback(block.grid.id)}
          </div>
        ) : (
          <div className="lesson-neutral-note">
            <BookOpen size={18} aria-hidden="true" />
            <span>The source options could not be resolved safely. Use Classic for this exercise.</span>
          </div>
        )}
      </section>
    );
  }

  if (block.kind === 'sentence-ordering') {
    return (
      <section className="lesson-step lesson-activity-step" data-kind={block.kind}>
        {intro}
        <div className="lesson-exercise-items lesson-ordering-items">{block.interactions.map((ordering, index) => {
          const selected = parseOrderedAnswer(props.answers[ordering.id]); const itemById = new Map(ordering.items.map((item) => [item.id, item])); const result = selected.map((id) => itemById.get(id)?.text ?? id).join(' ');
          return <div className="lesson-ordering-item" key={ordering.id}><h3>{String.fromCharCode(97 + index)})</h3><div className="lesson-ordering-result" aria-live="polite"><ListChecks size={18} aria-hidden="true" /><span>{result || 'Select the words in the correct order.'}</span></div><div className="lesson-token-row" aria-label={`Words for sentence ${index + 1}`}>{ordering.items.map((item) => { const position = selected.indexOf(item.id); return <button type="button" key={item.id} className="lesson-token" data-selected={position >= 0} aria-pressed={position >= 0} onClick={() => props.onOrderingItemClick(ordering.id, item.id)}>{position >= 0 && <span aria-hidden="true">{position + 1}</span>}{item.text}</button>; })}</div>{feedback(ordering.id)}</div>;
        })}</div>
      </section>
    );
  }

  if (block.kind === 'matching') {
    const pairs = parseMatchingAnswer(props.answers[block.interaction.id]);
    const pairedRightIds = new Set(Object.values(pairs));
    const selected = props.matchingSelection?.interactionId === block.interaction.id
      ? props.matchingSelection
      : null;
    return (
      <section className="lesson-step lesson-activity-step" data-kind={block.kind}>
        {intro}
        <p className="lesson-step-help">Choose a place first, then its matching item.</p>
        <div className="lesson-matching-columns">
          <div>
            <h3>Places</h3>
            {block.interaction.leftItems.map((item) => (
              <button
                type="button"
                key={item.id}
                className="lesson-match-item"
                data-selected={selected?.itemId === item.id}
                data-paired={Boolean(pairs[item.id])}
                aria-pressed={selected?.itemId === item.id || Boolean(pairs[item.id])}
                onClick={() => props.onMatchingItemClick(block.interaction.id, item.id, 'left')}
              >{item.label}. {item.text}</button>
            ))}
          </div>
          <div>
            <h3>Matching items</h3>
            {block.interaction.rightItems.map((item) => (
              <button
                type="button"
                key={item.id}
                className="lesson-match-item"
                data-selected={selected?.itemId === item.id}
                data-paired={pairedRightIds.has(item.id)}
                aria-pressed={selected?.itemId === item.id || pairedRightIds.has(item.id)}
                onClick={() => props.onMatchingItemClick(block.interaction.id, item.id, 'right')}
              >{item.label}. {item.text}</button>
            ))}
          </div>
        </div>
        {Object.keys(pairs).length > 0 && (
          <div className="lesson-pairs" aria-label="Created pairs">
            {Object.entries(pairs).map(([leftId, rightId]) => (
              <button type="button" key={leftId} onClick={() => props.onMatchingUnpair(block.interaction.id, leftId)}>
                {block.interaction.leftItems.find((item) => item.id === leftId)?.label ?? leftId}
                <span aria-hidden="true">+</span>
                {block.interaction.rightItems.find((item) => item.id === rightId)?.label ?? rightId}
                <span className="sr-only">Remove pair</span>
              </button>
            ))}
            <button type="button" className="lesson-reset-link" onClick={() => props.onMatchingReset(block.interaction.id)}>Reset pairs</button>
          </div>
        )}
        {feedback(block.interaction.id)}
      </section>
    );
  }

  return (
    <section className="lesson-step lesson-activity-step" data-kind={block.kind}>
      {intro}
      <div className="lesson-control-region lesson-free-text-control">
        <label htmlFor={`${block.interaction.id}-answer`}>Your response</label>
        <textarea
          id={`${block.interaction.id}-answer`}
          rows={4}
          value={props.answers[block.interaction.id] ?? ''}
          onChange={(event) => props.onAnswerChange(block.interaction.id, event.target.value)}
        />
          <small>Open response. Your work is saved; Lexora does not claim an automatic grade for this kind of answer.</small>
      </div>
      <p className="lesson-save-status" role="status">{props.answers[block.interaction.id]?.trim() ? 'Saved on this device' : 'Your response is saved automatically.'}</p>
      {feedback(block.interaction.id)}
    </section>
  );
}

function CompletionStepView({ pageNumber, activityCount }: { pageNumber: number; activityCount: number }) {
  return (
    <section className="lesson-step lesson-completion-step">
      <div className="lesson-completion-mark" aria-hidden="true"><CircleCheck size={30} /></div>
      <p className="lesson-family-label">Page {pageNumber}</p>
      <h2 tabIndex={-1}>Lesson complete</h2>
      <p>You reached the end of {activityCount === 1 ? 'this activity' : `these ${activityCount} activities`}.</p>
      <span>Your answers remain connected to the original workbook page.</span>
    </section>
  );
}

function isUnsupportedActivity(step: ActivityLessonStep): boolean {
  const block = step.block;
  if (block.kind === 'choice') {
    return block.targets.some((target) => !(
      block.groupsByTarget?.[target.id] ?? block.group
    ));
  }
  return block.kind === 'choice-grid' && !block.group;
}

function stepHasFeedback(step: ActivityLessonStep, props: Props): boolean {
  return step.correctionItemIds.some((itemId) => (
    props.verdictByItem[itemId] !== undefined
    || props.resolutionByItem[itemId] !== undefined
    || props.reveal[itemId]
  ));
}

function UnavailableLesson(props: Props) {
  const waiting = isProcessingStage(props.pageStage);
  if (waiting && props.pageStage) {
    return (
      <div className="interactive-lesson interactive-lesson-state">
        <ProcessingExperience stage={props.pageStage} onUseClassic={props.onUseClassic} />
      </div>
    );
  }

  const loadFailed = Boolean(props.pageLoadError);
  const processingFailed = props.pageStage === 'FAILED';
  const unsupported = props.projection.status === 'UNAVAILABLE'
    && props.projection.reason === 'NO_MEANINGFUL_CONTENT'
    && props.pageStage === 'READY';
  const title = loadFailed
    ? 'This page could not be opened'
    : processingFailed
      ? 'We could not prepare this lesson'
      : unsupported
        ? 'This page works best in Classic'
        : 'Turn this page into a guided lesson';
  const copy = loadFailed
    ? 'Your workbook is safe. Retry the page data, or continue with the original page.'
    : processingFailed
      ? 'The source page is unchanged. You can try preparing it again or keep studying in Classic.'
      : unsupported
        ? 'Lexora could not find enough trustworthy structure for a native lesson, so it will not invent one.'
        : 'Lexora can organize trustworthy source content into focused, interactive steps.';

  return (
    <div className="interactive-lesson interactive-lesson-state">
      <section className="lesson-empty-state">
        <div className="lesson-state-mark"><BookOpen size={27} aria-hidden="true" /></div>
        <p className="lesson-state-label">Interactive lesson</p>
        <h1>{title}</h1>
        <p className="lesson-state-copy">{copy}</p>
        <div className="lesson-state-actions">
          {!unsupported && (
            <button
              type="button"
              className="lesson-primary-action"
              onClick={loadFailed ? props.onRetryPageLoad : props.onProcessPage}
            >
              {loadFailed ? <RefreshCw size={17} aria-hidden="true" /> : <Sparkles size={17} aria-hidden="true" />}
              {loadFailed ? 'Retry page' : processingFailed ? 'Try again' : 'Prepare lesson'}
            </button>
          )}
          <button type="button" className="lesson-secondary-action" onClick={props.onUseClassic}>
            <BookOpen size={17} aria-hidden="true" /> Open Classic
          </button>
        </div>
      </section>
    </div>
  );
}

function AvailableLessonPlayer({ props, lesson }: { props: Props; lesson: Lesson }) {
  const steps = useMemo(() => buildLessonSteps(lesson), [lesson]);
  const stepIds = useMemo(() => steps.map((step) => step.id), [steps]);
  const [activeStepId, setActiveStepId] = useState(() => readLessonStep(lesson.id, stepIds));
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const focusAfterNavigation = useRef(false);
  const stepContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveStepId(readLessonStep(lesson.id, stepIds));
    focusAfterNavigation.current = false;
  }, [lesson.id, stepIds]);

  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activeStepId));
  const step = steps[activeIndex] ?? steps[0];

  useEffect(() => {
    const onChange = props.onActiveExerciseChange;
    if (!onChange) return;
    if (step.kind !== 'activity') {
      onChange(null);
      return;
    }
    const block = step.block;
    const kind = block.kind === 'fill-blank' ? 'fill-in-line' : block.kind;
    const exerciseId = step.answerItemIds[0];
    if (!exerciseId) {
      onChange(null);
      return;
    }
    onChange({
      exerciseId,
      assistExerciseId: assistExerciseId(block),
      kind,
      answer: props.answers[exerciseId] ?? null,
    });
  }, [step, props.answers, props.onActiveExerciseChange]);

  const activitySteps = steps.filter((candidate) => candidate.kind === 'activity');
  const activityPosition = step.kind === 'activity'
    ? step.activityIndex + 1
    : step.kind === 'completion' ? activitySteps.length : 0;
  const progress = activitySteps.length === 0 ? 0 : (activityPosition / activitySteps.length) * 100;

  useEffect(() => {
    if (!focusAfterNavigation.current) return;
    focusAfterNavigation.current = false;
    stepContainerRef.current?.querySelector<HTMLElement>('h2')?.focus();
  }, [activeStepId]);

  const navigateTo = (nextIndex: number) => {
    const next = steps[Math.max(0, Math.min(steps.length - 1, nextIndex))];
    if (!next || next.id === step.id) return;
    setDirection(nextIndex < activeIndex ? 'back' : 'forward');
    setActiveStepId(next.id);
    writeLessonStep(lesson.id, next.id);
    focusAfterNavigation.current = true;
  };

  const activityStep = step.kind === 'activity' ? step : null;
  const unsupported = activityStep ? isUnsupportedActivity(activityStep) : false;
  const answerComplete = activityStep ? (unsupported || stepAnswerComplete(activityStep, props.answers)) : true;
  const hasFeedback = activityStep ? stepHasFeedback(activityStep, props) : false;
  const canEvaluate = Boolean(
    activityStep
    && activityStep.block.kind !== 'free-text'
    && !unsupported
    && activityStep.correctionItemIds.length > 0
    && props.canCheck
    && !props.correctionLoadError,
  );
  const handlePrimaryAction = () => {
    if (step.kind === 'completion') {
      if (props.pageNumber < props.pageCount) props.onSelectPage(props.pageNumber + 1);
      else props.onUseClassic();
      return;
    }
    if (step.kind === 'activity' && canEvaluate && !hasFeedback) {
      props.onCheck(step.correctionItemIds);
      return;
    }
    navigateTo(activeIndex + 1);
  };

  const primaryLabel = step.kind === 'completion'
    ? props.pageNumber < props.pageCount ? 'Next page' : 'Open Classic'
    : step.kind === 'activity' && canEvaluate && !hasFeedback
      ? 'Check answers'
      : step.kind === 'activity' ? 'Next exercise' : 'Continue';

  const stepLabel = step.kind === 'context'
    ? 'Lesen'
    : step.kind === 'activity' ? `Exercise ${activityPosition}` : 'Complete';

  return (
    <div className="interactive-lesson lesson-player">
      <header className="lesson-player-header">
        <div className="lesson-player-title">
          <div className="lesson-source-context">
            {lesson.unitNumber && <span>Unit {lesson.unitNumber}</span>}
            <span>Page {lesson.source.pageNumber}</span>
          </div>
          <h1>{lesson.title}</h1>
        </div>
        <button type="button" className="lesson-classic-link" onClick={props.onUseClassic}>
          <BookOpen size={16} aria-hidden="true" /> Classic
        </button>
        {props.assist && (
          <div className="lesson-help-action">
            <span>Help for this exercise</span>
            <AskLexora
              bookId={props.assist.bookId}
              pageNumber={props.assist.pageNumber}
              exercise={props.assist.exercise}
              siteKey={props.assist.siteKey}
              mode="interactive"
            />
          </div>
        )}
        <div className="lesson-progress" aria-label={`Lesson progress, exercise ${activityPosition} of ${activitySteps.length}`}>
          <div className="lesson-progress-copy">
            <span>{stepLabel}</span>
            <span>{activityPosition} of {activitySteps.length} exercises</span>
          </div>
          <div
            className="lesson-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={activitySteps.length}
            aria-valuenow={activityPosition}
            aria-label={`Exercise ${activityPosition} of ${activitySteps.length}`}
          >
            <span style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
        </div>
      </header>

      <main className="lesson-stage" ref={stepContainerRef}>
        <div key={step.id} className="lesson-step-motion" data-direction={direction}>
          {step.kind === 'context' && <ContextStepView step={step} />}
          {step.kind === 'activity' && <ActivityStepView step={step} props={props} />}
          {step.kind === 'completion' && (
            <CompletionStepView pageNumber={lesson.source.pageNumber} activityCount={step.activityCount} />
          )}
        </div>
      </main>

      <footer className="lesson-player-actions">
        <button
          type="button"
          className="lesson-back-action"
          disabled={activeIndex === 0}
          onClick={() => navigateTo(activeIndex - 1)}
        >
          <ArrowLeft size={17} aria-hidden="true" /> Back
        </button>
        <div className="lesson-action-note">
          {props.correctionLoadError ? (
            <button type="button" onClick={props.onRetryCorrectionLoad}>Correction unavailable. Retry</button>
          ) : (
            <span>{activityStep && !canEvaluate
              ? 'Your response is saved. Open responses stay ungraded automatically; Ask Lexora can offer non-authoritative feedback.'
              : 'Progress is saved on this device.'}</span>
          )}
        </div>
        <button
          type="button"
          className="lesson-primary-action"
          disabled={step.kind === 'activity' && !answerComplete}
          onClick={handlePrimaryAction}
        >
          {canEvaluate && !hasFeedback ? <Check size={17} aria-hidden="true" /> : null}
          {primaryLabel}
          {(!canEvaluate || hasFeedback) && <ArrowRight size={17} aria-hidden="true" />}
        </button>
      </footer>
    </div>
  );
}

export default function InteractiveLesson(props: Props) {
  if (props.projection.status === 'UNAVAILABLE') return <UnavailableLesson {...props} />;
  return <AvailableLessonPlayer props={props} lesson={props.projection.lesson} />;
}
