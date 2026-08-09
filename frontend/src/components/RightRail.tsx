import { useState } from 'react';
import { BookOpen, PenTool, Code } from 'lucide-react';
import type { ChoiceGrid, ChoiceGroup, ChoiceTarget, ExerciseBlank, FreeTextInteraction, MatchingInteraction, SentenceOrderingInteraction, TextSpan } from '../reader/types';
import DebugPanel from '../reader/DebugPanel';
import SentenceOrderingPanel from '../reader/SentenceOrderingPanel';
import VerdictPill from './VerdictPill';
import CheckBar from './CheckBar';
import RevealBlock from './RevealBlock';
import { CorrectionVerdict, AnswerResolutionStatus } from '../state/correction';
import type { AnswerKeyEntry, CorrectionSlot } from '../api/correction';
import { parseMatchingAnswer } from '../reader/matching';
import { parseOrderedAnswer } from '../reader/ordering';

interface Props {
  devMode: boolean;
  spans: TextSpan[];
  blanks: ExerciseBlank[];
  choices: ChoiceTarget[];
  grids: ChoiceGrid[];
  sentenceOrderings: SentenceOrderingInteraction[];
  matchings: MatchingInteraction[];
  freeTexts: FreeTextInteraction[];
  answers: Record<string, string>;
  choiceGroups: Record<string, ChoiceGroup>;
  expectedSequencesByItem: Record<string, string[]>;
  selectedSpan: TextSpan | null;
  selectedBlank: ExerciseBlank | null;
  selectedChoice: ChoiceTarget | null;
  orderingActivePrompt: string | null;
  orderingPanelCollapsed: boolean;
  processing: boolean;
  orderingMode: 'docked' | 'floating';
  onPromptChange: (interactionId: string) => void;
  onOrderingChange: (interactionId: string, ordered: string[]) => void;
  onCollapseChange: (collapsed: boolean) => void;
  onFloat: () => void;
  // Dev Mode Debug Toggles
  showBoxes: boolean;
  setShowBoxes: (val: boolean) => void;
  showBlankDetection: boolean;
  setShowBlankDetection: (val: boolean) => void;
  showChoiceDetection: boolean;
  setShowChoiceDetection: (val: boolean) => void;
  showGridDetection: boolean;
  setShowGridDetection: (val: boolean) => void;
  showSentenceOrderingDetection: boolean;
  setShowSentenceOrderingDetection: (val: boolean) => void;
  showMatchingDetection: boolean;
  setShowMatchingDetection: (val: boolean) => void;
  showFreeTextDetection: boolean;
  setShowFreeTextDetection: (val: boolean) => void;
  onBlankClick: (blank: ExerciseBlank) => void;
  onChoiceClick: (choice: ChoiceTarget) => void;
  verdictByItem: Record<string, CorrectionVerdict | undefined>;
  resolutionByItem: Record<string, AnswerResolutionStatus>;
  correctionDetails: Record<string, { correctCount: number; totalCount: number }>;
  correctionReveal: Record<string, boolean>;
  correctionUiState: string;
  hasAnswerKey: boolean;
  correctionSlots: CorrectionSlot[];
  onCheck: () => void;
  onRetry: (itemId: string) => void;
  onReveal: (itemId: string) => void;
}

function slotEntry(
  slots: CorrectionSlot[],
  interactionKind: string,
  index: number,
): AnswerKeyEntry | undefined {
  const slot = slots.find(
    (s) => s.interactionKind === interactionKind && s.ordinal === index,
  );
  return slot?.resolution === 'RESOLVED' ? (slot.entry ?? undefined) : undefined;
}

function optionLabel(optionId: string, choiceGroups: Record<string, ChoiceGroup>): string {
  for (const group of Object.values(choiceGroups)) {
    const option = group.options.find((o) => o.id === optionId);
    if (option) return option.label;
  }
  return optionId;
}

function formatMatchingPairs(
  interaction: MatchingInteraction,
  pairs: ReturnType<typeof parseMatchingAnswer>,
): string {
  const leftLabel = (id: string) =>
    interaction.leftItems.find((item) => item.id === id)?.label ?? id;
  const rightLabel = (id: string) =>
    interaction.rightItems.find((item) => item.id === id)?.label ?? id;
  return Object.entries(pairs)
    .map(([leftId, rightId]) => `${leftLabel(leftId)} ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ ${rightLabel(rightId)}`)
    .join(', ');
}

function orderingLabel(interaction: SentenceOrderingInteraction, sequence: string[]): string {
  return sequence
    .map((id) => interaction.items.find((item) => item.id === id)?.text ?? id)
    .join(' ');
}

export default function RightRail({
  devMode,
  spans: _spans,
  blanks,
  choices,
  grids,
  sentenceOrderings,
  matchings,
  freeTexts,
  answers,
  choiceGroups,
  expectedSequencesByItem,
  selectedSpan,
  selectedBlank,
  selectedChoice,
  orderingActivePrompt,
  orderingPanelCollapsed,
  processing,
  orderingMode,
  onPromptChange,
  onOrderingChange,
  onCollapseChange,
  onFloat,
  showBoxes,
  setShowBoxes,
  showBlankDetection,
  setShowBlankDetection,
  showChoiceDetection,
  setShowChoiceDetection,
  showGridDetection,
  setShowGridDetection,
  showSentenceOrderingDetection,
  setShowSentenceOrderingDetection,
  showMatchingDetection,
  setShowMatchingDetection,
  showFreeTextDetection,
  setShowFreeTextDetection,
  onBlankClick,
  onChoiceClick,
  verdictByItem,
  resolutionByItem,
  correctionDetails,
  correctionReveal,
  correctionUiState,
  hasAnswerKey,
  correctionSlots,
  onCheck,
  onRetry,
  onReveal,
}: Props) {
  const [activeTab, setActiveTab] = useState<'exercises' | 'dev'>('exercises');

  // Total detected exercise primitives
  const totalExercises = blanks.length + choices.length + grids.length + sentenceOrderings.length + matchings.length + freeTexts.length;

  const anyRevealed = Object.values(correctionReveal).some(Boolean);

  const activeOrdering = sentenceOrderings.find((i) => i.id === orderingActivePrompt)
    ?? sentenceOrderings[0];

  return (
    <aside className="right-rail" aria-label="Contextual Study Panel">
      <div className="rail-header" role="tablist" aria-label="Right rail tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'exercises'}
          className={`rail-tab ${activeTab === 'exercises' ? 'active' : ''}`}
          onClick={() => setActiveTab('exercises')}
        >
          <PenTool size={15} />
          <span>Exercises</span>
          {totalExercises > 0 && <span className="tab-count">{totalExercises}</span>}
        </button>

        {devMode && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'dev'}
            className={`rail-tab dev-tab ${activeTab === 'dev' ? 'active' : ''}`}
            onClick={() => setActiveTab('dev')}
          >
            <Code size={15} />
            <span>Dev Inspector</span>
          </button>
        )}
      </div>

      <div className="rail-content">
        {activeTab === 'exercises' && (
          <div className="exercises-view">
            {totalExercises === 0 ? (
              <div className="empty-rail-state">
                <div className="empty-icon">
                  <BookOpen size={28} strokeWidth={1.75} />
                </div>
                <h3>No exercises detected</h3>
                <p>Run analysis or upload a page with exercise blanks to begin interactive practice.</p>
              </div>
            ) : (
              <div className="exercise-list">
                {/* SentenceOrdering Workspace */}
                {sentenceOrderings.length > 0 && (
                  <div className="exercise-card ordering-card">
                    <div className="card-header">
                      <span className="exercise-type-badge">Sentence Ordering</span>
                      <span className="card-count">{sentenceOrderings.length} items</span>
                    </div>

                    {orderingMode === 'docked' ? (
                      <SentenceOrderingPanel
                        sentenceOrderings={sentenceOrderings}
                        orderingAnswers={answers}
                        activePromptId={orderingActivePrompt}
                        disabled={processing}
                        collapsed={orderingPanelCollapsed}
                        onPromptChange={onPromptChange}
                        onOrderingChange={onOrderingChange}
                        onCollapseChange={onCollapseChange}
                        onFloat={onFloat}
                        verdictByItem={verdictByItem}
                        expectedSequencesByItem={expectedSequencesByItem}
                      />
                    ) : (
                      <div className="floating-mode-note">
                        <span>Sentence ordering is currently floating on the page canvas.</span>
                        <button type="button" className="dock-btn" onClick={onFloat}>
                          Dock to Rail
                        </button>
                      </div>
                    )}

                    {activeOrdering && (() => {
                      const orderingIndex = sentenceOrderings.findIndex((i) => i.id === activeOrdering.id);
                      const entry = slotEntry(correctionSlots, 'sentence-ordering', orderingIndex);
                      const verdict = verdictByItem[activeOrdering.id];
                      const resolution = resolutionByItem[activeOrdering.id];
                      const revealed = correctionReveal[activeOrdering.id] === true;
                      const expectedSequence = expectedSequencesByItem[activeOrdering.id];
                      if (!entry && !verdict) return null;
                      return (
                        <div className="exercise-item-cell ordering-feedback">
                          <div className="exercise-item-row">
                            <span className="item-id">Satz {orderingIndex + 1}</span>
                            <VerdictPill
                              verdict={verdict ?? null}
                              resolution={resolution ?? null}
                              revealed={revealed}
                              details={correctionDetails[activeOrdering.id]}
                              interactionKind="sentence-ordering"
                            />
                          </div>
                          {entry && expectedSequence && (
                            <RevealBlock
                              itemId={activeOrdering.id}
                              revealed={revealed}
                              learnerLabel={orderingLabel(activeOrdering, parseOrderedAnswer(answers[activeOrdering.id])) || '(empty)'}
                              expectedLabel={orderingLabel(activeOrdering, expectedSequence) || '(empty)'}
                              onReveal={onReveal}
                              onRetry={onRetry}
                            />
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* FillBlank Summary */}
                {blanks.length > 0 && (
                  <div className="exercise-card">
                    <div className="card-header">
                      <span className="exercise-type-badge">Fill in the Blanks</span>
                      <span className="card-count">{blanks.length} blanks</span>
                    </div>
                    <ul className="exercise-items-list">
                      {blanks.slice(0, 8).map((blank, idx) => {
                        const filled = Boolean(answers[blank.id]);
                        const verdict = verdictByItem[blank.id];
                        const resolution = resolutionByItem[blank.id];
                        const revealed = correctionReveal[blank.id] === true;
                        const entry = slotEntry(correctionSlots, 'fill-in-line', idx);
                        return (
                          <li key={blank.id} className="exercise-item-cell">
                            <div className="exercise-item-row">
                              <button
                                type="button"
                                className="exercise-item-btn"
                                onClick={() => onBlankClick(blank)}
                              >
                                <span className="item-num">{idx + 1}.</span>
                                <span className="item-id">Blank {blank.id}</span>
                                <span className={`item-status ${filled ? 'filled' : 'empty'}`}>
                                  {filled ? 'Filled' : 'Empty'}
                                </span>
                              </button>
                              <VerdictPill
                                verdict={verdict ?? null}
                                resolution={resolution ?? null}
                                revealed={revealed}
                              />
                            </div>
                            {entry && resolution !== AnswerResolutionStatus.AMBIGUOUS && (
                              <RevealBlock
                                itemId={blank.id}
                                revealed={revealed}
                                learnerLabel={answers[blank.id] ?? ''}
                                expectedLabel={entry.expectedValue}
                                acceptedAlternatives={entry.alternatives}
                                onReveal={onReveal}
                                onRetry={onRetry}
                              />
                            )}
                          </li>
                        );
                      })}
                      {blanks.length > 8 && (
                        <li className="more-items-note">+ {blanks.length - 8} more blanks on page</li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Choice / Grid Summary */}
                {(choices.length > 0 || grids.length > 0) && (
                  <div className="exercise-card">
                    <div className="card-header">
                      <span className="exercise-type-badge">Multiple Choice</span>
                      <span className="card-count">{choices.length + grids.length} questions</span>
                    </div>
                    <ul className="exercise-items-list">
                      {choices.slice(0, 5).map((choice, idx) => {
                        const selected = Boolean(answers[choice.id]);
                        const verdict = verdictByItem[choice.id];
                        const resolution = resolutionByItem[choice.id];
                        const revealed = correctionReveal[choice.id] === true;
                        const entry = slotEntry(correctionSlots, 'choice', idx);
                        const selectedLabel = answers[choice.id]
                          ? optionLabel(answers[choice.id], choiceGroups)
                          : '';
                        return (
                          <li key={choice.id} className="exercise-item-cell">
                            <div className="exercise-item-row">
                              <button
                                type="button"
                                className="exercise-item-btn"
                                onClick={() => onChoiceClick(choice)}
                              >
                                <span className="item-num">{idx + 1}.</span>
                                <span className="item-id">Option {choice.id}</span>
                                <span className={`item-status ${selected ? 'filled' : 'empty'}`}>
                                  {selected ? 'Selected' : 'Unselected'}
                                </span>
                              </button>
                              <VerdictPill
                                verdict={verdict ?? null}
                                resolution={resolution ?? null}
                                revealed={revealed}
                              />
                            </div>
                            {entry && resolution !== AnswerResolutionStatus.AMBIGUOUS && (
                              <RevealBlock
                                itemId={choice.id}
                                revealed={revealed}
                                learnerLabel={selectedLabel || '(empty)'}
                                expectedLabel={entry.expectedValue}
                                acceptedAlternatives={entry.alternatives}
                                onReveal={onReveal}
                                onRetry={onRetry}
                              />
                            )}
                          </li>
                        );
                      })}
                      {grids.map((grid, idx) => {
                        const verdict = verdictByItem[grid.id];
                        const resolution = resolutionByItem[grid.id];
                        const revealed = correctionReveal[grid.id] === true;
                        const entry = slotEntry(correctionSlots, 'choice-grid', idx);
                        const learnerLabels = grid.rows
                          .map((row) => answers[row.id] ? optionLabel(answers[row.id], choiceGroups) : null)
                          .filter((label): label is string => Boolean(label))
                          .join(', ');
                        return (
                          <li key={grid.id} className="exercise-item-cell">
                            <div className="exercise-item-row">
                              <span className="item-id">Grid {grid.id}</span>
                              <VerdictPill
                                verdict={verdict ?? null}
                                resolution={resolution ?? null}
                                revealed={revealed}
                                details={correctionDetails[grid.id]}
                                interactionKind="choice-grid"
                              />
                            </div>
                            {entry && resolution !== AnswerResolutionStatus.AMBIGUOUS && (
                              <RevealBlock
                                itemId={grid.id}
                                revealed={revealed}
                                learnerLabel={learnerLabels || '(empty)'}
                                expectedLabel={entry.expectedValue}
                                acceptedAlternatives={entry.alternatives}
                                onReveal={onReveal}
                                onRetry={onRetry}
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Matching Summary */}
                {matchings.length > 0 && (
                  <div className="exercise-card">
                    <div className="card-header">
                      <span className="exercise-type-badge">Matching</span>
                      <span className="card-count">{matchings.length} pairing exercises</span>
                    </div>
                    {matchings.map((matching, idx) => {
                      const verdict = verdictByItem[matching.id];
                      const resolution = resolutionByItem[matching.id];
                      const revealed = correctionReveal[matching.id] === true;
                      const details = correctionDetails[matching.id];
                      const entry = slotEntry(correctionSlots, 'matching', idx);
                      const pairs = parseMatchingAnswer(answers[matching.id]);
                      return (
                        <div key={matching.id} className="exercise-item-cell">
                          <div className="exercise-item-row">
                            <p className="card-hint">Click anchors directly on the page to draw connection lines.</p>
                            <VerdictPill
                              verdict={verdict ?? null}
                              resolution={resolution ?? null}
                              revealed={revealed}
                              details={details}
                              interactionKind="matching"
                            />
                          </div>
                          {entry && resolution !== AnswerResolutionStatus.AMBIGUOUS && (
                            <RevealBlock
                              itemId={matching.id}
                              revealed={revealed}
                              learnerLabel={formatMatchingPairs(matching, pairs) || '(empty)'}
                              expectedLabel={entry.expectedValue}
                              onReveal={onReveal}
                              onRetry={onRetry}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* FreeText Summary */}
                {freeTexts.length > 0 && (
                  <div className="exercise-card">
                    <div className="card-header">
                      <span className="exercise-type-badge">Free Writing</span>
                      <span className="card-count">{freeTexts.length} response areas</span>
                    </div>
                    <p className="card-hint">Write directly onto the printed lines on the page.</p>
                    {freeTexts.slice(0, 3).map((ft, idx) => {
                      const verdict = verdictByItem[ft.id];
                      const revealed = correctionReveal[ft.id] === true;
                      const entry = slotEntry(correctionSlots, 'free-text', idx);
                      const hasReference = entry?.typedPayload?.kind === 'reference';
                      const referenceText = hasReference && entry?.typedPayload?.kind === 'reference'
                        ? entry.typedPayload.modelText
                        : undefined;
                      return (
                        <div key={ft.id} className="exercise-item-cell">
                          <div className="exercise-item-row">
                            <span className="item-id">Response {ft.id}</span>
                            <VerdictPill
                              verdict={verdict ?? null}
                              resolution={null}
                              revealed={revealed}
                              interactionKind="free-text"
                            />
                          </div>
                          {entry && (
                            <RevealBlock
                              itemId={ft.id}
                              revealed={revealed}
                              learnerLabel=""
                              expectedLabel=""
                              hasReference={hasReference}
                              referenceText={referenceText}
                              isFreeText
                              onReveal={onReveal}
                              onRetry={onRetry}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <CheckBar
              totalGradable={
                Object.values(verdictByItem).filter(
                  (v) => v !== undefined && v !== CorrectionVerdict.NOT_AUTO_GRADABLE,
                ).length
              }
              totalCorrect={
                Object.values(verdictByItem).filter(
                  (v) => v !== undefined && v === CorrectionVerdict.CORRECT,
                ).length
              }
              uiState={correctionUiState}
              hasAnswerKey={hasAnswerKey}
              anyRevealed={anyRevealed}
              onCheck={onCheck}
            />
          </div>
        )}

        {devMode && activeTab === 'dev' && (
          <div className="dev-view">
            <div className="dev-section">
              <h4>Detection Overlays</h4>
              <div className="dev-toggles">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={showBoxes}
                    onChange={(event) => setShowBoxes(event.target.checked)}
                  />
                  Show OCR boxes
                </label>

                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={showBlankDetection}
                    onChange={(event) => setShowBlankDetection(event.target.checked)}
                  />
                  Show blank detection
                </label>

                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={showChoiceDetection}
                    onChange={(event) => setShowChoiceDetection(event.target.checked)}
                  />
                  Show choice detection
                </label>

                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={showGridDetection}
                    onChange={(event) => setShowGridDetection(event.target.checked)}
                  />
                  Show grid detection
                </label>

                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={showSentenceOrderingDetection}
                    onChange={(event) => setShowSentenceOrderingDetection(event.target.checked)}
                  />
                  Show ordering detection
                </label>

                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={showMatchingDetection}
                    onChange={(event) => setShowMatchingDetection(event.target.checked)}
                  />
                  Show matching detection
                </label>

                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={showFreeTextDetection}
                    onChange={(event) => setShowFreeTextDetection(event.target.checked)}
                  />
                  Show free-text detection
                </label>
              </div>
            </div>

            <div className="dev-section">
              <h4>Element Telemetry</h4>
              <DebugPanel
                span={selectedSpan}
                blank={selectedBlank}
                choice={selectedChoice}
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
