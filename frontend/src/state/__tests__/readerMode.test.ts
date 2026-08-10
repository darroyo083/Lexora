import { describe, expect, it } from 'vitest';
import { readReaderMode, READER_MODE_KEY, writeReaderMode } from '../readerMode';

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (key: string, next: string) => {
      expect(key).toBe(READER_MODE_KEY);
      value = next;
    },
  };
}

describe('reader mode preference', () => {
  it('defaults invalid and missing values to Classic', () => {
    expect(readReaderMode(memoryStorage())).toBe('classic');
    expect(readReaderMode(memoryStorage('future-mode'))).toBe('classic');
  });

  it('round-trips Interactive mode', () => {
    const storage = memoryStorage();
    writeReaderMode('interactive', storage);
    expect(readReaderMode(storage)).toBe('interactive');
  });
});
