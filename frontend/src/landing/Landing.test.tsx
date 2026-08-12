// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Landing from './Landing';

beforeEach(() => {
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
    expect(screen.getAllByRole('link', { name: /open demo|try the demo/i })[0].getAttribute('href')).toBe('/demo');
    expect(screen.getByRole('link', { name: /explore the product/i }).getAttribute('href')).toBe('/product');
    expect(screen.getByText(/one source\. two trustworthy views/i)).toBeTruthy();
    expect(screen.getByText(/ambiguous answers stay neutral/i)).toBeTruthy();
  });

  it('navigates product routes through history without an anchor-only page', () => {
    render(<Landing />);

    fireEvent.click(screen.getAllByRole('link', { name: 'Product' })[0]);
    expect(window.location.pathname).toBe('/product');
    expect(screen.getByRole('heading', { level: 1, name: /exercise stays whole/i })).toBeTruthy();
    expect(document.title).toBe('Product | Lexora');

    fireEvent.click(screen.getAllByRole('link', { name: 'Engineering' })[0]);
    expect(screen.getByRole('heading', { level: 1, name: /ai at the boundary/i })).toBeTruthy();
    expect(screen.getByText(/no provider credential/i)).toBeTruthy();
  });

  it('supports direct deep links and all six real interaction families', () => {
    window.history.replaceState({}, '', '/product');
    render(<Landing />);

    for (const family of ['Fill blank', 'Choice', 'Choice grid', 'Sentence ordering', 'Matching', 'Free text']) {
      expect(screen.getByRole('tab', { name: new RegExp(`^${family}$`, 'i') })).toBeTruthy();
    }
  });

  it('uses the existing video asset through custom controls', () => {
    window.history.replaceState({}, '', '/how-it-works');
    render(<Landing />);

    const video = screen.getByLabelText('Lexora product walkthrough, 66 seconds');
    expect(video.getAttribute('poster')).toBe('/release/lexora-demo-poster.png');
    expect(video.querySelector('source')?.getAttribute('src')).toBe('/release/lexora-demo.mp4');
    expect(video.hasAttribute('controls')).toBe(false);
    expect(screen.getByRole('button', { name: 'Play video' })).toBeTruthy();
  });
});
