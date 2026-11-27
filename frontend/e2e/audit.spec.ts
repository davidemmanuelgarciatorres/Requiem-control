import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

const ROUTES = ['/', '/assistant', '/agents', '/automations', '/finance', '/data', '/inventory', '/customers', '/email', '/reports',
  '/integrations', '/settings'];

test.describe('design audit: every screen', () => {
  test('no console errors, no horizontal overflow and no serious accessibility violations', async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${page.url()}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
    // Datos para que las pantallas no estén vacías.
    await page.goto('/data');
    await page.getByLabel(/Elegir archivo/).setInputFiles({ name: 'ventas.csv', mimeType: 'text/csv',
      buffer: Buffer.from('Fecha;Categoría;Monto\n01/10/2026;A;100\n02/11/2026;B;-50\n03/11/2026;A;300\n') });
    await page.getByRole('button', { name: 'Confirmar importación' }).click();
    await expect(page.getByText('Resumen por columna')).toBeVisible();

    const problems: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) problems.push(`${route}: desborde horizontal de ${overflow}px`);
      const axe = await new AxeBuilder({ page }).exclude('canvas').disableRules(['region']).analyze();
      for (const v of axe.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) {
        problems.push(`${route}: [${v.impact}] ${v.id} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      }
    }
    expect(errors, errors.join('\n')).toEqual([]);
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('tapping a button shows no blue highlight rectangle', async ({ page }) => {
    await page.goto('/settings');
    const btn = page.getByRole('button', { name: 'Perfil' });
    const color = await btn.evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-tap-highlight-color'));
    expect(color.replace(/\s/g, '')).toBe('rgba(0,0,0,0)');
    if (test.info().project.use.hasTouch) await btn.tap(); else await btn.click();
    const ring = await btn.evaluate((el) => `${getComputedStyle(el).outlineStyle} ${getComputedStyle(el).boxShadow}`);
    expect(ring).toBe('none none');
  });
});

test('the internal design system is not published and no build-process text is visible', async ({ page }) => {
  await page.goto('/design-system');
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
  for (const route of ['/', '/agents', '/settings', '/integrations', '/inventory']) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    const text = await page.locator('body').innerText();
    expect(text, route).not.toMatch(/\bFase \d|\bMVP\b|previst|Versión 0|Codespaces|sin servidor/);
  }
  await expect(page.getByRole('link', { name: 'Sistema de diseño' })).toHaveCount(0);
});
