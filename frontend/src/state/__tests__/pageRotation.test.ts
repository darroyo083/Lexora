import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadPageRotationStore,
  readPageRotation,
  writePageRotation,
} from '../pageRotation';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  raw(): string | null {
    return this.data.get('lexora.pageRotations.v1') ?? null;
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
});

describe('page rotation persistence', () => {
  it('defaults to 0 with no stored state', () => {
    expect(readPageRotation('book-a', 1, storage)).toBe(0);
  });

  it('stores and reads a rotation per page', () => {
    writePageRotation('book-a', 30, 180, storage);
    writePageRotation('book-a', 31, 90, storage);
    writePageRotation('book-a', 32, 0, storage);

    expect(readPageRotation('book-a', 30, storage)).toBe(180);
    expect(readPageRotation('book-a', 31, storage)).toBe(90);
    expect(readPageRotation('book-a', 32, storage)).toBe(0);
  });

  it('restores after a read (F5 path)', () => {
    writePageRotation('book-a', 33, 270, storage);
    const restored = loadPageRotationStore(storage);
    expect(restored.rotations['book-a']['33']).toBe(270);
  });

  it('isolates rotations between documents with the same page number', () => {
    writePageRotation('book-a', 20, 90, storage);
    writePageRotation('book-b', 20, 270, storage);

    expect(readPageRotation('book-a', 20, storage)).toBe(90);
    expect(readPageRotation('book-b', 20, storage)).toBe(270);
  });

  it('isolates rotations between pages of the same document', () => {
    writePageRotation('book-a', 1, 90, storage);
    writePageRotation('book-a', 2, 180, storage);

    expect(readPageRotation('book-a', 1, storage)).toBe(90);
    expect(readPageRotation('book-a', 2, storage)).toBe(180);
  });

  it('overwrites an existing rotation for the same page', () => {
    writePageRotation('book-a', 15, 90, storage);
    writePageRotation('book-a', 15, 270, storage);

    expect(readPageRotation('book-a', 15, storage)).toBe(270);
  });

  it('drops the entry when resetting to 0', () => {
    writePageRotation('book-a', 15, 90, storage);
    writePageRotation('book-a', 15, 0, storage);

    expect(readPageRotation('book-a', 15, storage)).toBe(0);
  });

  it('falls back safely for invalid stored rotation values', () => {
    storage.setItem(
      'lexora.pageRotations.v1',
      JSON.stringify({
        version: 1,
        rotations: { 'book-a': { '10': 45, '11': '90', '12': 360 } },
      }),
    );

    expect(readPageRotation('book-a', 10, storage)).toBe(0);
    expect(readPageRotation('book-a', 11, storage)).toBe(0);
    expect(readPageRotation('book-a', 12, storage)).toBe(0);
  });

  it('falls back safely for corrupt JSON', () => {
    storage.setItem('lexora.pageRotations.v1', '{not valid json');
    expect(readPageRotation('book-a', 10, storage)).toBe(0);
  });

  it('falls back safely for an unknown store version', () => {
    storage.setItem(
      'lexora.pageRotations.v1',
      JSON.stringify({ version: 99, rotations: { 'book-a': { '10': 90 } } }),
    );
    expect(readPageRotation('book-a', 10, storage)).toBe(0);
  });

  it('does not crash when stored state is not an object', () => {
    storage.setItem('lexora.pageRotations.v1', '42');
    expect(readPageRotation('book-a', 10, storage)).toBe(0);
  });

  it('preserves untouched pages when writing another page', () => {
    writePageRotation('book-a', 1, 90, storage);
    writePageRotation('book-a', 2, 180, storage);
    writePageRotation('book-a', 1, 270, storage);

    expect(readPageRotation('book-a', 1, storage)).toBe(270);
    expect(readPageRotation('book-a', 2, storage)).toBe(180);
  });
});
