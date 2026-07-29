import { describe, it, expect } from 'vitest';
import {
  normalizeBBox,
  denormalizeBBox,
  documentToViewport,
} from '../transforms';
import type { BBox } from '../../reader/types';

describe('normalizeBBox', () => {
  it('converts pixel coords to normalized', () => {
    const result = normalizeBBox(100, 200, 300, 250, 800, 600);
    expect(result.x).toBeCloseTo(0.125);
    expect(result.y).toBeCloseTo(200 / 600);
    expect(result.width).toBeCloseTo(0.25);
    expect(result.height).toBeCloseTo(50 / 600);
  });

  it('maps top-left origin to (0,0)', () => {
    const result = normalizeBBox(0, 0, 800, 600, 800, 600);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });

  it('clamps out-of-bounds to [0,1]', () => {
    const result = normalizeBBox(-10, -5, 810, 610, 800, 600);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.width).toBeCloseTo(1);
    expect(result.height).toBeCloseTo(1);
  });

  it('handles zero dimensions gracefully', () => {
    const result = normalizeBBox(0, 0, 100, 100, 0, 0);
    expect(result.width).toBeCloseTo(1);
    expect(result.height).toBeCloseTo(1);
  });
});

describe('denormalizeBBox', () => {
  it('converts normalized to pixel coords', () => {
    const bbox: BBox = { x: 0.125, y: 200 / 600, width: 0.25, height: 50 / 600 };
    const result = denormalizeBBox(bbox, 800, 600);
    expect(result.left).toBe(100);
    expect(result.top).toBe(200);
    expect(result.right).toBe(300);
    expect(result.bottom).toBe(250);
  });

  it('handles full-page coords', () => {
    const bbox: BBox = { x: 0, y: 0, width: 1, height: 1 };
    const result = denormalizeBBox(bbox, 800, 600);
    expect(result.left).toBe(0);
    expect(result.top).toBe(0);
    expect(result.right).toBe(800);
    expect(result.bottom).toBe(600);
  });
});

describe('documentToViewport', () => {
  it('converts normalized bbox to viewport pixels', () => {
    const bbox: BBox = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    const result = documentToViewport(bbox, 800, 600);
    expect(result.left).toBe(80);
    expect(result.top).toBe(120);
    expect(result.width).toBe(240);
    expect(result.height).toBe(240);
  });
});

describe('round trip', () => {
  it.each([
    [100, 200, 300, 250, 800, 600],
    [0, 0, 2480, 3508, 2480, 3508],
    [50, 100, 150, 120, 1000, 800],
  ])(
    'normalize -> denormalize returns original (%i,%i,%i,%i) @ %ix%i',
    (left, top, right, bottom, sw, sh) => {
      const norm = normalizeBBox(left, top, right, bottom, sw, sh);
      const pixel = denormalizeBBox(norm, sw, sh);
      expect(pixel.left).toBe(left);
      expect(pixel.top).toBe(top);
      expect(pixel.right).toBe(right);
      expect(pixel.bottom).toBe(bottom);
    },
  );

  it('zoom-transformed overlay stays aligned', () => {
    const bbox: BBox = { x: 0.31, y: 0.42, width: 0.09, height: 0.018 };

    const at100 = documentToViewport(bbox, 800, 600);
    const at150 = documentToViewport(bbox, 1200, 900);
    const at75 = documentToViewport(bbox, 600, 450);

    expect(at150.left / 1200).toBeCloseTo(at100.left / 800, 5);
    expect(at75.left / 600).toBeCloseTo(at100.left / 800, 5);
  });
});
