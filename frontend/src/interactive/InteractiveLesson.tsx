import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Eye,
  Link2,
  ListChecks,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import type { MatchingSelection } from '../reader/matching';
import { parseMatchingAnswer } from '../reader/matching';
import { parseOrderedAnswer } from '../reader/ordering';
import type { AnswerResolutionStatus, CorrectionVerdict } from '../state/correction';
import type { LessonBlock, LessonProjection } from './lesson';

interface Props {
  projection: LessonProjection;
  pageNumber: number;
  pageCount: number;
  pageStage: string | null;
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
  onUseClassic: () => void;
  onAnswerChange: (itemId: string, value: string) => void;
  onChoiceSelect: (choiceId: string, optionId: string) => void;
  onGridSelect: (rowId: string, optionId: string) => void;
  onOrderingItemClick: (interactionId: string, itemId: string) => void;
  onMatchingItemClick: (interactionId: string, itemId: string, side: 'left' | 'right') => void;
  onMatchingUnpair: (interactionId: string, itemId: string) => void;
  onMatchingReset: (interactionId: string) => void;
  onCheck: () => void;
  onRetry: (itemId: string) => void;
  onReveal: (itemId: string) => void;
}

const VERDICT_LABEL: Partial<Record<CorrectionVerdict, string>> = {
  CORRECT: 'Correct',
  INCORRECT: 'Not quite',
  PARTIALLY_CORRECT: 'Partly correct',
  UNANSWERED: 'Not answered',
  NOT_AUTO_GRADABLE: 'Review your response',
};

const RESOLUTION_LABEL: Partial<Record<AnswerResolutionStatus, string>> = {
  UNMAPPED: 'No authoritative answer is mapped to this item.',
  AMBIGUOUS: 'The answer key is ambiguous, so Lexora will not grade this item.',
  MISSING: 'No model answer is available for this item.',
  EXTRACTION_UNCERTAIN: 'The source is uncertain, so Lexora will not grade this item.',
};

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
  if (!verdict && !neutral && !revealed) return null;
  const canReveal = Boolean(expected) && !revealed && verdict !== 'CORRECT';
  const canRetry = Boolean(verdict && verdict !== 'CORRECT' && verdict !== 'NOT_AUTO_GRADABLE');
  return (
    <div className="lesson-feedback" data-verdict={verdict?.toLowerCase() ?? 'neutral'} role="status">
      <div>
        <strong>{verdict ? VERDICT_LABEL[verdict] : 'Not graded'}</strong>
        {detail && <span> {detail.correctCount} of {detail.totalCount} correct.</span>}
        {neutral && <span> {neutral}</span>}
        {revealed && expected && <span className="lesson-expected"> Answer: {expected}</span>}
      </div>
      {(canRetry || canReveal) && (
        <div className="lesson-feedback-actions">
          {canRetry && (
            <button type="button" onClick={() => onRetry(itemId)}>
              <RotateCcw size={14} aria-hidden="true" /> Try again
            </button>
          )}
          {canReveal && (
            <button type="button" onClick={() => onReveal(itemId)}>
              <Eye size={14} aria-hidden="true" /> Reveal
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BlockHeading({ block, index }: { block: LessonBlock; index: number }) {
  if (block.kind === 'context') return null;
  return (
    <header className="lesson-block-heading">
      <span className="lesson-task-number">{String(index + 1).padStart(2, '0')}</span>
      <div>
        <span className="lesson-task-kind">
          {block.kind.replaceAll('-', ' ')}
        </span>
        {block.prompt && <h2>{block.prompt}</h2>}
      </div>
    </header>
  );
}

function LessonBlockView({ block, index, props }: {
  block: LessonBlock;
  index: number;
  props: Props;
}) {
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

  if (block.kind === 'context') {
    return (
      <article className="lesson-context" data-variant={block.variant}>
        <div className="lesson-context-label">
          {block.variant === 'example' ? <Sparkles size={16} /> : <BookOpen size={16} />}
          {block.variant}
        </div>
        {block.paragraphs.map((paragraph) => <p key={paragraph.id}>{paragraph.text}</p>)}
      </article>
    );
  }

  return (
    <section className="lesson-exercise" data-kind={block.kind} aria-labelledby={`${block.id}-heading`}>
      <div id={`${block.id}-heading`}><BlockHeading block={block} index={index} /></div>

      {block.kind === 'fill-blank' && (
        <div className="lesson-field-stack">
          {block.blanks.map((blank, blankIndex) => (
            <label className="lesson-field" key={blank.id}>
              <span>Answer {blankIndex + 1}</span>
              <input
                value={props.answers[blank.id] ?? ''}
                onChange={(event) => props.onAnswerChange(blank.id, event.target.value)}
                aria-describedby={`${blank.id}-source`}
                autoComplete="off"
              />
              <small id={`${blank.id}-source`}>From source line {blankIndex + 1}</small>
              {feedback(blank.id)}
            </label>
          ))}
        </div>
      )}

      {block.kind === 'choice' && (
        <div className="lesson-field-stack">
          {block.targets.map((target, targetIndex) => (
            <fieldset className="lesson-choice-set" key={target.id}>
              <legend>Choice {targetIndex + 1}</legend>
              {block.group ? (
                <div className="lesson-option-row">
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
                </div>
              ) : <p className="lesson-neutral-note">Options could not be resolved reliably. Use Classic mode for the source layout.</p>}
              {feedback(target.id)}
            </fieldset>
          ))}
        </div>
      )}

      {block.kind === 'choice-grid' && (
        <div className="lesson-grid-wrap">
          {block.group ? (
            <table className="lesson-choice-grid">
              <thead><tr><th scope="col">Item</th>{block.group.options.map((option) => <th scope="col" key={option.id}>{option.label}</th>)}</tr></thead>
              <tbody>
                {block.grid.rows.map((row, rowIndex) => (
                  <tr key={row.id}>
                    <th scope="row">Statement {rowIndex + 1}</th>
                    {block.group?.options.map((option) => (
                      <td key={option.id}>
                        <label className="lesson-grid-option">
                          <input
                            type="radio"
                            name={row.id}
                            checked={props.answers[row.id] === option.id}
                            onChange={() => props.onGridSelect(row.id, option.id)}
                          />
                          <span className="sr-only">Statement {rowIndex + 1}: {option.label}</span>
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="lesson-neutral-note">This grid has no reliable option set. Open Classic mode to complete it from the page.</p>}
          {feedback(block.grid.id)}
        </div>
      )}

      {block.kind === 'sentence-ordering' && (
        <div className="lesson-ordering-stack">
          {block.interactions.map((ordering, orderingIndex) => {
            const selected = parseOrderedAnswer(props.answers[ordering.id]);
            const itemById = new Map(ordering.items.map((item) => [item.id, item]));
            return (
              <div className="lesson-ordering" key={ordering.id}>
                <div className="lesson-ordering-result" aria-live="polite">
                  <ListChecks size={16} aria-hidden="true" />
                  {selected.length > 0 ? selected.map((id) => itemById.get(id)?.text ?? id).join(' ') : `Sentence ${orderingIndex + 1}: choose words in order`}
                </div>
                <div className="lesson-token-row">
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
                        {position >= 0 && <span>{position + 1}</span>}{item.text}
                      </button>
                    );
                  })}
                </div>
                {feedback(ordering.id)}
              </div>
            );
          })}
        </div>
      )}

      {block.kind === 'matching' && (() => {
        const pairs = parseMatchingAnswer(props.answers[block.interaction.id]);
        const pairedRightIds = new Set(Object.values(pairs));
        const selected = props.matchingSelection?.interactionId === block.interaction.id
          ? props.matchingSelection
          : null;
        return (
          <div className="lesson-matching">
            <p className="lesson-matching-help"><Link2 size={15} aria-hidden="true" /> Select one item from each column to create a pair.</p>
            <div className="lesson-matching-columns">
              <div>
                <h3>Left</h3>
                {block.interaction.leftItems.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="lesson-match-item"
                    data-selected={selected?.itemId === item.id}
                    data-paired={Boolean(pairs[item.id])}
                    onClick={() => props.onMatchingItemClick(block.interaction.id, item.id, 'left')}
                  >{item.label}. {item.text}</button>
                ))}
              </div>
              <div>
                <h3>Right</h3>
                {block.interaction.rightItems.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="lesson-match-item"
                    data-selected={selected?.itemId === item.id}
                    data-paired={pairedRightIds.has(item.id)}
                    onClick={() => props.onMatchingItemClick(block.interaction.id, item.id, 'right')}
                  >{item.label}. {item.text}</button>
                ))}
              </div>
            </div>
            {Object.keys(pairs).length > 0 && (
              <div className="lesson-pairs">
                {Object.entries(pairs).map(([leftId, rightId]) => (
                  <button type="button" key={leftId} onClick={() => props.onMatchingUnpair(block.interaction.id, leftId)}>
                    {block.interaction.leftItems.find((item) => item.id === leftId)?.label ?? leftId}
                    <span>↔</span>
                    {block.interaction.rightItems.find((item) => item.id === rightId)?.label ?? rightId}
                    <span className="sr-only">Remove pair</span>
                  </button>
                ))}
                <button type="button" className="lesson-reset-link" onClick={() => props.onMatchingReset(block.interaction.id)}>Clear pairs</button>
              </div>
            )}
            {feedback(block.interaction.id)}
          </div>
        );
      })()}

      {block.kind === 'free-text' && (
        <label className="lesson-field lesson-free-text">
          <span>Your response</span>
          <textarea
            rows={Math.max(4, Math.min(8, block.interaction.responseLines.length + 2))}
            value={props.answers[block.interaction.id] ?? ''}
            onChange={(event) => props.onAnswerChange(block.interaction.id, event.target.value)}
          />
          <small>Open response. Lexora preserves your work but does not auto-grade it.</small>
          {feedback(block.interaction.id)}
        </label>
      )}
    </section>
  );
}

function PageNavigation({ pageNumber, pageCount, onSelectPage }: Pick<Props, 'pageNumber' | 'pageCount' | 'onSelectPage'>) {
  return (
    <nav className="lesson-page-nav" aria-label="Lesson pages">
      <button type="button" disabled={pageNumber <= 1} onClick={() => onSelectPage(pageNumber - 1)}>
        <ArrowLeft size={16} aria-hidden="true" /> Previous
      </button>
      <span><strong>{pageNumber}</strong> / {pageCount}</span>
      <button type="button" disabled={pageNumber >= pageCount} onClick={() => onSelectPage(pageNumber + 1)}>
        Next <ArrowRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}

export default function InteractiveLesson(props: Props) {
  if (props.projection.status === 'UNAVAILABLE') {
    const waiting = props.pageStage === 'PROCESSING' || props.pageStage === 'QUEUED';
    return (
      <div className="interactive-lesson interactive-unavailable">
        <div className="lesson-state-mark"><BookOpen size={28} aria-hidden="true" /></div>
        <p className="lesson-eyebrow">Interactive mode</p>
        <h1>{waiting ? 'Building this lesson' : 'This page is not interactive yet'}</h1>
        <p>{waiting
          ? 'Lexora is reading the source page. You can keep using Classic mode while processing finishes.'
          : 'Interactive mode only appears when the source analysis is complete and trustworthy.'}</p>
        <div className="lesson-state-actions">
          <button type="button" className="lesson-primary-action" onClick={props.onUseClassic}>Open Classic mode</button>
          {!waiting && <button type="button" onClick={props.onProcessPage}>Process this page</button>}
        </div>
        <PageNavigation {...props} />
      </div>
    );
  }

  const { lesson } = props.projection;
  let taskIndex = 0;
  return (
    <div className="interactive-lesson">
      <header className="lesson-hero">
        <div>
          <p className="lesson-eyebrow">
            {lesson.unitNumber ? `Unit ${lesson.unitNumber}` : 'Workbook lesson'}
            <span>Page {lesson.source.pageNumber}</span>
          </p>
          <h1>{lesson.title}</h1>
          <p>{lesson.interactionCount} interactive items, rebuilt from the source page.</p>
        </div>
        <div className="lesson-source-badge" title={`Processor: ${lesson.source.processorEngine}; schema: ${lesson.source.schemaVersion}`}>
          <Check size={15} aria-hidden="true" /> Source linked
        </div>
      </header>

      <PageNavigation {...props} />

      <div className="lesson-content">
        {lesson.sections.flatMap((section) => section.blocks).map((block) => {
          const index = block.kind === 'context' ? taskIndex : taskIndex++;
          return <LessonBlockView key={block.id} block={block} index={index} props={props} />;
        })}
      </div>

      <footer className="lesson-completion-bar">
        <div>
          <strong>Ready to check your work?</strong>
          <span>{props.canCheck ? 'Only authoritative answers will be graded.' : 'No answer key is available for this workbook.'}</span>
        </div>
        <button type="button" className="lesson-primary-action" disabled={!props.canCheck} onClick={props.onCheck}>
          <Check size={16} aria-hidden="true" /> Check answers
        </button>
      </footer>

      <PageNavigation {...props} />
    </div>
  );
}
