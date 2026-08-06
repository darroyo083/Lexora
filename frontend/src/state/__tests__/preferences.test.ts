import { describe, expect, it, vi } from 'vitest';
import {
  readBooleanPreference,
  readOrderingModePreference,
  writeBooleanPreference,
  writeOrderingModePreference,
} from '../preferences';

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

  it('falls back when storage access itself throws', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('storage unavailable');
      }),
    };
    expect(readBooleanPreference('boxes', false, storage)).toBe(false);
  });
});

describe('ordering presentation mode preference', () => {
  it('defaults to floating when nothing is stored', () => {
    const storage = { getItem: vi.fn(() => null) };
    expect(readOrderingModePreference(storage)).toBe('floating');
  });

  it('restores a docked preference', () => {
    const storage = { getItem: vi.fn(() => 'docked') };
    expect(readOrderingModePreference(storage)).toBe('docked');
  });

  it('persists the mode as a stable string', () => {
    const storage = { setItem: vi.fn() };
    writeOrderingModePreference('floating', storage);
    expect(storage.setItem).toHaveBeenCalledWith('lexora.orderingMode', 'floating');
  });

  it('falls back to floating when storage access itself throws', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('storage unavailable');
      }),
    };
    expect(readOrderingModePreference(storage)).toBe('floating');
  });
});
