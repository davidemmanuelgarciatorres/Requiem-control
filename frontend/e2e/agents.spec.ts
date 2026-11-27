import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const CSV = [
  'Fecha;Categoría;Monto',
  ...Array.from({ length: 10 }, (_, i) => `${String(i + 1).padStart(2, '0')}/10/2026;Herramienta;${1000 + (i + 1) * 10}`),
  ...Array.from({ length: 5 }, (_, i) => `${String(i + 1).padStart(2, '0')}/11/2026;Pintura;${600 + i + 1}`),
  '06/11/2026;Herramienta;50000',
  '06/11/2026;Herramienta;50000',
].join('\n');

async function importSales(page: Page) {
  await page.goto('/data');
  await page.getByLabel(/Elegir archivo/).setInputFiles({ name: 'ventas.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await expect(page.getByLabel('Rol: Monto')).toHaveValue('amount');
  await page.getByLabel('Rol: Categoría').selectOption('category');
  await page.getByRole('button', { name: 'Confirmar importación' }).click();
  await expect(page.getByText('Resumen por columna')).toBeVisible();
}

async function activateAndRun(page: Page, agent: RegExp) {
  await page.goto('/agents');
  const card = page.getByRole('article', { name: agent });
  await card.getByRole('button', { name: 'Activar' }).click();
  await card.getByRole('button', { name: 'Ejecutar' }).click();
}

test.describe('AI agents (real API + PostgreSQL, simulated AI provider)', () => {
  test('financial analyst: lifecycle, indicators, chart, recommendations and limitations', async ({ page }) => {
    await importSales(page);
    await activateAndRun(page, /Analista financiero/);
    await expect(page.getByText('Completada').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Resumen automático', { exact: true })).toBeVisible();
    await expect(page.getByText(/Periodo analizado: 2026-10-01 a 2026-11-06/)).toBeVisible();
    await expect(page.getByRole('img', { name: 'Total por mes' })).toBeVisible();
    await expect(page.getByText(/Herramienta» concentra/)).toBeVisible();
    await expect(page.getByText(/movimientos tienen importes muy alejados/)).toBeVisible();
    await expect(page.getByText('Este análisis no sustituye la revisión de un contador ni la asesoría fiscal.')).toBeVisible();
    await expect(page.getByText(/Proveedor: mock/)).toBeVisible();
  });

  test('data analyst proposes removing duplicates; nothing changes until approved', async ({ page }) => {
    await importSales(page);
    await activateAndRun(page, /Analista de datos/);
    await expect(page.getByText('Esperando aprobación').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /^Aprobaciones pendientes: 1$/ })).toBeVisible();
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByText('Se eliminó 1 fila; quedan 16.')).toBeVisible();
    await expect(page.getByText('Completada').first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: /^Aprobaciones pendientes: 0$/ })).toBeVisible();
  });

  test('running without roles fails with a clear, recorded explanation', async ({ page }) => {
    await page.goto('/data');
    await page.getByLabel(/Elegir archivo/).setInputFiles({ name: 'notas.csv', mimeType: 'text/csv', buffer: Buffer.from('Nota;Valor\nA;1\nB;2\n') });
    await page.getByRole('button', { name: 'Confirmar importación' }).click();
    await expect(page.getByText('Resumen por columna')).toBeVisible();
    await activateAndRun(page, /Analista financiero/);
    await expect(page.getByRole('alert')).toContainText('no tiene columnas con rol', { timeout: 15_000 });
    await page.goto('/agents');
    await expect(page.getByRole('list', { name: 'Ejecuciones recientes' }).getByText('Falló')).toBeVisible();
  });
});
