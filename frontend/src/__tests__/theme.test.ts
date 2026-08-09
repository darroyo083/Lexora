// @vitest-environment jsdom
//
// Regression guards for PoC 7 runtime theme defects (fix/poc7-theme-runtime-qa):
//   Defect 2: dark-theme FreeText typed answers invisible (.free-text-input used
//             var(--text-primary) = #FAFAFA on a white overlay).
//   Defect 3: light-theme inherited text white-on-white (.app had no explicit
//             color, so descendants inherited the :root dark #FAFAFA).
//
// jsdom cascades index.css and resolves custom-property *values* via
// getComputedStyle(el).getPropertyValue('--x') (computed color returns the raw
// var() token, so the final var() hop is guarded at the declaration level via
// CSSOM cssRules against the real file content).
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');

function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

function ruleWith(selector: string): CSSStyleRule {
  const sheet = document.styleSheets[0];
  for (const rule of Array.from(sheet.cssRules)) {
    if ((rule as CSSStyleRule).selectorText === selector) return rule as CSSStyleRule;
  }
  throw new Error(`CSS rule not found: ${selector}`);
}

function mountApp(theme: 'dark' | 'light'): { app: HTMLDivElement; label: HTMLSpanElement; input: HTMLTextAreaElement } {
  const app = document.createElement('div');
  app.className = 'app';
  app.setAttribute('data-design', 'stitch');
  app.setAttribute('data-theme', theme);
  const label = document.createElement('span');
  label.className = 'item-id';
  label.textContent = 'Response free-text-76-1';
  const input = document.createElement('textarea');
  input.className = 'free-text-input';
  app.append(label, input);
  document.body.appendChild(app);
  return { app, label, input };
}

describe('theme: free-text input readable in dark theme (Defect 2)', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    injectStyles();
  });

  it('.free-text-input color is the fixed dark overlay token, not --text-primary', () => {
    const rule = ruleWith('.free-text-input');
    expect(rule.style.color).toBe('var(--text-overlay-input)');
  });

  it('--text-overlay-input is defined once in :root with the dark literal and never overridden by the light theme', () => {
    expect(ruleWith(':root').style.getPropertyValue('--text-overlay-input')).toBe('#172033');
    expect(ruleWith('.app[data-theme="light"]').style.getPropertyValue('--text-overlay-input')).toBe('');
    expect(css.match(/--text-overlay-input/g)).toHaveLength(3); // 1 definition + 2 usages
  });

  it('renders dark-readable in both themes (custom property resolves to #172033 on the element)', () => {
    for (const theme of ['dark', 'light'] as const) {
      const { input } = mountApp(theme);
      const cs = window.getComputedStyle(input);
      expect(cs.color).toBe('var(--text-overlay-input)');
      expect(cs.getPropertyValue('--text-overlay-input')).toBe('#172033');
      expect(cs.backgroundColor).toBe('rgba(255, 255, 255, 0.85)');
    }
  });

  it('preserves overlay appearance: dashed border, radius, focus background', () => {
    const { input } = mountApp('dark');
    const rule = ruleWith('.free-text-input');
    expect(rule.style.border).toContain('dashed');
    expect(rule.style.borderRadius).toBe('var(--radius-sm)');
    expect(window.getComputedStyle(input).backgroundColor).toBe('rgba(255, 255, 255, 0.85)');
    expect(ruleWith('.free-text-input:focus').style.backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('.blank-input keeps its rendered dark color (same token, unchanged value)', () => {
    const rule = ruleWith('.blank-input');
    expect(rule.style.color).toBe('var(--text-overlay-input)');
    expect(ruleWith(':root').style.getPropertyValue('--text-overlay-input')).toBe('#172033');
  });
});

describe('theme: light-theme inherited text readable (Defect 3)', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    injectStyles();
  });

  it('.app declares an explicit text color via var(--text-primary)', () => {
    expect(ruleWith('.app').style.color).toBe('var(--text-primary)');
  });

  it('light-theme variables are scoped to .app and resolve to the dark text literal there', () => {
    const { app } = mountApp('light');
    expect(window.getComputedStyle(app).getPropertyValue('--text-primary')).toBe('#181E19');
  });

  it('color-less descendants inherit the .app text color in both themes', () => {
    for (const theme of ['dark', 'light'] as const) {
      const { label } = mountApp(theme);
      expect(window.getComputedStyle(label).color).toBe('var(--text-primary)');
    }
  });

  it('dark theme keeps its #FAFAFA text on .app (unchanged from today)', () => {
    const { app } = mountApp('dark');
    expect(window.getComputedStyle(app).getPropertyValue('--text-primary')).toBe('#FAFAFA');
  });
});
