import { describe, expect, it, beforeEach } from 'vitest';
import {
  DEFAULT_ZOOM,
  readZoomPreference,
  writeZoomPreference,
  ZOOM_KEY,
} from '../zoom';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
});

describe('zoom view state', () => {
  it('defaults to 100% when nothing was saved', () => {
    expect(readZoomPreference(storage)).toBe(DEFAULT_ZOOM);
  });

  it('restores a previously selected zoom level', () => {
    writeZoomPreference(1.5, storage);
    expect(readZoomPreference(storage)).toBe(1.5);
  });

  it('round-trips every offered zoom option', () => {
    for (const option of [0.75, 1.0, 1.25, 1.5, 1.75, 2.0]) {
      writeZoomPreference(option, storage);
      expect(readZoomPreference(storage)).toBe(option);
    }
  });

  it('falls back to 100% for garbage values', () => {
    storage.setItem(ZOOM_KEY, 'not-a-number');
    expect(readZoomPreference(storage)).toBe(DEFAULT_ZOOM);
  });

  it('falls back to 100% for out-of-range values', () => {
    storage.setItem(ZOOM_KEY, '8.5');
    expect(readZoomPreference(storage)).toBe(DEFAULT_ZOOM);
  });

  it('falls back to 100% for malformed storage content', () => {
    storage.setItem(ZOOM_KEY, '{}');
    expect(readZoomPreference(storage)).toBe(DEFAULT_ZOOM);
  });

  it('persists the new zoom whenever the reader zoom changes', () => {
    writeZoomPreference(2.0, storage);
    writeZoomPreference(1.0, storage);
    expect(readZoomPreference(storage)).toBe(1.0);
  });
});
