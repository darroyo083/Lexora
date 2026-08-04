import type { BBox } from './types';

export type PageRotation = 0 | 90 | 180 | 270;

export const PAGE_ROTATIONS: readonly PageRotation[] = [0, 90, 180, 270];

export function isPageRotation(value: unknown): value is PageRotation {
  return value === 0 || value === 90 || value === 180 || value === 270;
}

export function normalizeRotation(value: number): PageRotation {
  if (!Number.isFinite(value)) return 0;
  const normalized = ((Math.round(value) % 360) + 360) % 360;
  return isPageRotation(normalized) ? normalized : 0;
}

export function rotateLeft(rotation: PageRotation): PageRotation {
  return normalizeRotation(rotation - 90);
}

export function rotateRight(rotation: PageRotation): PageRotation {
  return normalizeRotation(rotation + 90);
}

/**
 * Rotate a normalized [0,1] bbox clockwise by the given viewer rotation.
 *
 * Canonical PageAnalysis geometry uses a top-left origin with x growing to the
 * right and y growing down, matching the PDF.js viewport at the page's
 * intrinsic rotation. A clockwise viewer rotation R maps a bbox into the
 * rotated viewport space as follows:
 *
 *   90°:  x' = 1 - (y + h),  y' = x,         w' = h, h' = w
 *   180°: x' = 1 - (x + w),  y' = 1 - (y+h), w' = w, h' = h
 *   270°: x' = y,            y' = 1 - (x+w), w' = h, h' = w
 *
 * 0° is the identity. Results stay within the normalized [0,1] bounds for
 * valid input bboxes.
 */
export function rotateBBox(bbox: BBox, rotation: PageRotation): BBox {
  switch (rotation) {
    case 90:
      return {
        x: 1 - (bbox.y + bbox.height),
        y: bbox.x,
        width: bbox.height,
        height: bbox.width,
      };
    case 180:
      return {
        x: 1 - (bbox.x + bbox.width),
        y: 1 - (bbox.y + bbox.height),
        width: bbox.width,
        height: bbox.height,
      };
    case 270:
      return {
        x: bbox.y,
        y: 1 - (bbox.x + bbox.width),
        width: bbox.height,
        height: bbox.width,
      };
    default:
      return { ...bbox };
  }
}
