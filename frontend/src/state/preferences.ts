export function readBooleanPreference(
  key: string,
  fallback: boolean,
  storage: Pick<Storage, 'getItem'> = localStorage,
): boolean {
  try {
    const value = storage.getItem(key);
    if (value === null) return fallback;
    return value === 'true';
  } catch {
    return fallback;
  }
}

export function writeBooleanPreference(
  key: string,
  value: boolean,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  storage.setItem(key, String(value));
}

export const ORDERING_MODE_KEY = 'lexora.orderingMode';

export function readOrderingModePreference(
  storage: Pick<Storage, 'getItem'> = localStorage,
): 'floating' | 'docked' {
  try {
    return storage.getItem(ORDERING_MODE_KEY) === 'docked' ? 'docked' : 'floating';
  } catch {
    return 'floating';
  }
}

export function writeOrderingModePreference(
  value: 'floating' | 'docked',
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  storage.setItem(ORDERING_MODE_KEY, value);
}
