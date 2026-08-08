export type ThemeMode = 'dark' | 'light';

const DESIGN_VARIANT_KEY = 'lexora.designVariant';
const THEME_MODE_KEY = 'lexora.themeMode';
const DEV_MODE_KEY = 'lexora.devMode';

const OBSOLETE_DESIGN_VARIANTS = new Set(['editorial', 'liquid', 'interactive', 'plum', 'sage']);

/**
 * One-time migration for the retired Design Lab.
 *
 * The product has a single design system (Stitch / Obsidian). Older sessions
 * may still hold an experimental variant in localStorage; rewrite any
 * obsolete value so it can never resurrect an A/B/C design.
 */
export function migrateDesignVariantPreference(): void {
  try {
    const val = localStorage.getItem(DESIGN_VARIANT_KEY);
    if (val === null || val === 'stitch') return;
    if (OBSOLETE_DESIGN_VARIANTS.has(val)) {
      localStorage.setItem(DESIGN_VARIANT_KEY, 'stitch');
    }
  } catch {
    // Ignore storage errors
  }
}

export function readThemeModePreference(): ThemeMode {
  try {
    const val = localStorage.getItem(THEME_MODE_KEY);
    if (val === 'light') return 'light';
  } catch {
    // Ignore storage errors
  }
  return 'dark';
}

export function writeThemeModePreference(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_MODE_KEY, mode);
  } catch {
    // Ignore storage errors
  }
}

export function readDevModePreference(): boolean {
  try {
    const val = localStorage.getItem(DEV_MODE_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

export function writeDevModePreference(devMode: boolean): void {
  try {
    localStorage.setItem(DEV_MODE_KEY, String(devMode));
  } catch {
    // Ignore storage errors
  }
}
