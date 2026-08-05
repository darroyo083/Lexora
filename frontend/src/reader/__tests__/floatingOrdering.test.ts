import { describe, expect, it } from 'vitest';
import {
  BUBBLE_DEFAULT_HEIGHT,
  BUBBLE_DEFAULT_WIDTH,
  bubbleDragReducer,
  clampPointToVisible,
  defaultBubblePosition,
  dragPosition,
  emptyOrderingView,
  exerciseProgress,
  isDragIntent,
  isExerciseClosed,
  isExerciseExpanded,
  orderingViewReducer,
  pageBBoxForExercise,
  type BubbleDragSession,
} from '../floatingOrdering';
import type { SentenceOrderingInteraction } from '../types';

function interaction(
  id: string,
  exerciseId: string,
  texts: string[],
  y = 0.2,
): SentenceOrderingInteraction {
  return {
    id,
    kind: 'sentence-ordering',
    bbox: { x: 0.15, y, width: 0.5, height: 0.02 },
    exerciseId,
    promptIndex: 1,
    detectionMethod: 'sentence-ordering-v1',
    candidateScore: 0.9,
    nearbyTextSpanIds: [],
    items: texts.map((text, index) => ({
      id: `${id}-item-${index + 1}`,
      text,
      bbox: { x: 0.15 + index * 0.1, y, width: 0.08, height: 0.02 },
      originalIndex: index + 1,
    })),
  };
}

const exerciseA = interaction('a', 'ex-a', ['Der', 'Hund', 'läuft']);
const exerciseB = interaction('b', 'ex-b', ['Die', 'Katze', 'schläft', 'gern']);

const visible = { left: 0, top: 0, width: 800, height: 600 };
const pageOrigin = { x: 40, y: 40 };
const bubble = { width: 240, height: 96 };

describe('ordering view state', () => {
  it('keeps only one exercise bubble expanded at a time', () => {
    let state = emptyOrderingView();
    state = orderingViewReducer(state, { type: 'expand', exerciseId: 'ex-a' });
    expect(isExerciseExpanded(state, 'ex-a')).toBe(true);

    state = orderingViewReducer(state, { type: 'expand', exerciseId: 'ex-b' });
    expect(isExerciseExpanded(state, 'ex-b')).toBe(true);
    expect(isExerciseExpanded(state, 'ex-a')).toBe(false);
  });

  it('collapses the expanded bubble without hiding others', () => {
    let state = emptyOrderingView();
    state = orderingViewReducer(state, { type: 'expand', exerciseId: 'ex-a' });
    state = orderingViewReducer(state, { type: 'collapse' });
    expect(isExerciseExpanded(state, 'ex-a')).toBe(false);
    expect(isExerciseClosed(state, 'ex-a')).toBe(false);
  });

  it('closes a bubble and reopens it', () => {
    let state = emptyOrderingView();
    state = orderingViewReducer(state, { type: 'close', exerciseId: 'ex-a' });
    expect(isExerciseClosed(state, 'ex-a')).toBe(true);

    state = orderingViewReducer(state, { type: 'reopen', exerciseId: 'ex-a' });
    expect(isExerciseClosed(state, 'ex-a')).toBe(false);
  });

  it('expanding a closed exercise recovers its bubble', () => {
    let state = emptyOrderingView();
    state = orderingViewReducer(state, { type: 'close', exerciseId: 'ex-a' });
    state = orderingViewReducer(state, { type: 'expand', exerciseId: 'ex-a' });
    expect(isExerciseClosed(state, 'ex-a')).toBe(false);
    expect(isExerciseExpanded(state, 'ex-a')).toBe(true);
  });

  it('Float -> Dock -> Float preserves expanded and closed state', () => {
    let state = emptyOrderingView();
    state = orderingViewReducer(state, { type: 'expand', exerciseId: 'ex-b' });
    state = orderingViewReducer(state, { type: 'close', exerciseId: 'ex-c' });

    state = orderingViewReducer(state, { type: 'dock' });
    expect(state.mode).toBe('docked');
    state = orderingViewReducer(state, { type: 'float' });
    expect(state.mode).toBe('floating');

    expect(isExerciseExpanded(state, 'ex-b')).toBe(true);
    expect(isExerciseClosed(state, 'ex-c')).toBe(true);
    expect(isExerciseClosed(state, 'ex-a')).toBe(false);
  });

  it('keeps multiple exercises isolated in the view state', () => {
    let state = emptyOrderingView();
    state = orderingViewReducer(state, { type: 'expand', exerciseId: 'ex-a' });
    state = orderingViewReducer(state, { type: 'close', exerciseId: 'ex-b' });

    expect(isExerciseExpanded(state, 'ex-a')).toBe(true);
    expect(isExerciseExpanded(state, 'ex-b')).toBe(false);
    expect(isExerciseClosed(state, 'ex-b')).toBe(true);
    expect(isExerciseClosed(state, 'ex-a')).toBe(false);
    expect(isExerciseClosed(state, 'ex-c')).toBe(false);
  });

  it('reset clears per-exercise state but keeps the mode', () => {
    let state = emptyOrderingView('docked');
    state = orderingViewReducer(state, { type: 'expand', exerciseId: 'ex-a' });
    state = orderingViewReducer(state, { type: 'close', exerciseId: 'ex-b' });
    state = orderingViewReducer(state, { type: 'reset' });
    expect(state.mode).toBe('docked');
    expect(state.expandedExerciseId).toBeNull();
    expect(state.closedExerciseIds).toEqual([]);
  });
});

describe('exercise progress', () => {
  it('counts ordered and total items across the exercise', () => {
    const answers = { a: 'a-item-2,a-item-1', b: '' };
    expect(exerciseProgress([exerciseA, exerciseB], answers)).toEqual({ ordered: 2, total: 7 });
  });

  it('reports empty progress when nothing is ordered', () => {
    expect(exerciseProgress([exerciseA], {})).toEqual({ ordered: 0, total: 3 });
  });
});

describe('positioning', () => {
  it('places the bubble beside the exercise when there is room', () => {
    const exercise = { left: 100, top: 120, width: 400, height: 60 };
    const position = defaultBubblePosition(exercise, pageOrigin, visible, bubble);
    const contentX = position.x + pageOrigin.x;
    const contentY = position.y + pageOrigin.y;
    expect(contentX).toBeGreaterThan(exercise.left + exercise.width);
    expect(contentY).toBeGreaterThanOrEqual(exercise.top);
  });

  it('places the bubble below the exercise when there is no room beside it', () => {
    const exercise = { left: 500, top: 120, width: 400, height: 60 };
    const position = defaultBubblePosition(exercise, pageOrigin, visible, bubble);
    const contentX = position.x + pageOrigin.x;
    const contentY = position.y + pageOrigin.y;
    expect(contentY).toBeGreaterThanOrEqual(exercise.top + exercise.height);
    expect(contentX).toBeGreaterThanOrEqual(exercise.left);
  });

  it('never spawns the bubble partially outside the visible area', () => {
    const exercise = { left: 500, top: 500, width: 400, height: 80 };
    const position = defaultBubblePosition(exercise, pageOrigin, visible, bubble);
    expect(position.x).toBeGreaterThanOrEqual(visible.left - pageOrigin.x);
    expect(position.y).toBeGreaterThanOrEqual(visible.top - pageOrigin.y);
    expect(position.x + bubble.width).toBeLessThanOrEqual(
      visible.left + visible.width - pageOrigin.x,
    );
    expect(position.y + bubble.height).toBeLessThanOrEqual(
      visible.top + visible.height - pageOrigin.y,
    );
  });

  it('keeps a dragged position inside the visible area', () => {
    const start = { x: 300, y: 200 };
    const next = dragPosition(start, { x: 9000, y: -9000 }, pageOrigin, visible, bubble);
    expect(next.x + bubble.width).toBeLessThanOrEqual(visible.left + visible.width - pageOrigin.x);
    expect(next.y).toBeGreaterThanOrEqual(visible.top - pageOrigin.y);
  });

  it('clamps a point to the visible area', () => {
    const clamped = clampPointToVisible({ x: -50, y: 700 }, pageOrigin, visible, bubble);
    expect(clamped.x).toBeGreaterThanOrEqual(visible.left - pageOrigin.x);
    expect(clamped.y + bubble.height).toBeLessThanOrEqual(visible.top + visible.height - pageOrigin.y);
  });

  it('derives the page box from the exercise union bbox through rotation', () => {
    const box = pageBBoxForExercise([exerciseA], 0, 1000, 1000);
    expect(box.left).toBeCloseTo(150, 5);
    expect(box.top).toBeCloseTo(200, 5);
    expect(box.width).toBeCloseTo(500, 5);
  });
});

describe('drag is pure and never touches answers', () => {
  it('leaves the answers record unchanged while dragging', () => {
    const answers = { a: 'a-item-3,a-item-1,a-item-2', b: 'b-item-2' };
    const snapshot = JSON.stringify(answers);
    const start = { x: 100, y: 100 };
    for (const delta of [{ x: 10, y: 0 }, { x: -4, y: 7 }, { x: 80, y: -30 }]) {
      dragPosition(start, delta, pageOrigin, visible, bubble);
    }
    expect(JSON.stringify(answers)).toBe(snapshot);
  });

  it('uses a fixed default bubble size for default placement', () => {
    expect(BUBBLE_DEFAULT_WIDTH).toBeGreaterThan(0);
    expect(BUBBLE_DEFAULT_HEIGHT).toBeGreaterThan(0);
    const position = defaultBubblePosition(
      { left: 100, top: 100, width: 100, height: 30 },
      pageOrigin,
      visible,
      { width: BUBBLE_DEFAULT_WIDTH, height: BUBBLE_DEFAULT_HEIGHT },
    );
    expect(position.x).toBe(212);
    expect(position.x + pageOrigin.x).toBe(252);
  });
});

describe('isDragIntent', () => {
  it('treats small movements as a click, not a drag', () => {
    expect(isDragIntent({ x: 0, y: 0 })).toBe(false);
    expect(isDragIntent({ x: 3, y: 4 })).toBe(false);
    expect(isDragIntent({ x: 5, y: 0 })).toBe(false);
  });

  it('treats movement beyond the threshold as a drag', () => {
    expect(isDragIntent({ x: 6, y: 0 })).toBe(true);
    expect(isDragIntent({ x: 0, y: -10 })).toBe(true);
    expect(isDragIntent({ x: 4, y: 4 })).toBe(true);
  });
});

describe('bubbleDragReducer (click vs drag)', () => {
  const context = { pageOrigin: { x: 40, y: 40 }, visible: { left: 0, top: 0, width: 800, height: 600 } };
  const size = { width: 240, height: 96 };
  const position = { x: 100, y: 100 };

  function down(
    state: BubbleDragSession | null = null,
    client = { x: 120, y: 130 },
  ) {
    return bubbleDragReducer(state, {
      type: 'pointerdown',
      client,
      position,
      size,
      context,
    });
  }

  it('click: pointer up without movement reports a click and clears the session', () => {
    const pressed = down();
    expect(pressed.event).toEqual({ type: 'none' });
    expect(pressed.state).not.toBeNull();
    const released = bubbleDragReducer(pressed.state, { type: 'pointerup' });
    expect(released.event).toEqual({ type: 'click' });
    expect(released.state).toBeNull();
  });

  it('small jitter stays below the drag threshold (still a click)', () => {
    const pressed = down();
    let state = pressed.state;
    for (const client of [{ x: 121, y: 130 }, { x: 123, y: 132 }, { x: 124, y: 133 }]) {
      const moved = bubbleDragReducer(state, { type: 'pointermove', client });
      expect(moved.event).toEqual({ type: 'none' });
      state = moved.state;
    }
    const released = bubbleDragReducer(state, { type: 'pointerup' });
    expect(released.event).toEqual({ type: 'click' });
  });

  it('drag: movement beyond the threshold emits clamped positions', () => {
    const pressed = down();
    const moved = bubbleDragReducer(pressed.state, {
      type: 'pointermove',
      client: { x: 320, y: 330 },
    });
    expect(moved.event.type).toBe('drag');
    if (moved.event.type === 'drag') {
      expect(moved.event.position).toEqual({ x: 300, y: 300 });
    }
  });

  it('drag-end: releasing after a drag stays collapsed (no click)', () => {
    const pressed = down();
    const moved = bubbleDragReducer(pressed.state, {
      type: 'pointermove',
      client: { x: 200, y: 250 },
    });
    const released = bubbleDragReducer(moved.state, { type: 'pointerup' });
    expect(released.event).toEqual({ type: 'drag-end' });
    expect(released.state).toBeNull();
  });

  it('keeps dragging positions clamped to the visible reader area', () => {
    const pressed = down();
    const moved = bubbleDragReducer(pressed.state, {
      type: 'pointermove',
      client: { x: 9000, y: 9000 },
    });
    expect(moved.event.type).toBe('drag');
    if (moved.event.type === 'drag') {
      expect(moved.event.position.x + size.width)
        .toBeLessThanOrEqual(context.visible.left + context.visible.width - context.pageOrigin.x);
      expect(moved.event.position.y + size.height)
        .toBeLessThanOrEqual(context.visible.top + context.visible.height - context.pageOrigin.y);
    }
  });

  it('ignores pointer moves without an active session', () => {
    const moved = bubbleDragReducer(null, { type: 'pointermove', client: { x: 999, y: 999 } });
    expect(moved.event).toEqual({ type: 'none' });
    expect(moved.state).toBeNull();
  });

  it('never touches answers while dragging (pure positions only)', () => {
    const answers = { a: 'a-item-2,a-item-1', b: 'b-item-3' };
    const snapshot = JSON.stringify(answers);
    const pressed = down();
    const moved = bubbleDragReducer(pressed.state, {
      type: 'pointermove',
      client: { x: 300, y: 140 },
    });
    bubbleDragReducer(moved.state, { type: 'pointerup' });
    expect(JSON.stringify(answers)).toBe(snapshot);
  });
});
