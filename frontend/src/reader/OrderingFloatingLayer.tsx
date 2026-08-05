import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SentenceOrderingInteraction } from './types';
import { groupSentenceOrderings } from './overlay';
import { parseOrderedAnswer } from './ordering';
import {
  BUBBLE_DEFAULT_HEIGHT,
  BUBBLE_DEFAULT_WIDTH,
  bubbleDragReducer,
  defaultBubblePosition,
  exerciseProgress,
  pageBBoxForExercise,
  type BubbleDragSession,
  type DragContext,
  type Point,
} from './floatingOrdering';
import type { PageRotation } from './rotation';
import OrderingControls from './OrderingControls';

interface BubbleProps {
  interactions: SentenceOrderingInteraction[];
  answers: Record<string, string>;
  activePromptId: string | null;
  expanded: boolean;
  closed: boolean;
  disabled: boolean;
  position: Point;
  getContext: () => DragContext | null;
  onExpand: () => void;
  onCollapse: () => void;
  onClose: () => void;
  onDock: () => void;
  onDragMove: (position: Point) => void;
  onPromptChange: (interactionId: string) => void;
  onOrderingChange: (interactionId: string, ordered: string[]) => void;
}

function measureDragContext(layer: HTMLElement): DragContext | null {
  const container = layer.closest('.page-area') as HTMLElement | null;
  if (!container) return null;
  const layerRect = layer.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return {
    pageOrigin: {
      x: layerRect.left - containerRect.left + container.scrollLeft,
      y: layerRect.top - containerRect.top + container.scrollTop,
    },
    visible: {
      left: container.scrollLeft,
      top: container.scrollTop,
      width: container.clientWidth,
      height: container.clientHeight,
    },
  };
}

function OrderingFloatingBubble({
  interactions,
  answers,
  activePromptId,
  expanded,
  closed,
  disabled,
  position,
  getContext,
  onExpand,
  onCollapse,
  onClose,
  onDock,
  onDragMove,
  onPromptChange,
  onOrderingChange,
}: BubbleProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragSession, setDragSession] = useState<BubbleDragSession | null>(null);
  const suppressClickRef = useRef(false);

  if (closed) return null;

  const progress = exerciseProgress(interactions, answers);
  const label = `Ordering ${progress.ordered}/${progress.total}`;

  /**
   * Pointer handlers live on the bubble root and serve BOTH forms. Collapsed
   * bubbles drag from anywhere on their surface; expanded bubbles only drag
   * from the grip header, so the inner buttons stay clickable. The shared
   * bubbleDragReducer distinguishes a click from a drag by a small movement
   * threshold: clicks expand, drags move the bubble and never expand it.
   */
  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || disabled) return;
    if (expanded && !(event.target as HTMLElement).closest('.ordering-bubble-grip')) {
      return;
    }
    const root = rootRef.current;
    const context = getContext();
    if (!root || !context) return;
    suppressClickRef.current = false;
    const rect = root.getBoundingClientRect();
    const next = bubbleDragReducer(null, {
      type: 'pointerdown',
      client: { x: event.clientX, y: event.clientY },
      position,
      size: { width: rect.width, height: rect.height },
      context,
    });
    setDragSession(next.state);
    root.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragSession) return;
    const next = bubbleDragReducer(dragSession, {
      type: 'pointermove',
      client: { x: event.clientX, y: event.clientY },
    });
    setDragSession(next.state);
    if (next.event.type === 'drag') {
      onDragMove(next.event.position);
    }
  };

  const handlePointerEnd = () => {
    if (!dragSession) return;
    const next = bubbleDragReducer(dragSession, { type: 'pointerup' });
    setDragSession(next.state);
    if (next.event.type === 'click') {
      if (!expanded) onExpand();
    } else if (next.event.type === 'drag-end') {
      suppressClickRef.current = true;
    }
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!expanded) onExpand();
  };

  const pointerHandlers = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerEnd,
    onPointerCancel: handlePointerEnd,
  };

  if (!expanded) {
    return (
      <div
        ref={rootRef}
        className="ordering-bubble ordering-bubble-collapsed"
        style={{ left: position.x, top: position.y }}
        {...pointerHandlers}
        onClick={handleClick}
      >
        <button
          type="button"
          className="ordering-bubble-expand"
          aria-label={`${label} — expand ordering exercise`}
          disabled={disabled}
          onClick={handleClick}
        >
          <span className="ordering-bubble-progress">{label}</span>
          <span aria-hidden="true">▸</span>
        </button>
      </div>
    );
  }

  const active = interactions.find((i) => i.id === activePromptId) ?? interactions[0];
  const siblings = interactions;
  const promptIndex = siblings.findIndex((i) => i.id === active.id) + 1;
  const ordered = parseOrderedAnswer(answers[active.id]);

  return (
    <div
      ref={rootRef}
      className="ordering-bubble ordering-bubble-expanded"
      style={{ left: position.x, top: position.y }}
      {...pointerHandlers}
    >
      <div className="ordering-bubble-head">
        <div
          className="ordering-bubble-grip"
          title="Drag to move"
        >
          <span className="ordering-bubble-grip-dots" aria-hidden="true">⠿</span>
          <span className="ordering-bubble-title">{label}</span>
        </div>
        <button
          type="button"
          className="ordering-bubble-action"
          aria-label="Minimize ordering bubble"
          title="Minimize"
          disabled={disabled}
          onClick={onCollapse}
        >
          ▾
        </button>
        <button
          type="button"
          className="ordering-bubble-action"
          aria-label="Dock ordering to side panel"
          title="Dock to side panel"
          disabled={disabled}
          onClick={onDock}
        >
          Dock
        </button>
        <button
          type="button"
          className="ordering-bubble-action"
          aria-label="Close ordering bubble"
          title="Close (click a printed fragment to reopen)"
          disabled={disabled}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <OrderingControls
        active={active}
        siblings={siblings}
        promptIndex={promptIndex}
        ordered={ordered}
        disabled={disabled}
        onPromptChange={onPromptChange}
        onOrderingChange={onOrderingChange}
      />
    </div>
  );
}

interface Props {
  sentenceOrderings: SentenceOrderingInteraction[];
  answers: Record<string, string>;
  activePromptId: string | null;
  rotation: PageRotation;
  pageWidth: number;
  pageHeight: number;
  disabled: boolean;
  expandedExerciseId: string | null;
  closedExerciseIds: string[];
  onExpand: (exerciseId: string) => void;
  onCollapse: () => void;
  onClose: (exerciseId: string) => void;
  onDock: () => void;
  onPromptChange: (interactionId: string) => void;
  onOrderingChange: (interactionId: string, ordered: string[]) => void;
}

interface ExerciseGroup {
  exerciseId: string;
  interactions: SentenceOrderingInteraction[];
}

/**
 * In-page floating bubble layer. Rendered over the PDF page, one compact
 * bubble per sentence-ordering exercise. Positions are session-only and
 * recalculated from the exercise geometry whenever rotation, zoom, or the
 * exercise set changes.
 */
export default function OrderingFloatingLayer({
  sentenceOrderings,
  answers,
  activePromptId,
  rotation,
  pageWidth,
  pageHeight,
  disabled,
  expandedExerciseId,
  closedExerciseIds,
  onExpand,
  onCollapse,
  onClose,
  onDock,
  onPromptChange,
  onOrderingChange,
}: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const signatureRef = useRef<string>('');
  const [positions, setPositions] = useState<Record<string, Point>>({});

  const exercises = useMemo<ExerciseGroup[]>(() => {
    const groups = groupSentenceOrderings(sentenceOrderings);
    return Object.entries(groups).map(([exerciseId, interactions]) => ({
      exerciseId,
      interactions,
    }));
  }, [sentenceOrderings]);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer || exercises.length === 0) return;
    const context = measureDragContext(layer);
    if (!context) return;

    const signature = exercises.map((exercise) => {
      const box = pageBBoxForExercise(exercise.interactions, rotation, pageWidth, pageHeight);
      return `${exercise.exerciseId}:${box.left},${box.top},${box.width},${box.height}`;
    }).join('|') + `|${rotation}|${pageWidth}x${pageHeight}`;
    if (signature === signatureRef.current) return;
    signatureRef.current = signature;

    const bubbleSize = { width: BUBBLE_DEFAULT_WIDTH, height: BUBBLE_DEFAULT_HEIGHT };
    setPositions(() => {
      const next: Record<string, Point> = {};
      for (const exercise of exercises) {
        const box = pageBBoxForExercise(exercise.interactions, rotation, pageWidth, pageHeight);
        next[exercise.exerciseId] = defaultBubblePosition(
          box,
          context.pageOrigin,
          context.visible,
          bubbleSize,
        );
      }
      return next;
    });
  }, [exercises, rotation, pageWidth, pageHeight]);

  const getContext = useCallback(() => {
    const layer = layerRef.current;
    return layer ? measureDragContext(layer) : null;
  }, []);

  const handleDragMove = (exerciseId: string) => (position: Point) => {
    setPositions((current) => ({ ...current, [exerciseId]: position }));
  };

  return (
    <div ref={layerRef} className="ordering-floating-layer" aria-label="Floating ordering exercises">
      {exercises.map((exercise) => (
        <OrderingFloatingBubble
          key={exercise.exerciseId}
          interactions={exercise.interactions}
          answers={answers}
          activePromptId={activePromptId}
          expanded={exercise.exerciseId === expandedExerciseId}
          closed={closedExerciseIds.includes(exercise.exerciseId)}
          disabled={disabled}
          position={positions[exercise.exerciseId] ?? { x: 0, y: 0 }}
          getContext={getContext}
          onExpand={() => onExpand(exercise.exerciseId)}
          onCollapse={onCollapse}
          onClose={() => onClose(exercise.exerciseId)}
          onDock={onDock}
          onDragMove={handleDragMove(exercise.exerciseId)}
          onPromptChange={onPromptChange}
          onOrderingChange={onOrderingChange}
        />
      ))}
    </div>
  );
}
