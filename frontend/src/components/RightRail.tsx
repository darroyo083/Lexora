import { useState } from 'react';
import { BookOpen, PenTool, Code } from 'lucide-react';
import type { ChoiceGrid, ChoiceTarget, ExerciseBlank, FreeTextInteraction, MatchingInteraction, SentenceOrderingInteraction, TextSpan } from '../reader/types';
import DebugPanel from '../reader/DebugPanel';
import SentenceOrderingPanel from '../reader/SentenceOrderingPanel';
import VerdictPill from './VerdictPill';
import CheckBar from './CheckBar';
import { CorrectionVerdict, AnswerResolutionStatus } from '../state/correction';
import type { AnswerKeyEntry } from '../api/correction';

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
  answerKeyEntries: AnswerKeyEntry[];
  onCheck: () => void;
  onRetry: (itemId: string) => void;
  onReveal: (itemId: string) => void;
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
  answerKeyEntries: _answerKeyEntries,
  onCheck,
  onRetry: _onRetry,
  onReveal: _onReveal,
}: Props) {
  const [activeTab, setActiveTab] = useState<'exercises' | 'dev'>('exercises');

  // Total detected exercise primitives
  const totalExercises = blanks.length + choices.length + grids.length + sentenceOrderings.length + matchings.length + freeTexts.length;

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
                      />
                    ) : (
                      <div className="floating-mode-note">
                        <span>Sentence ordering is currently floating on the page canvas.</span>
                        <button type="button" className="dock-btn" onClick={onFloat}>
                          Dock to Rail
                        </button>
                      </div>
                    )}
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
                        return (
                          <li key={blank.id} className="exercise-item-row">
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
                        return (
                          <li key={choice.id} className="exercise-item-row">
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
                    {matchings.map((matching) => {
                      const verdict = verdictByItem[matching.id];
                      const resolution = resolutionByItem[matching.id];
                      const revealed = correctionReveal[matching.id] === true;
                      const details = correctionDetails[matching.id];
                      return (
                        <div key={matching.id} className="exercise-item-row">
                          <p className="card-hint">Click anchors directly on the page to draw connection lines.</p>
                          <VerdictPill
                            verdict={verdict ?? null}
                            resolution={resolution ?? null}
                            revealed={revealed}
                            details={details}
                            interactionKind="matching"
                          />
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
                    {freeTexts.slice(0, 3).map((ft) => {
                      const verdict = verdictByItem[ft.id];
                      const revealed = correctionReveal[ft.id] === true;
                      return (
                        <div key={ft.id} className="exercise-item-row">
                          <span className="item-id">Response {ft.id}</span>
                          <VerdictPill
                            verdict={verdict ?? null}
                            resolution={null}
                            revealed={revealed}
                            interactionKind="free-text"
                          />
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
