import { isPageRotation, type PageRotation } from '../reader/rotation';

export const PAGE_ROTATION_KEY = 'lexora.pageRotations.v1';
export const PAGE_ROTATION_VERSION = 1;

export interface PageRotationStore {
  version: 1;
  rotations: Record<string, Record<string, PageRotation>>;
}

export function emptyPageRotationStore(): PageRotationStore {
  return { version: PAGE_ROTATION_VERSION, rotations: {} };
}

export function loadPageRotationStore(
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): PageRotationStore {
  try {
    const raw = storage.getItem(PAGE_ROTATION_KEY);
    if (!raw) return emptyPageRotationStore();
    const parsed = JSON.parse(raw) as PageRotationStore;
    if (parsed?.version !== PAGE_ROTATION_VERSION || !parsed?.rotations) {
      return emptyPageRotationStore();
    }
    return parsed;
  } catch {
    return emptyPageRotationStore();
  }
}

export function readPageRotation(
  bookId: string,
  pageNumber: number,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): PageRotation {
  const value = loadPageRotationStore(storage).rotations[bookId]?.[String(pageNumber)];
  return isPageRotation(value) ? value : 0;
}

export function writePageRotation(
  bookId: string,
  pageNumber: number,
  rotation: PageRotation,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): void {
  const store = loadPageRotationStore(storage);
  const book = { ...(store.rotations[bookId] ?? {}) };
  if (rotation === 0) {
    delete book[String(pageNumber)];
  } else {
    book[String(pageNumber)] = rotation;
  }
  if (Object.keys(book).length === 0) {
    delete store.rotations[bookId];
  } else {
    store.rotations[bookId] = book;
  }
  storage.setItem(PAGE_ROTATION_KEY, JSON.stringify(store));
}
