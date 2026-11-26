import { expect, test } from '@playwright/test';

const ROUTES = ['/', '/?view=demo', '/agents', '/integrations', '/settings', '/design-system', '/finance'];

test.describe('responsive layout', () => {
  for (const route of ROUTES) {
    test(`no horizontal overflow on ${route}`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('navigation works at this viewport', async ({ page, isMobile }) => {
    await page.goto('/');
    if (isMobile) {
      await expect(page.locator('.rc-sidebar')).toBeHidden();
      await page.getByRole('button', { name: /Abrir menú|Open menu/ }).click();
      await page.getByRole('dialog').getByRole('link', { name: /Agentes IA|AI Agents/ }).click();
    } else {
      await page.locator('.rc-sidebar').getByRole('link', { name: /Agentes IA|AI Agents/ }).click();
    }
    await expect(page).toHaveURL(/\/agents$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Agentes IA|AI Agents/);
  });

  test('demo dashboard renders labelled demo data with no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('/?view=demo');
    await expect(page.getByTestId('demo-banner')).toBeVisible();
    expect(await page.locator('[data-demo-badge]').count()).toBeGreaterThanOrEqual(9);
    expect(errors).toEqual([]);
  });

  test('keyboard users can reach main content via the skip link', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard flow verified on desktop');
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.locator('.rc-skip-link')).toBeFocused();
  });
});
