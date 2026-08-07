import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(
  fileURLToPath(new URL('../../index.css', import.meta.url)),
  'utf-8',
);

function rule(pattern: RegExp): string {
  const match = css.match(pattern);
  if (!match) return '';
  return match[0];
}

function declarationsFor(selector: string): string {
  const escaped = selector.replace(/\./g, '\\.');
  const start = css.search(new RegExp(escaped));
  if (start === -1) return '';
  const end = css.indexOf('}', start);
  if (end === -1) return '';
  return css.slice(start, end + 1);
}

describe('overlay containing-block geometry contract', () => {
  it('keeps the sr-only live region out of the page flow', () => {
    const block = rule(/\.sr-only\s*\{[^}]*\}/);
    expect(block).toContain('position: absolute');
    expect(block).toContain('width: 1px');
    expect(block).toContain('height: 1px');
  });

  it('keeps the floating ordering layer absolute over the page', () => {
    const block = rule(/\.ordering-floating-layer\s*\{[^}]*\}/);
    expect(block).toContain('position: absolute');
    expect(block).toContain('top: 0');
    expect(block).toContain('left: 0');
    expect(block).toContain('width: 100%');
    expect(block).toContain('height: 100%');
  });

  it('keeps ordering bubbles absolutely positioned', () => {
    const block = rule(/\.ordering-bubble\s*\{[^}]*\}/);
    expect(block).toContain('position: absolute');
  });

  it('keeps the choice selector absolutely positioned', () => {
    const block = rule(/\.choice-selector\s*\{[^}]*\}/);
    expect(block).toContain('position: absolute');
  });

  it('keeps debug boxes absolutely positioned so they never reflow the page', () => {
    for (const selector of [
      '.ordering-exercise-debug',
      '.ordering-prompt-debug',
      '.ordering-item-debug',
      '.matching-exercise-debug',
      '.matching-item-debug',
      '.matching-anchor-debug',
      '.free-text-exercise-debug',
      '.free-text-line-debug',
    ]) {
      const block = declarationsFor(selector);
      expect(block, selector).toContain('position: absolute');
      expect(block, selector).toContain('pointer-events: none');
    }
  });

  it('keeps ordering fragments absolutely positioned over printed text', () => {
    const block = rule(/\.ordering-fragment\s*\{[^}]*\}/);
    expect(block).toContain('position: absolute');
  });

  it('keeps matching item zones, dots and unpair controls styled', () => {
    expect(rule(/\.matching-item-zone\s*\{[^}]*\}/)).toContain('position: absolute');
    expect(rule(/\.matching-item-dot\s*\{[^}]*\}/)).toContain('position: absolute');
    expect(rule(/\.matching-source-dot\s*\{[^}]*\}/)).toContain('position: absolute');
    expect(rule(/\.matching-unpair\s*\{[^}]*\}/)).toContain('position: absolute');
  });

  it('keeps the grid row group out of the overlay coordinate space', () => {
    const block = rule(/\.grid-row-group\s*\{[^}]*\}/);
    expect(block).toContain('position: static');
  });
});

