export type ReaderMode = 'classic' | 'interactive';

export const READER_MODE_KEY = 'lexora.readerMode.v1';

export function readReaderMode(
  storage: Pick<Storage, 'getItem'> = localStorage,
): ReaderMode {
  return storage.getItem(READER_MODE_KEY) === 'interactive' ? 'interactive' : 'classic';
}

export function writeReaderMode(
  mode: ReaderMode,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  storage.setItem(READER_MODE_KEY, mode);
}
