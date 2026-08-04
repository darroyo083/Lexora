import { describe, expect, it } from 'vitest';
import {
  isPageRotation,
  normalizeRotation,
  rotateBBox,
  rotateLeft,
  rotateRight,
  type PageRotation,
} from '../rotation';
import type { BBox } from '../types';

describe('rotation normalization', () => {
  it('keeps supported rotations unchanged', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(180)).toBe(180);
    expect(normalizeRotation(270)).toBe(270);
  });

  it('wraps values outside 0..360', () => {
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(720)).toBe(0);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(-450)).toBe(270);
  });

  it('falls back safely for unknown values', () => {
    expect(normalizeRotation(45)).toBe(0);
    expect(normalizeRotation(1000)).toBe(0);
    expect(normalizeRotation(Number.NaN)).toBe(0);
    expect(normalizeRotation(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('composes rotation steps', () => {
    expect(normalizeRotation(0 + 90)).toBe(90);
    expect(normalizeRotation(90 + 90)).toBe(180);
    expect(normalizeRotation(270 + 90)).toBe(0);
    expect(normalizeRotation(0 - 90)).toBe(270);
  });
});

describe('rotation stepping', () => {
  it('rotateRight advances clockwise', () => {
    expect(rotateRight(0)).toBe(90);
    expect(rotateRight(90)).toBe(180);
    expect(rotateRight(180)).toBe(270);
    expect(rotateRight(270)).toBe(0);
  });

  it('rotateLeft advances counter-clockwise', () => {
    expect(rotateLeft(0)).toBe(270);
    expect(rotateLeft(90)).toBe(0);
    expect(rotateLeft(180)).toBe(90);
    expect(rotateLeft(270)).toBe(180);
  });

  it('cycles back to start after four steps', () => {
    let rotation: PageRotation = 0;
    for (let step = 0; step < 4; step += 1) rotation = rotateRight(rotation);
    expect(rotation).toBe(0);
    for (let step = 0; step < 4; step += 1) rotation = rotateLeft(rotation);
    expect(rotation).toBe(0);
  });
});

describe('isPageRotation', () => {
  it('accepts only the four supported values', () => {
    expect(isPageRotation(0)).toBe(true);
    expect(isPageRotation(90)).toBe(true);
    expect(isPageRotation(180)).toBe(true);
    expect(isPageRotation(270)).toBe(true);
    expect(isPageRotation(45)).toBe(false);
    expect(isPageRotation(360)).toBe(false);
    expect(isPageRotation(null)).toBe(false);
    expect(isPageRotation('90')).toBe(false);
  });
});

describe('rotateBBox', () => {
  const cases: Array<{
    name: string;
    bbox: BBox;
    expected: Record<PageRotation, BBox>;
  }> = [
    {
      name: 'central bbox',
      bbox: { x: 0.4, y: 0.3, width: 0.2, height: 0.1 },
      expected: {
        0: { x: 0.4, y: 0.3, width: 0.2, height: 0.1 },
        90: { x: 0.6, y: 0.4, width: 0.1, height: 0.2 },
        180: { x: 0.4, y: 0.6, width: 0.2, height: 0.1 },
        270: { x: 0.3, y: 0.4, width: 0.1, height: 0.2 },
      },
    },
    {
      name: 'near top-left',
      bbox: { x: 0.1, y: 0.05, width: 0.2, height: 0.1 },
      expected: {
        0: { x: 0.1, y: 0.05, width: 0.2, height: 0.1 },
        90: { x: 0.85, y: 0.1, width: 0.1, height: 0.2 },
        180: { x: 0.7, y: 0.85, width: 0.2, height: 0.1 },
        270: { x: 0.05, y: 0.7, width: 0.1, height: 0.2 },
      },
    },
    {
      name: 'near bottom-right',
      bbox: { x: 0.8, y: 0.85, width: 0.15, height: 0.1 },
      expected: {
        0: { x: 0.8, y: 0.85, width: 0.15, height: 0.1 },
        90: { x: 0.05, y: 0.8, width: 0.1, height: 0.15 },
        180: { x: 0.05, y: 0.05, width: 0.15, height: 0.1 },
        270: { x: 0.85, y: 0.05, width: 0.1, height: 0.15 },
      },
    },
    {
      name: 'non-square bbox',
      bbox: { x: 0.5, y: 0.1, width: 0.3, height: 0.05 },
      expected: {
        0: { x: 0.5, y: 0.1, width: 0.3, height: 0.05 },
        90: { x: 0.85, y: 0.5, width: 0.05, height: 0.3 },
        180: { x: 0.2, y: 0.85, width: 0.3, height: 0.05 },
        270: { x: 0.1, y: 0.2, width: 0.05, height: 0.3 },
      },
    },
  ];

  for (const { name, bbox, expected } of cases) {
    it(`maps ${name} correctly for every rotation`, () => {
      for (const rotation of [0, 90, 180, 270] as const) {
        const rotated = rotateBBox(bbox, rotation);
        const want = expected[rotation];
        expect(rotated.x).toBeCloseTo(want.x, 10);
        expect(rotated.y).toBeCloseTo(want.y, 10);
        expect(rotated.width).toBeCloseTo(want.width, 10);
        expect(rotated.height).toBeCloseTo(want.height, 10);
      }
    });

    it(`keeps ${name} within normalized bounds for every rotation`, () => {
      for (const rotation of [0, 90, 180, 270] as const) {
        const rotated = rotateBBox(bbox, rotation);
        expect(rotated.x).toBeGreaterThanOrEqual(-1e-9);
        expect(rotated.y).toBeGreaterThanOrEqual(-1e-9);
        expect(rotated.x + rotated.width).toBeLessThanOrEqual(1 + 1e-9);
        expect(rotated.y + rotated.height).toBeLessThanOrEqual(1 + 1e-9);
      }
    });
  }

  it('round-trips through 90 then 270', () => {
    const bbox = { x: 0.12, y: 0.34, width: 0.5, height: 0.07 };
    const back = rotateBBox(rotateBBox(bbox, 90), 270);
    expect(back.x).toBeCloseTo(bbox.x, 10);
    expect(back.y).toBeCloseTo(bbox.y, 10);
    expect(back.width).toBeCloseTo(bbox.width, 10);
    expect(back.height).toBeCloseTo(bbox.height, 10);
  });

  it('round-trips through 180 twice', () => {
    const bbox = { x: 0.7, y: 0.2, width: 0.1, height: 0.4 };
    const back = rotateBBox(rotateBBox(bbox, 180), 180);
    expect(back.x).toBeCloseTo(bbox.x, 10);
    expect(back.y).toBeCloseTo(bbox.y, 10);
    expect(back.width).toBeCloseTo(bbox.width, 10);
    expect(back.height).toBeCloseTo(bbox.height, 10);
  });

  it('does not mutate the input bbox', () => {
    const bbox = { x: 0.2, y: 0.3, width: 0.4, height: 0.1 };
    const copy = { ...bbox };
    rotateBBox(bbox, 90);
    expect(bbox).toEqual(copy);
  });
});
