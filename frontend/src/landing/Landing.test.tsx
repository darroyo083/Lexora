// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Landing from './Landing';

afterEach(cleanup);

describe('portfolio landing', () => {
  it('communicates the product and exposes real project destinations', () => {
    render(<Landing />);

    expect(screen.getByRole('heading', {
      level: 1,
      name: /scanned workbooks.*structured practice/i,
    })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /demo/i })[0].getAttribute('href'))
      .toBe('/demo');
    expect(screen.getByRole('link', { name: /view source/i }).getAttribute('href'))
      .toBe('https://github.com/darroyo083/Lexora');
    expect(screen.getByAltText(/answer lerne marked correct/i).getAttribute('src'))
      .toBe('/release/lexora-interactive.webp');
  });

  it('keeps interaction and architecture detail available to click and focus', () => {
    render(<Landing />);

    const freeText = screen.getByRole('button', { name: /06.*FreeText/i });
    fireEvent.focus(freeText);
    expect(screen.getByText(/open responses stay neutral/i)).toBeTruthy();

    const reader = screen.getByRole('button', { name: /04.*React reader/i });
    fireEvent.click(reader);
    expect(screen.getByText(/one product surface provides guided practice/i)).toBeTruthy();
  });

  it('lists all six supported interaction families without hover dependence', () => {
    render(<Landing />);

    for (const family of [
      'FillBlank', 'Choice', 'ChoiceGrid',
      'SentenceOrdering', 'Matching', 'FreeText',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(`${family}$`, 'i') })).toBeTruthy();
    }
  });
});
