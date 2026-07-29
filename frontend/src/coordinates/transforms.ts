import type { BBox } from '../reader/types';

export function normalizeBBox(
  pixelLeft: number,
  pixelTop: number,
  pixelRight: number,
  pixelBottom: number,
  sourceWidth: number,
  sourceHeight: number,
): BBox {
  const w = sourceWidth > 0 ? sourceWidth : 1;
  const h = sourceHeight > 0 ? sourceHeight : 1;

  const x = clamp(pixelLeft / w);
  const y = clamp(pixelTop / h);
  const width = clamp((pixelRight - pixelLeft) / w);
  const height = clamp((pixelBottom - pixelTop) / h);

  return { x: safe(x), y: safe(y), width: safe(width), height: safe(height) };
}

export function denormalizeBBox(
  bbox: BBox,
  sourceWidth: number,
  sourceHeight: number,
): { left: number; top: number; right: number; bottom: number } {
  return {
    left: Math.round(bbox.x * sourceWidth),
    top: Math.round(bbox.y * sourceHeight),
    right: Math.round((bbox.x + bbox.width) * sourceWidth),
    bottom: Math.round((bbox.y + bbox.height) * sourceHeight),
  };
}

export function documentToViewport(
  bbox: BBox,
  viewportPixelWidth: number,
  viewportPixelHeight: number,
): { left: number; top: number; width: number; height: number } {
  return {
    left: bbox.x * viewportPixelWidth,
    top: bbox.y * viewportPixelHeight,
    width: bbox.width * viewportPixelWidth,
    height: bbox.height * viewportPixelHeight,
  };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function safe(v: number): number {
  return Number(v.toFixed(6));
}
