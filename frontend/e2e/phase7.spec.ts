import { expect, test } from './fixtures';

const INVENTORY = [
  'Producto;Existencia;Mínimo;Costo;Último movimiento',
  'Martillo;0;5;120;01/11/2026',
  'Pinza;3;10;90;20/11/2026',
  'Taladro;40;5;900;25/11/2026',
  'Brocha;25;5;30;01/08/2026',
].join('\n');

test.describe('Phase 7 (real API + PostgreSQL)', () => {
  test('inventory: findings, purchase list saved only after approval', async ({ page }) => {
    await page.goto('/data');
    await page.getByLabel(/Elegir archivo/).setInputFiles({ name: 'inventario.csv', mimeType: 'text/csv', buffer: Buffer.from(INVENTORY) });
    await page.getByLabel('Rol: Producto').selectOption('product');
    await page.getByLabel('Rol: Existencia').selectOption('quantity');
    await page.getByLabel('Rol: Costo').selectOption('amount');
    await page.getByLabel('Rol: Último movimiento').selectOption('date');
    await page.getByRole('button', { name: 'Confirmar importación' }).click();
    await expect(page.getByText('Resumen por columna')).toBeVisible();

    await page.goto('/inventory');
    await expect(page.getByText('Cómo preparar tu archivo de inventario')).toBeVisible();
    const card = page.getByRole('article', { name: /Inteligencia de inventario|inventario/i });
    await card.getByRole('button', { name: 'Activar' }).click();
    await card.getByRole('button', { name: 'Ejecutar' }).click();
    await expect(page.getByText('Esperando aprobación').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Lista de compra sugerida' })).toBeVisible();
    await expect(page.getByText(/1 producto no tiene movimiento en más de 60 días/)).toBeVisible();

    await page.goto('/reports');
    await expect(page.getByText('Todavía no hay reportes')).toBeVisible(); // nada se guardó sin aprobación
    await page.goBack();
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByText(/Lista guardada en Reportes/)).toBeVisible();
    await page.getByRole('link', { name: 'Ver reporte' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Lista de compra/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Martillo' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('automations: create, see next run, pause', async ({ page }) => {
    await page.goto('/data');
    await page.getByLabel(/Elegir archivo/).setInputFiles({ name: 'ventas.csv', mimeType: 'text/csv', buffer: Buffer.from('Fecha;Monto\n01/10/2026;100\n02/11/2026;200\n') });
    await page.getByRole('button', { name: 'Confirmar importación' }).click();
    await expect(page.getByText('Resumen por columna')).toBeVisible();
    await page.goto('/automations');
    await expect(page.getByText('Aún no hay automatizaciones')).toBeVisible();
    await page.getByLabel('Agente').selectOption('financial-analyst');
    await page.getByLabel('Nombre').fill('Finanzas cada lunes');
    await page.getByRole('button', { name: 'Crear automatización' }).click();
    await expect(page.getByText('Finanzas cada lunes')).toBeVisible();
    await expect(page.getByText(/Cada Lunes a las 08:00/)).toBeVisible();
    await expect(page.getByText(/Próxima ejecución/)).toBeVisible();
    await page.getByRole('button', { name: 'Pausar: Finanzas cada lunes' }).click();
    await expect(page.getByText('En pausa')).toBeVisible();
  });
});
