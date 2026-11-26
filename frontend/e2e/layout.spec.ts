import { expect, test } from './fixtures';

const ROUTES = ['/', '/?view=demo', '/data', '/agents', '/integrations', '/settings', '/design-system', '/finance'];

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
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('.rc-skip-link')).toBeFocused();
  });
});

test.describe('narrow phones (360 px)', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test('every top-bar button stays inside the bar', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const bar = (await page.locator('.rc-topbar').boundingBox())!;
    for (const button of await page.locator('.rc-topbar button').all()) {
      if (!(await button.isVisible())) continue;
      const bb = (await button.boundingBox())!;
      expect(bb.x).toBeGreaterThanOrEqual(bar.x);
      expect(bb.x + bb.width).toBeLessThanOrEqual(bar.x + bar.width);
    }
  });

  test('panels open fully inside the screen and can be closed', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    for (const name of [/^Aprobaciones pendientes/, /^Notificaciones/, /^Perfil$/]) {
      await page.locator('.rc-topbar').getByRole('button', { name }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await page.waitForTimeout(700); // fin de la animación de entrada
      const bb = (await dialog.boundingBox())!;
      expect(bb.x).toBeGreaterThanOrEqual(0);
      expect(bb.x + bb.width).toBeLessThanOrEqual(360);
      await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  });
});
