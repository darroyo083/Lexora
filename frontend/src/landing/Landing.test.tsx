// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Landing from './Landing';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Lexora public site', () => {
  it('opens a focused home route with real product destinations', () => {
    render(<Landing />);

    expect(screen.getByRole('heading', { level: 1, name: /turn workbook exercises/i })).toBeTruthy();
    const brandLinks = screen.getAllByRole('link', { name: 'Lexora' });
    expect(brandLinks).toHaveLength(2);
    expect(brandLinks.every((link) => link.querySelector('img')?.getAttribute('src') === '/lexora-mark.svg')).toBe(true);
    expect(screen.getAllByRole('link', { name: /open demo|try the demo/i })[0].getAttribute('href')).toBe('/demo');
    expect(screen.getByRole('link', { name: /explore the product/i }).getAttribute('href')).toBe('/product');
    expect(screen.getByText(/one source\. two trustworthy views/i)).toBeTruthy();
    expect(screen.getByText(/bounded context/i)).toBeTruthy();
  });

  it('navigates product routes through history without an anchor-only page', () => {
    render(<Landing />);

    fireEvent.click(screen.getAllByRole('link', { name: 'Product' })[0]);
    expect(window.location.pathname).toBe('/product');
    expect(screen.getByRole('heading', { level: 1, name: /exercise stays whole/i })).toBeTruthy();
    expect(document.title).toBe('Product | Lexora');
    expect(screen.getByRole('heading', { level: 2, name: /help that stays with the exercise/i })).toBeTruthy();
    expect(screen.getByText(/Explain, translate, offer a hint/i)).toBeTruthy();
    expect(screen.getByAltText(/Ask Lexora open beside/i).getAttribute('src')).toBe('/release/lexora-ask.webp');

    fireEvent.click(screen.getAllByRole('link', { name: 'Inside Lexora' })[0]);
    expect(window.location.pathname).toBe('/inside-lexora');
    expect(screen.getByRole('heading', { level: 1, name: /ai at the boundary/i })).toBeTruthy();
    expect(screen.getByText(/provider keys stay server-side/i)).toBeTruthy();
  });

  it('shares a persistent light and dark theme preference', () => {
    render(<Landing />);
    const shell = document.querySelector('.site-shell');
    expect(shell?.getAttribute('data-theme')).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Use light theme' }));
    expect(shell?.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('lexora.themeMode')).toBe('light');
    expect(screen.getByRole('button', { name: 'Use dark theme' })).toBeTruthy();
  });

  it('supports direct deep links and all six real interaction families', () => {
    window.history.replaceState({}, '', '/product');
    render(<Landing />);

    for (const family of ['Fill blank', 'Choice', 'Choice grid', 'Sentence ordering', 'Matching', 'Free text']) {
      expect(screen.getByRole('tab', { name: new RegExp(`^${family}$`, 'i') })).toBeTruthy();
    }
  });

  it('redirects the retired engineering URL to the canonical Inside Lexora route', () => {
    window.history.replaceState({}, '', '/engineering');
    render(<Landing />);

    expect(window.location.pathname).toBe('/inside-lexora');
    expect(screen.getByRole('heading', { level: 1, name: /ai at the boundary/i })).toBeTruthy();
  });

  it('makes matching pair selection explicit and reversible', () => {
    window.history.replaceState({}, '', '/product');
    render(<Landing />);

    fireEvent.click(screen.getByRole('tab', { name: 'Matching' }));

    const bakery = screen.getByRole('button', { name: 'Bäckerei, not paired yet' });
    const bread = screen.getByRole('button', { name: 'Brot' });
    expect(bread.hasAttribute('disabled')).toBe(true);

    fireEvent.click(bakery);
    expect(bread.hasAttribute('disabled')).toBe(false);
    expect(screen.getByText(/matching item for Bäckerei/i)).toBeTruthy();

    fireEvent.click(bread);
    expect(screen.getByRole('button', { name: 'Bäckerei, paired with Brot' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset pairs' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reset pairs' }));
    expect(screen.getByRole('button', { name: 'Bäckerei, not paired yet' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Brot' }).hasAttribute('disabled')).toBe(true);
  });

  it('presents the current product as a quiet micro-loop with a static fallback', () => {
    window.history.replaceState({}, '', '/how-it-works');
    render(<Landing />);

    const preview = screen.getByLabelText(/Current Lexora Interactive Mode/i);
    expect(preview.tagName).toBe('VIDEO');
    expect(preview.hasAttribute('autoplay')).toBe(true);
    expect(preview.hasAttribute('loop')).toBe(true);
    expect(preview.hasAttribute('playsinline')).toBe(true);
    expect(preview.hasAttribute('controls')).toBe(false);
    expect((preview as HTMLVideoElement).muted).toBe(true);
    expect(document.querySelector('video source')?.getAttribute('src')).toBe('/release/lexora-micro-loop.webm');
    expect(screen.getByAltText(/Current Lexora Interactive Mode/i).getAttribute('src')).toBe('/release/lexora-loop-poster.webp');
    expect(screen.getByRole('link', { name: /Open the live demo/ }).getAttribute('href')).toBe('/demo');
  });
});
