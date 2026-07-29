import { describe, expect, it, vi } from 'vitest';
import { readBooleanPreference, writeBooleanPreference } from '../preferences';

describe('boolean preferences', () => {
  it('uses the fallback when no value is stored', () => {
    const storage = { getItem: vi.fn(() => null) };
    expect(readBooleanPreference('boxes', true, storage)).toBe(true);
  });

  it('restores an enabled preference', () => {
    const storage = { getItem: vi.fn(() => 'true') };
    expect(readBooleanPreference('boxes', false, storage)).toBe(true);
  });

  it('persists a boolean as a stable string', () => {
    const storage = { setItem: vi.fn() };
    writeBooleanPreference('boxes', true, storage);
    expect(storage.setItem).toHaveBeenCalledWith('boxes', 'true');
  });
});
