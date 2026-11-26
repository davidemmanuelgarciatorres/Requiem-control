import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Incluye una celda con fórmula para comprobar la neutralización en la exportación CSV.
const CSV = [
  'Fecha;Categoría;Monto',
  ...Array.from({ length: 8 }, (_, i) => `${String(i + 1).padStart(2, '0')}/10/2026;Herramienta;${1000 + i * 10}`),
  ...Array.from({ length: 4 }, (_, i) => `${String(i + 1).padStart(2, '0')}/11/2026;Pintura;${700 + i}`),
  '05/11/2026;=HYPERLINK("http://x");300',
].join('\n');

async function analyze(page: Page) {
  await page.goto('/data');
  await page.getByLabel(/Elegir archivo/).setInputFiles({ name: 'ventas.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await expect(page.getByLabel('Rol: Monto')).toHaveValue('amount');
  await page.getByRole('button', { name: 'Confirmar importación' }).click();
  await expect(page.getByText('Resumen por columna')).toBeVisible();
  const datasetUrl = page.url();
  await page.goto('/agents');
  const card = page.getByRole('article', { name: /Analista financiero/ });
  await card.getByRole('button', { name: 'Activar' }).click();
  await card.getByRole('button', { name: 'Ejecutar' }).click();
  await expect(page.getByText('Completada').first()).toBeVisible({ timeout: 15_000 });
  return datasetUrl;
}

test.describe('Reports and exports (real API + PostgreSQL)', () => {
  test('generate a report, export safe CSV, and see real figures on the dashboard', async ({ page }) => {
    const datasetUrl = await analyze(page);
    await page.getByRole('button', { name: 'Generar reporte' }).click();
    await expect(page).toHaveURL(/\/reports\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: /Análisis financiero · ventas/i })).toBeVisible();
    await expect(page.getByText(/primer reporte de este agente/)).toBeVisible();
    await expect(page.getByText(/ventas \(13 filas\)/i)).toBeVisible();

    const href = await page.getByRole('link', { name: 'Exportar CSV' }).getAttribute('href');
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-disposition']).toContain('attachment');
    const body = await res.text();
    expect(body).toContain('Indicador,Valor,Formato');

    await page.goto(datasetUrl);
    const dsHref = await page.getByRole('link', { name: 'Exportar CSV' }).getAttribute('href');
    const ds = await (await page.request.get(dsHref!)).text();
    expect(ds).toContain(`'=HYPERLINK`);
    expect(ds).not.toMatch(/(^|,)"?=HYPERLINK/m);

    await page.goto('/');
    const live = page.getByTestId('live-dashboard');
    await expect(live.getByText('Último análisis financiero')).toBeVisible();
    await expect(live.getByRole('link', { name: /Análisis financiero · ventas/i })).toBeVisible();

    await page.goto('/reports');
    await expect(page.getByRole('link', { name: /Análisis financiero · ventas/i })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('print view hides the app chrome', async ({ page }) => {
    await analyze(page);
    await page.getByRole('button', { name: 'Generar reporte' }).click();
    await expect(page.getByRole('heading', { name: /Análisis financiero/ })).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.rc-topbar')).toBeHidden();
    await expect(page.locator('.rc-ambient')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Imprimir / PDF' })).toBeHidden();
    await expect(page.getByText('Indicadores')).toBeVisible();
  });
});
