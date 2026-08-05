import type { SentenceOrderingInteraction } from './types';
import { rotateBBox, type PageRotation } from './rotation';
import { exerciseBBox, parseOrderedAnswer } from './ordering';

/**
 * Pure view-state and positioning logic for the floating ordering bubbles.
 *
 * The floating bubble belongs to a document, page, and SentenceOrdering
 * exercise. Its position is a session-only pixel offset inside the rendered
 * page layer; it is never persisted, never merged into fingerprints, and is
 * recalculated from the exercise geometry after F5, page reopen, rotation, or
 * a major zoom/layout change.
 */

export type OrderingMode = 'floating' | 'docked';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Viewport context a bubble drag clamps against. */
export interface DragContext {
  pageOrigin: Point;
  visible: Rect;
}

export interface OrderingViewState {
  mode: OrderingMode;
  expandedExerciseId: string | null;
  closedExerciseIds: string[];
}

export type OrderingViewAction =
  | { type: 'expand'; exerciseId: string }
  | { type: 'collapse' }
  | { type: 'close'; exerciseId: string }
  | { type: 'reopen'; exerciseId: string }
  | { type: 'dock' }
  | { type: 'float' }
  | { type: 'reset' };

export function emptyOrderingView(mode: OrderingMode = 'floating'): OrderingViewState {
  return { mode, expandedExerciseId: null, closedExerciseIds: [] };
}

export function orderingViewReducer(
  state: OrderingViewState,
  action: OrderingViewAction,
): OrderingViewState {
  switch (action.type) {
    case 'expand':
      return {
        ...state,
        expandedExerciseId: action.exerciseId,
        closedExerciseIds: state.closedExerciseIds.filter((id) => id !== action.exerciseId),
      };
    case 'collapse':
      return { ...state, expandedExerciseId: null };
    case 'close':
      return {
        ...state,
        expandedExerciseId: state.expandedExerciseId === action.exerciseId
          ? null
          : state.expandedExerciseId,
        closedExerciseIds: state.closedExerciseIds.includes(action.exerciseId)
          ? state.closedExerciseIds
          : [...state.closedExerciseIds, action.exerciseId],
      };
    case 'reopen':
      return {
        ...state,
        closedExerciseIds: state.closedExerciseIds.filter((id) => id !== action.exerciseId),
      };
    case 'dock':
      return { ...state, mode: 'docked' };
    case 'float':
      return { ...state, mode: 'floating' };
    case 'reset':
      return emptyOrderingView(state.mode);
    default:
      return state;
  }
}

export function isExerciseClosed(
  state: OrderingViewState,
  exerciseId: string,
): boolean {
  return state.closedExerciseIds.includes(exerciseId);
}

export function isExerciseExpanded(
  state: OrderingViewState,
  exerciseId: string,
): boolean {
  return state.expandedExerciseId === exerciseId;
}

export interface ExerciseProgress {
  ordered: number;
  total: number;
}

export function exerciseProgress(
  interactions: SentenceOrderingInteraction[],
  answers: Record<string, string>,
): ExerciseProgress {
  let ordered = 0;
  let total = 0;
  for (const interaction of interactions) {
    ordered += parseOrderedAnswer(answers[interaction.id]).length;
    total += interaction.items.length;
  }
  return { ordered, total };
}

export const BUBBLE_GAP_PX = 12;
export const BUBBLE_DEFAULT_WIDTH = 240;
export const BUBBLE_DEFAULT_HEIGHT = 96;
export const DRAG_THRESHOLD_PX = 5;

/**
 * Whether a pointer delta counts as an intentional drag. Tiny movements below
 * the threshold are treated as a click, so a normal tap on a collapsed bubble
 * still expands it instead of nudging it.
 */
export function isDragIntent(delta: Point): boolean {
  return Math.hypot(delta.x, delta.y) > DRAG_THRESHOLD_PX;
}

export interface BubbleDragSession {
  startClient: Point;
  startPosition: Point;
  size: Size;
  context: DragContext;
  moved: boolean;
}

export type BubbleDragAction =
  | {
      type: 'pointerdown';
      client: Point;
      position: Point;
      size: Size;
      context: DragContext;
    }
  | { type: 'pointermove'; client: Point }
  | { type: 'pointerup' };

export type BubbleDragEvent =
  | { type: 'none' }
  | { type: 'drag'; position: Point }
  | { type: 'click' }
  | { type: 'drag-end' };

/**
 * Click-vs-drag state machine for a floating bubble. Both the collapsed and
 * expanded forms share one implementation: pointer down opens a session;
 * movement below the threshold keeps it a pending click, movement beyond it
 * starts dragging (positions stay clamped to the visible reader area); pointer
 * up reports either `click` (expand) or `drag-end` (stay as-is — a dragged
 * bubble never expands on release). Dragging only ever yields positions —
 * answers are never touched.
 */
export function bubbleDragReducer(
  state: BubbleDragSession | null,
  action: BubbleDragAction,
): { state: BubbleDragSession | null; event: BubbleDragEvent } {
  switch (action.type) {
    case 'pointerdown':
      return {
        state: {
          startClient: action.client,
          startPosition: action.position,
          size: action.size,
          context: action.context,
          moved: false,
        },
        event: { type: 'none' },
      };
    case 'pointermove': {
      if (!state) return { state: null, event: { type: 'none' } };
      const delta = {
        x: action.client.x - state.startClient.x,
        y: action.client.y - state.startClient.y,
      };
      if (!state.moved && !isDragIntent(delta)) {
        return { state, event: { type: 'none' } };
      }
      return {
        state: { ...state, moved: true },
        event: {
          type: 'drag',
          position: dragPosition(
            state.startPosition,
            delta,
            state.context.pageOrigin,
            state.context.visible,
            state.size,
          ),
        },
      };
    }
    case 'pointerup': {
      if (!state) return { state: null, event: { type: 'none' } };
      return {
        state: null,
        event: state.moved ? { type: 'drag-end' } : { type: 'click' },
      };
    }
    default:
      return { state, event: { type: 'none' } };
  }
}

/**
 * The union exercise bbox mapped through the current viewer rotation into
 * page CSS pixels. The bubble's default anchor is derived from this geometry.
 */
export function pageBBoxForExercise(
  interactions: SentenceOrderingInteraction[],
  rotation: PageRotation,
  pageWidth: number,
  pageHeight: number,
): Rect {
  const bbox = exerciseBBox(interactions);
  const rotated = rotateBBox(bbox, rotation);
  return {
    left: rotated.x * pageWidth,
    top: rotated.y * pageHeight,
    width: rotated.width * pageWidth,
    height: rotated.height * pageHeight,
  };
}

function rectOverlap(a: Rect, b: Rect): number {
  const overlapWidth = Math.max(
    0,
    Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top),
  );
  return overlapWidth * overlapHeight;
}

/**
 * Clamp a layer-pixel point so a bubble of the given size stays fully inside
 * the visible scrollport. `pageOrigin` is the page's top-left in scrollport
 * content coordinates; `visible` is the scrollport's current view rectangle
 * in the same content coordinates.
 */
export function clampPointToVisible(
  point: Point,
  pageOrigin: Point,
  visible: Rect,
  bubble: Size,
): Point {
  const minX = visible.left - pageOrigin.x;
  const maxX = visible.left + visible.width - bubble.width - pageOrigin.x;
  const minY = visible.top - pageOrigin.y;
  const maxY = visible.top + visible.height - bubble.height - pageOrigin.y;
  return {
    x: Math.min(Math.max(point.x, minX), maxX),
    y: Math.min(Math.max(point.y, minY), maxY),
  };
}

/**
 * Compute a sensible default spawn position derived from the exercise bbox:
 * beside the exercise when space allows, otherwise below, preferring the
 * candidate that overlaps the exercise least. The result is always clamped so
 * the bubble never spawns partially outside the visible reader area.
 * `exercise` is in page-layer pixels; positions are returned in the same
 * layer coordinates (the clamp converts through `pageOrigin`).
 */
export function defaultBubblePosition(
  exercise: Rect,
  pageOrigin: Point,
  visible: Rect,
  bubble: Size,
): Point {
  const gap = BUBBLE_GAP_PX;
  const candidates: Point[] = [
    {
      x: exercise.left + exercise.width + gap,
      y: exercise.top,
    },
    {
      x: exercise.left,
      y: exercise.top + exercise.height + gap,
    },
    {
      x: exercise.left + exercise.width - bubble.width,
      y: exercise.top + exercise.height + gap,
    },
  ];

  let best: Point | null = null;
  let bestOverlap = Infinity;
  for (const candidate of candidates) {
    const clamped = clampPointToVisible(candidate, pageOrigin, visible, bubble);
    const overlap = rectOverlap(
      { left: clamped.x, top: clamped.y, width: bubble.width, height: bubble.height },
      exercise,
    );
    if (overlap < bestOverlap) {
      best = clamped;
      bestOverlap = overlap;
    }
    if (overlap === 0) return clamped;
  }
  return best ?? { x: 0, y: 0 };
}

/**
 * The next position while dragging: the drag-start position plus the pointer
 * delta, clamped to the visible reader area. Pure — never touches answer state.
 */
export function dragPosition(
  start: Point,
  delta: Point,
  pageOrigin: Point,
  visible: Rect,
  bubble: Size,
): Point {
  return clampPointToVisible(
    { x: start.x + delta.x, y: start.y + delta.y },
    pageOrigin,
    visible,
    bubble,
  );
}
