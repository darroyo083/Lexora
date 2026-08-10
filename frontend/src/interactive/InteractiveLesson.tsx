import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CircleCheck,
  Eye,
  Link2,
  ListChecks,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import type { MatchingSelection } from '../reader/matching';
import { parseMatchingAnswer } from '../reader/matching';
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
}

const VERDICT_LABEL: Partial<Record<CorrectionVerdict, string>> = {
  CORRECT: 'Correct',
  INCORRECT: 'Not quite yet',
  PARTIALLY_CORRECT: 'Partly correct',
  UNANSWERED: 'Add an answer first',
  NOT_AUTO_GRADABLE: 'Response saved',
};

const RESOLUTION_LABEL: Partial<Record<AnswerResolutionStatus, string>> = {
  UNMAPPED: 'This item has no mapped answer in the source key, so it stays ungraded.',
  AMBIGUOUS: 'The source answer is ambiguous, so Lexora will not grade this item.',
  MISSING: 'The source does not provide a model answer for this item.',
  EXTRACTION_UNCERTAIN: 'The source answer is uncertain, so this item stays ungraded.',
};

const FAMILY_COPY: Record<ActivityLessonStep['block']['kind'], { label: string; title: string }> = {
  'fill-blank': { label: 'Fill in the blank', title: 'Complete the sentence' },
  choice: { label: 'Choose', title: 'Choose an answer' },
  'choice-grid': { label: 'Choose', title: 'Choose for this statement' },
  'sentence-ordering': { label: 'Put in order', title: 'Build the sentence' },
  matching: { label: 'Match', title: 'Match the pairs' },
  'free-text': { label: 'Write', title: 'Write your response' },
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
            <strong>{verdict ? VERDICT_LABEL[verdict] : 'Not graded'}</strong>
            {detail && <span>{detail.correctCount} of {detail.totalCount} correct.</span>}
            {neutral && <span>{neutral}</span>}
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
      <span>Activity {step.activityIndex + 1} of {step.activityCount}</span>
      {step.itemCount > 1 && <span>Item {step.itemIndex + 1} of {step.itemCount}</span>}
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
  const { block, itemIndex } = step;
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

  if (block.kind === 'fill-blank') {
    const blank = block.blanks[itemIndex];
    const prompt = block.itemPrompts[blank.id] || block.prompt || family.title;
    return (
      <section className="lesson-step lesson-activity-step" data-kind={block.kind}>
        <StepMeta step={step} />
        <p className="lesson-family-label">{family.label}</p>
        <h2 tabIndex={-1}>{prompt}</h2>
        <div className="lesson-control-region lesson-fill-control">
          <label htmlFor={`${blank.id}-answer`}>Your answer</label>
          <input
            id={`${blank.id}-answer`}
            value={props.answers[blank.id] ?? ''}
            onChange={(event) => props.onAnswerChange(blank.id, event.target.value)}
            autoComplete="off"
          />
        </div>
        {feedback(blank.id)}
      </section>
    );
  }

  if (block.kind === 'choice') {
    const target = block.targets[itemIndex];
    const prompt = block.itemPrompts[target.id] || block.prompt || family.title;
    return (
      <section className="lesson-step lesson-activity-step" data-kind={block.kind}>
        <StepMeta step={step} />
        <p className="lesson-family-label">{family.label}</p>
        <h2 tabIndex={-1}>{prompt}</h2>
        {block.group ? (
          <fieldset className="lesson-option-grid">
            <legend className="sr-only">{prompt}</legend>
            {block.group.options.map((option) => (
              <label key={option.id} className="lesson-option">
                <input
                  type="radio"
                  name={target.id}
                  value={option.id}
                  checked={props.answers[target.id] === option.id}
                  onChange={() => props.onChoiceSelect(target.id, option.id)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <div className="lesson-neutral-note">
            <BookOpen size={18} aria-hidden="true" />
            <span>The source options could not be resolved safely. Use Classic for this item.</span>
          </div>
        )}
        {feedback(target.id)}
      </section>
    );
  }

  if (block.kind === 'choice-grid') {
    const row = block.grid.rows[itemIndex];
    const prompt = block.rowPrompts[row.id] || block.prompt || family.title;
    return (
      <section className="lesson-step lesson-activity-step" data-kind={block.kind}>
        <StepMeta step={step} />
        <p className="lesson-family-label">{family.label}</p>
        <h2 tabIndex={-1}>{prompt}</h2>
        {block.group ? (
          <fieldset className="lesson-option-grid lesson-grid-options">
            <legend className="sr-only">{prompt}</legend>
            {block.group.options.map((option) => (
              <label key={option.id} className="lesson-option">
                <input
                  type="radio"
                  name={row.id}
                  value={option.id}
                  checked={props.answers[row.id] === option.id}
                  onChange={() => props.onGridSelect(row.id, option.id)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <div className="lesson-neutral-note">
            <BookOpen size={18} aria-hidden="true" />
            <span>The source options could not be resolved safely. Use Classic for this row.</span>
          </div>
        )}
        {feedback(block.grid.id)}
      </section>
    );
  }

  if (block.kind === 'sentence-ordering') {
    const ordering = block.interactions[itemIndex];
    const selected = parseOrderedAnswer(props.answers[ordering.id]);
    const itemById = new Map(ordering.items.map((item) => [item.id, item]));
    const result = selected.map((id) => itemById.get(id)?.text ?? id).join(' ');
    return (
      <section className="lesson-step lesson-activity-step" data-kind={block.kind}>
        <StepMeta step={step} />
        <p className="lesson-family-label">{family.label}</p>
        <h2 tabIndex={-1}>{block.prompt || family.title}</h2>
        <div className="lesson-ordering-result" aria-live="polite">
          <ListChecks size={18} aria-hidden="true" />
          <span>{result || 'Choose each word in the order it belongs.'}</span>
        </div>
        <div className="lesson-token-row" aria-label="Available words">
          {ordering.items.map((item) => {
            const position = selected.indexOf(item.id);
            return (
              <button
                type="button"
                key={item.id}
                className="lesson-token"
                data-selected={position >= 0}
                aria-pressed={position >= 0}
                onClick={() => props.onOrderingItemClick(ordering.id, item.id)}
              >
                {position >= 0 && <span aria-hidden="true">{position + 1}</span>}
                {item.text}
              </button>
            );
          })}
        </div>
        {feedback(ordering.id)}
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
        <StepMeta step={step} />
        <p className="lesson-family-label">{family.label}</p>
        <h2 tabIndex={-1}>{block.prompt || family.title}</h2>
        <p className="lesson-step-help"><Link2 size={16} aria-hidden="true" /> Choose one item from each side.</p>
        <div className="lesson-matching-columns">
          <div>
            <h3>First</h3>
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
            <h3>Second</h3>
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
            <button type="button" className="lesson-reset-link" onClick={() => props.onMatchingReset(block.interaction.id)}>Clear</button>
          </div>
        )}
        {feedback(block.interaction.id)}
      </section>
    );
  }

  const prompt = block.prompt || family.title;
  return (
    <section className="lesson-step lesson-activity-step" data-kind={block.kind}>
      <StepMeta step={step} />
      <p className="lesson-family-label">{family.label}</p>
      <h2 tabIndex={-1}>{prompt}</h2>
      <div className="lesson-control-region lesson-free-text-control">
        <label htmlFor={`${block.interaction.id}-answer`}>Your response</label>
        <textarea
          id={`${block.interaction.id}-answer`}
          rows={4}
          value={props.answers[block.interaction.id] ?? ''}
          onChange={(event) => props.onAnswerChange(block.interaction.id, event.target.value)}
        />
        <small>Open response. Your work is saved, but Lexora does not claim an automatic grade.</small>
      </div>
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
  return (step.block.kind === 'choice' || step.block.kind === 'choice-grid') && !step.block.group;
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
  const progress = steps.length <= 1 ? 100 : (activeIndex / (steps.length - 1)) * 100;

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
      ? step.block.kind === 'free-text' ? 'Save response' : 'Check answer'
      : 'Continue';

  const stepLabel = step.kind === 'context'
    ? 'Read'
    : step.kind === 'activity' ? FAMILY_COPY[step.block.kind].label : 'Complete';

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
        <div className="lesson-progress" aria-label={`Lesson progress, step ${activeIndex + 1} of ${steps.length}`}>
          <div className="lesson-progress-copy">
            <span>{stepLabel}</span>
            <span>{activeIndex + 1} of {steps.length}</span>
          </div>
          <div
            className="lesson-progress-track"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={activeIndex + 1}
            aria-label={`Lesson step ${activeIndex + 1} of ${steps.length}`}
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
            <span>{activityStep && !props.canCheck ? 'Your answer is saved without an automatic grade.' : 'Progress is saved on this device.'}</span>
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
