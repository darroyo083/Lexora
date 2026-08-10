import { expect, test } from '@playwright/test';

test('landing explains the product, loads real evidence, and provides tactile keyboard-safe actions', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', {
    level: 1,
    name: /Scanned workbooks.*Structured practice/i,
  })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Try the curated demo' }))
    .toHaveAttribute('href', '/demo');
  await expect(page.getByRole('link', { name: 'View source' }))
    .toHaveAttribute('href', 'https://github.com/darroyo083/Lexora');

  const evidence = page.getByAltText(/answer lerne marked correct/i);
  await expect(evidence).toBeVisible();
  expect(await evidence.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1440);

  const primary = page.getByRole('link', { name: 'Try the curated demo' });
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

  await expect(page.getByRole('link', { name: 'Try the curated demo' })).toBeVisible();
  await page.goto('/#interactions');
  await expect(page.getByRole('button', { name: /01 FillBlank/i })).toBeVisible();
  await expect(page.getByText(/Typed responses mapped to source-backed blank regions/i))
    .toBeVisible();
  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth <= window.innerWidth
  ))).toBe(true);
});

test('removes decorative landing transitions when reduced motion is requested', async ({ page }) => {
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
});
