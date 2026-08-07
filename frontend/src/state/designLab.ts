export type DesignVariant = 'editorial' | 'liquid' | 'interactive' | 'stitch';
export type ThemeMode = 'dark' | 'light';

const DESIGN_VARIANT_KEY = 'lexora.designVariant';
const THEME_MODE_KEY = 'lexora.themeMode';
const DEV_MODE_KEY = 'lexora.devMode';

export function readDesignVariantPreference(): DesignVariant {
  try {
    const val = localStorage.getItem(DESIGN_VARIANT_KEY);
    if (val === 'editorial' || val === 'liquid' || val === 'interactive' || val === 'stitch') {
      return val;
    }
  } catch {
    // Ignore storage errors
  }
  return 'stitch';
}

export function writeDesignVariantPreference(variant: DesignVariant): void {
  try {
    localStorage.setItem(DESIGN_VARIANT_KEY, variant);
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
