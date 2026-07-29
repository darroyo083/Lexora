export function readBooleanPreference(
  key: string,
  fallback: boolean,
  storage: Pick<Storage, 'getItem'> = localStorage,
): boolean {
  const value = storage.getItem(key);
  if (value === null) return fallback;
  return value === 'true';
}

export function writeBooleanPreference(
  key: string,
  value: boolean,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  storage.setItem(key, String(value));
}
