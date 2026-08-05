import { ZOOM_OPTIONS } from '../reader/zoom';

export const ZOOM_KEY = 'lexora.zoom';

export const DEFAULT_ZOOM = 1.0;

/**
 * Reader zoom is document-level view state: it persists across refresh and
 * is independent of page rotation and exercise answers.
 */
export function readZoomPreference(
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): number {
  try {
    const raw = storage.getItem(ZOOM_KEY);
    if (!raw) return DEFAULT_ZOOM;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_ZOOM;
    if (ZOOM_OPTIONS.includes(parsed)) return parsed;
    return DEFAULT_ZOOM;
  } catch {
    return DEFAULT_ZOOM;
  }
}

export function writeZoomPreference(
  zoom: number,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): void {
  storage.setItem(ZOOM_KEY, String(zoom));
}
