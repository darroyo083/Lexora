import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('landing explains the product, loads real evidence, and provides tactile keyboard-safe actions', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', {
    level: 1,
    name: /Scanned workbooks.*Structured practice/i,
  })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Try the real precomputed demo' }))
    .toHaveAttribute('href', '/demo');
  await expect(page.getByRole('link', { name: 'View source' }))
    .toHaveAttribute('href', 'https://github.com/darroyo083/Lexora');
  await expect(page.locator('.landing-shell')).not.toContainText(/OpenCode Go|MiMo/i);
  await expect(page.locator('.landing-kicker span')).toHaveCount(0);

  const evidence = page.getByAltText(/answer lerne marked correct/i);
  await expect(evidence).toBeVisible();
  expect(await evidence.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1440);

  const primary = page.getByRole('link', { name: 'Try the real precomputed demo' });
  await primary.hover();
  await expect(primary).toHaveCSS('transform', /matrix\(1, 0, 0, 1, 0, -3\)/);

  for (let index = 0; index < 8; index += 1) await page.keyboard.press('Tab');
  await expect(primary).toBeFocused();
  await expect(primary).toHaveCSS('outline-style', 'solid');

  await page.getByRole('button', { name: /06 FreeText/i }).click();
  await expect(page.getByText(/Open responses stay neutral/i)).toBeVisible();
  await page.getByRole('button', { name: /04 React reader/i }).click();
  await expect(page.getByText(/One product surface provides guided practice/i)).toBeVisible();

  const video = page.getByLabel('Lexora product demo video, 66 seconds');
  await expect(video).toHaveAttribute('preload', 'metadata');
  await video.hover();
  await expect(page.locator('.video-preview')).toHaveCSS('transform', /matrix\(1, 0, 0, 1, 0, -4\)/);
  await video.focus();
  await expect(page.locator('.video-preview')).toHaveCSS('border-top-color', 'rgb(152, 196, 156)');
});

test('landing stays complete without hover at a touch viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Try the real precomputed demo' })).toBeVisible();
  await page.goto('/#interactions');
  await expect(page.getByRole('button', { name: /01 FillBlank/i })).toBeVisible();
  await expect(page.getByText(/Typed responses mapped to source-backed blank regions/i))
    .toBeVisible();
  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth <= window.innerWidth
  ))).toBe(true);
});

test('keeps essential presentation complete across release viewports', async ({ page }) => {
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 430, height: 932 },
    { width: 390, height: 844 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Try the real precomputed demo' })).toBeVisible();
    await page.locator('#video').scrollIntoViewIfNeeded();
    await expect(page.getByLabel('Lexora product demo video, 66 seconds')).toBeVisible();
    await page.locator('footer').scrollIntoViewIfNeeded();
    await expect(page.getByRole('link', { name: 'GitHub', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  }
});

test('has no automatically detectable WCAG A or AA violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

test('removes decorative landing transitions when reduced motion is requested', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  expect(await page.evaluate(() => (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ))).toBe(true);
  const evidence = page.locator('.hero-evidence');
  await expect(evidence).toHaveCSS('transform', 'none');
  expect(await evidence.evaluate((element) => (
    Number.parseFloat(getComputedStyle(element).transitionDuration)
  ))).toBeLessThanOrEqual(0.001);

  const reducedMotionTargets = [
    ['.landing-wordmark', '.landing-mark'],
    ['.landing-nav-cta', '.landing-nav-cta'],
    ['.landing-button', '.landing-button'],
    ['.transform-rail li', '.transform-rail li > svg'],
    ['.mode-copy > a', '.mode-copy > a svg'],
    ['.mode-image', '.mode-image img'],
    ['.interaction-list button', '.interaction-list button svg'],
    ['.engineering-proof article', '.engineering-proof article'],
    ['.video-preview', '.video-preview'],
    ['.video-caption a', '.video-caption a svg'],
  ] as const;

  for (const [triggerSelector, targetSelector] of reducedMotionTargets) {
    await page.locator(triggerSelector).first().hover();
    await expect(page.locator(targetSelector).first()).toHaveCSS('transform', 'none');
  }
});
