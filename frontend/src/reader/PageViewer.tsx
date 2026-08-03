import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';
import type { ChoiceGroup, ChoiceTarget, ExerciseBlank, TextSpan } from './types';
import { bboxPercentageStyle, blankInputStyle, choiceHitStyle, choiceValueStyle } from './overlay';
import ChoiceSelector from './ChoiceSelector';
import {
  isProcessingStage,
  PROCESSING_MESSAGE_INTERVAL_MS,
  stageCopy,
  stageLabel,
  stageMessages,
  visibleIntersection,
} from './processing';
import type { PageProcessingStatus } from '../api/client';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function readPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;

  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return true;
  }
}

interface ProcessingDetailProps {
  messages: readonly string[];
  prefersReducedMotion: boolean;
}

function ProcessingDetail({ messages, prefersReducedMotion }: ProcessingDetailProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const firstMessage = messages[0] ?? '';

  useEffect(() => {
    setMessageIndex(0);
    if (prefersReducedMotion || messages.length < 2) return;

    const timer = window.setInterval(() => {
      setMessageIndex((currentIndex) => (currentIndex + 1) % messages.length);
    }, PROCESSING_MESSAGE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [messages, prefersReducedMotion]);

  const message = prefersReducedMotion
    ? firstMessage
    : messages[messageIndex] ?? firstMessage;

  return (
    <span className="page-processing-detail" aria-hidden="true">
      <span key={message} className="page-processing-detail-message">
        {message}
      </span>
    </span>
  );
}

export type LoaderVariant = 'halftone-page' | 'light-beam' | 'halftone-card';
export type CardStyle = 'card-minimal-light' | 'card-slate-mono' | 'card-lexora-cyan' | 'card-borderless-float';

interface Props {
  pdfData: ArrayBuffer;
  pageNumber: number;
  spans: TextSpan[];
  blanks: ExerciseBlank[];
  choices: ChoiceTarget[];
  choiceGroups: Record<string, ChoiceGroup>;
  answers: Record<string, string>;
  zoom: number;
  showBoxes: boolean;
  showBlankDetection: boolean;
  showChoiceDetection: boolean;
  selectedChoice: ChoiceTarget | null;
  processingStage: PageProcessingStatus | null;
  loaderVariant?: LoaderVariant;
  cardStyle?: CardStyle;
  onSpanClick: (span: TextSpan) => void;
  onBlankClick: (blank: ExerciseBlank) => void;
  onAnswerChange: (blankId: string, value: string) => void;
  onChoiceClick: (choice: ChoiceTarget) => void;
  onChoiceSelect: (choiceId: string, optionId: string) => void;
  onChoiceClose: () => void;
}

export default function PageViewer({
  pdfData,
  pageNumber,
  spans,
  blanks,
  choices,
  choiceGroups,
  answers,
  zoom,
  showBoxes,
  showBlankDetection,
  showChoiceDetection,
  selectedChoice,
  processingStage,
  loaderVariant = 'halftone-page',
  cardStyle = 'card-minimal-light',
  onSpanClick,
  onBlankClick,
  onAnswerChange,
  onChoiceClick,
  onChoiceSelect,
  onChoiceClose,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageStackRef = useRef<HTMLDivElement>(null);
  const processingContentRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(readPrefersReducedMotion);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let renderTask: RenderTask | null = null;
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsCanvasReady(false);

    const load = async () => {
      loadingTask = pdfjsLib.getDocument({ data: pdfData.slice(0) });
      const pdf = await loadingTask.promise;
      if (cancelled) return;
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: zoom });
      setViewportHeight(viewport.height);

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderTask = page.render({ canvas, canvasContext: ctx, viewport });
      await renderTask.promise;
      if (!cancelled) {
        setIsCanvasReady(true);
      }
    };

    void load().catch((error: unknown) => {
      if (!cancelled && (error as { name?: string }).name !== 'RenderingCancelledException') {
        console.error('PDF page rendering failed:', error);
      }
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
      void loadingTask?.destroy();
    };
  }, [pdfData, pageNumber, zoom]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    let mediaQuery: MediaQueryList;
    try {
      mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    } catch {
      return;
    }

    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);
    handleChange();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  const processing = isProcessingStage(processingStage);
  const processingCopy = stageCopy(processingStage);

  useLayoutEffect(() => {
    if (!processing) return;

    const pageStack = pageStackRef.current;
    const processingContent = processingContentRef.current;
    const pageArea = pageStack?.closest('.page-area') as HTMLElement | null;
    if (!pageStack || !processingContent || !pageArea) return;

    let frame = 0;

    const updatePosition = () => {
      frame = 0;

      const pageRect = pageStack.getBoundingClientRect();
      pageStack.style.setProperty(
        '--processing-scan-distance',
        `${Math.max(0, pageRect.height - 1)}px`,
      );
      const pageAreaRect = pageArea.getBoundingClientRect();
      const viewportRect = {
        left: pageAreaRect.left + pageArea.clientLeft,
        top: pageAreaRect.top + pageArea.clientTop,
        right: pageAreaRect.left + pageArea.clientLeft + pageArea.clientWidth,
        bottom: pageAreaRect.top + pageArea.clientTop + pageArea.clientHeight,
      };
      const intersection = visibleIntersection(pageRect, viewportRect);

      if (!intersection) return;

      processingContent.style.setProperty(
        '--processing-center-x',
        `${intersection.center.x - pageRect.left}px`,
      );
      processingContent.style.setProperty(
        '--processing-center-y',
        `${intersection.center.y - pageRect.top}px`,
      );
      processingContent.style.setProperty('--processing-visible-width', `${intersection.width}px`);
    };

    const schedulePositionUpdate = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(updatePosition);
    };

    updatePosition();
    pageArea.addEventListener('scroll', schedulePositionUpdate, { passive: true });
    window.addEventListener('resize', schedulePositionUpdate, { passive: true });

    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(schedulePositionUpdate)
      : null;
    resizeObserver?.observe(pageStack);
    resizeObserver?.observe(pageArea);

    return () => {
      pageArea.removeEventListener('scroll', schedulePositionUpdate);
      window.removeEventListener('resize', schedulePositionUpdate);
      resizeObserver?.disconnect();
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
    // viewportHeight updates after the async PDF canvas sizing. Re-running here
    // guarantees remeasurement even when ResizeObserver is unavailable; the
    // effect never sets state, so this dependency cannot create a loop.
  }, [pageNumber, processing, viewportHeight, zoom]);

  return (
    <div className={`page-container${!isCanvasReady ? ' page-container-loading' : ''}`}>
      <div
        ref={pageStackRef}
        className={`page-stack${processing ? ' page-stack-processing' : ''}`}
        aria-busy={processing}
      >
        <canvas ref={canvasRef} className="page-canvas" />
        <div className="page-overlay">
          {showBoxes &&
            spans.map((s) => (
              <div
                key={s.id}
                className="ocr-box"
                title={`${s.text} (${(s.confidence * 100).toFixed(0)}%)`}
                style={bboxPercentageStyle(s.bbox)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSpanClick(s);
                }}
              />
            ))}
          {blanks.map((blank) => (
            <input
              key={blank.id}
              className="blank-input"
              aria-label={`Answer blank near ${blank.nearbyTextSpanIds
                .map((id) => spans.find((span) => span.id === id)?.text)
                .filter(Boolean)
                .join(' ') || blank.id}`}
              value={answers[blank.id] ?? ''}
              style={blankInputStyle(blank, viewportHeight)}
              disabled={processing}
              onFocus={() => onBlankClick(blank)}
              onChange={(event) => onAnswerChange(blank.id, event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          ))}
          {showBlankDetection && blanks.map((blank) => (
            <div key={`debug-${blank.id}`} className="blank-debug-group">
              <div className="blank-line-debug" style={bboxPercentageStyle(blank.lineBbox)} />
              <div
                className="blank-interaction-debug"
                style={bboxPercentageStyle(blank.interactionBbox)}
              >
                <span>{blank.id} | {blank.candidateScore.toFixed(2)}</span>
              </div>
            </div>
          ))}
          {choices.map((choice) => {
            const group = choice.optionGroupId ? choiceGroups[choice.optionGroupId] : undefined;
            const selectedOptionId = answers[choice.id];
            const selectedLabel = group
              ?.options.find((option) => option.id === selectedOptionId)?.label;
            return (
              <Fragment key={choice.id}>
                <button
                  type="button"
                  className="choice-hit"
                  aria-label={`Answer target near ${choice.nearbyTextSpanIds
                    .map((id) => spans.find((span) => span.id === id)?.text)
                    .filter(Boolean)
                    .join(' ') || choice.id}`}
                  style={choiceHitStyle(choice)}
                  disabled={processing}
                  aria-expanded={selectedChoice?.id === choice.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    onChoiceClick(choice);
                  }}
                />
                {selectedLabel != null && (
                  <span
                    className="choice-value"
                    aria-hidden="true"
                    style={choiceValueStyle(choice, viewportHeight)}
                  >
                    {selectedLabel}
                  </span>
                )}
              </Fragment>
            );
          })}
          {selectedChoice && (() => {
            const group = selectedChoice.optionGroupId
              ? choiceGroups[selectedChoice.optionGroupId]
              : undefined;
            if (!group) return null;
            return (
              <ChoiceSelector
                group={group}
                target={selectedChoice}
                viewportHeight={viewportHeight}
                selectedOptionId={answers[selectedChoice.id] ?? null}
                onSelect={(optionId) => onChoiceSelect(selectedChoice.id, optionId)}
                onClose={onChoiceClose}
              />
            );
          })()}
          {showChoiceDetection && choices.map((choice) => (
            <div key={`debug-choice-${choice.id}`} className="choice-debug-group">
              <div className="choice-target-debug" style={bboxPercentageStyle(choice.targetBbox)} />
              <div
                className="choice-interaction-debug"
                style={bboxPercentageStyle(choice.interactionBbox)}
              >
                <span>
                  {choice.id} | {choice.candidateScore.toFixed(2)}
                  {choice.optionGroupId ? ` | ${choice.optionGroupId}` : ' | no group'}
                </span>
              </div>
            </div>
          ))}
        </div>
        {processing && processingCopy && (
          <div
            className={`page-processing variant-${loaderVariant}`}
            aria-hidden="true"
          >
            {loaderVariant === 'light-beam' ? (
              <div className="page-scan-beam" aria-hidden="true">
                <div className="page-scan-glow" />
                <div className="page-scan-line" />
              </div>
            ) : loaderVariant === 'halftone-page' ? (
              <div className="halftone-bg halftone-bg-full-page" aria-hidden="true">
                <div className="halftone-grid-base" />
                <div className="halftone-grid-wave" />
              </div>
            ) : null}

            <div
              ref={processingContentRef}
              className={`page-processing-content ${cardStyle} ${
                loaderVariant === 'halftone-card' ? 'halftone-navy-card' : ''
              }`}
            >
              {loaderVariant === 'halftone-card' && (
                <div className="halftone-bg" aria-hidden="true">
                  <div className="halftone-grid-base" />
                  <div className="halftone-grid-wave" />
                </div>
              )}
              <div className="page-processing-body">
                <div className="page-processing-status">
                  <span className="page-processing-title">{processingCopy.title}</span>
                </div>
                <ProcessingDetail
                  key={processingStage}
                  messages={stageMessages(processingStage)}
                  prefersReducedMotion={prefersReducedMotion}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {stageLabel(processingStage) ?? ''}
      </div>
    </div>
  );
}
