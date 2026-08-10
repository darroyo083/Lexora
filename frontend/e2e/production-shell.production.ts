import { expect, test } from '@playwright/test';

test('removes developer diagnostics from the production reader shell', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lexora.devMode', 'true'));
  await page.goto('/demo');

  await expect(page.locator('.app')).toHaveAttribute('data-dev-mode', 'false');
  await expect(page.getByRole('button', { name: /Developer Mode/i })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Dev Inspector/i })).toHaveCount(0);
  await expect(page.locator('.dev-view')).toHaveCount(0);

  await page.keyboard.press('Control+Shift+D');
  await expect(page.locator('.app')).toHaveAttribute('data-dev-mode', 'false');
  await expect(page.getByRole('button', { name: /Developer Mode/i })).toHaveCount(0);
});
