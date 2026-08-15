import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('public routes explain the product with real evidence and keyboard-safe actions', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', {
    level: 1,
    name: /Turn workbook exercises into focused practice/i,
  })).toBeVisible();
  const primary = page.getByRole('link', { name: 'Try the demo' });
  await expect(primary).toHaveAttribute('href', '/demo');
  await expect(page.locator('.site-shell')).not.toContainText(/OpenCode Go|MiMo/i);

  const evidence = page.locator('.product-frame video');
  await expect(evidence).toBeVisible();
  expect(await evidence.evaluate((video: HTMLVideoElement) => ({
    muted: video.muted,
    controls: video.controls,
    width: video.videoWidth,
  }))).toMatchObject({ muted: true, controls: false });

  await primary.focus();
  await expect(primary).toBeFocused();
  await expect(primary).toHaveCSS('outline-style', 'solid');

  await page.getByRole('link', { name: 'Explore the product' }).click();
  await expect(page).toHaveURL(/\/product$/);
  await page.getByRole('tab', { name: 'Free text' }).click();
  await page.getByRole('textbox', { name: /Schreibe einen Satz/ }).fill('Am Morgen lerne ich Deutsch.');
  await expect(page.getByText(/Saved locally.*stays ungraded/i)).toBeVisible();

  await page.goto('/how-it-works');
  await expect(page.locator('.static-product-preview video')).toBeVisible();
  await expect(page.getByRole('link', { name: /Open the live demo/ })).toHaveAttribute('href', '/demo');
  await expect(page.locator('video')).toHaveCount(1);

  await page.goto('/inside-lexora');
  await expect(page.getByRole('link', { name: /View source/ }))
    .toHaveAttribute('href', 'https://github.com/darroyo083/Lexora');
});

test('redirects unknown direct navigations to the landing page', async ({ page }) => {
  for (const unknownPath of ['/does-not-exist', '/foo/bar']) {
    await page.goto(unknownPath);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Try the demo' })).toBeVisible();
  }
});

test('product showcase stays complete without hover at a touch viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/product');

  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Fill blank' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Missing verb' })).toBeVisible();
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
    await expect(page.getByRole('link', { name: 'Try the demo' })).toBeVisible();
    await page.goto('/how-it-works');
    await expect(page.locator('.static-product-preview video')).toBeVisible();
    await expect(page.locator('video')).toHaveCount(1);
    await page.goto('/inside-lexora');
    await expect(page.getByRole('link', { name: /View source/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  }
});

test('has no automatically detectable WCAG A or AA violations', async ({ page }) => {
  for (const route of ['/', '/product', '/how-it-works', '/inside-lexora']) {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  }
});

test('removes decorative transition duration when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  expect(await page.evaluate(() => (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ))).toBe(true);

  for (const selector of ['.site-button', '.site-demo-link', '.home-route-grid a']) {
    const target = page.locator(selector).first();
    await target.hover();
    expect(await target.evaluate((element) => (
      Number.parseFloat(getComputedStyle(element).transitionDuration)
    ))).toBeLessThanOrEqual(0.001);
  }
});
