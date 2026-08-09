// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import CorrectionGlyphs from '../CorrectionGlyphs';
import { CorrectionVerdict } from '../../state/correction';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});

const BBOX = { x: 0.1, y: 0.1, width: 0.2, height: 0.05 };

describe('CorrectionGlyphs', () => {
  const base = {
    blanks: [{ id: 'b1', interactionBbox: BBOX }],
    choices: [{ id: 'c1', targetBbox: BBOX, optionGroupId: 'g1' }],
    grids: [],
    rotation: 0 as const,
    viewportHeight: 1000,
    suppressed: false,
  };

  it('renders no rings when no verdicts exist (UNMAPPED/AMBIGUOUS neutral)', () => {
    const { container } = render(
      <CorrectionGlyphs {...base} verdictByItem={{}} />,
    );
    expect(container.querySelectorAll('.correction-ring').length).toBe(0);
  });

  it('renders a ring for a CORRECT blank and a CORRECT choice', () => {
    const { container } = render(
      <CorrectionGlyphs
        {...base}
        verdictByItem={{ b1: CorrectionVerdict.CORRECT, c1: CorrectionVerdict.CORRECT }}
      />,
    );
    expect(container.querySelector('.correction-ring-blank.correct')).toBeTruthy();
    expect(container.querySelector('.correction-ring-choice.correct')).toBeTruthy();
    expect(container.querySelectorAll('.correction-ring').length).toBe(2);
  });

  it('renders an err ring for an INCORRECT choice', () => {
    const { container } = render(
      <CorrectionGlyphs
        {...base}
        verdictByItem={{ c1: CorrectionVerdict.INCORRECT }}
      />,
    );
    expect(container.querySelector('.correction-ring-choice.incorrect')).toBeTruthy();
  });

  it('renders nothing when suppressed by debug overlays', () => {
    const { container } = render(
      <CorrectionGlyphs
        {...base}
        verdictByItem={{ c1: CorrectionVerdict.CORRECT }}
        suppressed
      />,
    );
    expect(container.querySelectorAll('.correction-ring').length).toBe(0);
  });

  it('never renders a ring for an absent verdict even when the item exists', () => {
    const { container } = render(
      <CorrectionGlyphs
        {...base}
        verdictByItem={{ b1: undefined, c1: undefined }}
      />,
    );
    expect(container.querySelectorAll('.correction-ring').length).toBe(0);
  });
});
