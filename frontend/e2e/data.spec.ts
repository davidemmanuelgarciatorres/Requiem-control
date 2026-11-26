import { expect, test } from './fixtures';

const CSV = [
  'Fecha;Cliente;Producto;Monto',
  '01/10/2026;Ana;Martillo;$1,200.00',
  '02/10/2026;Luis;Pinzas;$350.50',
  '02/10/2026;Luis;Pinzas;$350.50',
  '03/10/2026;;Taladro;$2,100.00',
  'fecha mala;Eva;Llave;$90',
].join('\n');

test.describe('Data Analyst (real API + PostgreSQL)', () => {
  test('import a CSV: preview, explained findings, mapping, report and rows', async ({ page }) => {
    await page.goto('/data');
    await expect(page.getByText('Todavía no has importado datos.')).toBeVisible();
    await page.getByLabel(/Elegir archivo/).setInputFiles({ name: 'ventas-octubre.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf-8') });

    await expect(page.getByRole('heading', { level: 1, name: 'ventas-octubre.csv' })).toBeVisible();
    await expect(page.getByText(/Separador: «;»/)).toBeVisible();
    await expect(page.getByText('Filas duplicadas')).toBeVisible();
    await expect(page.getByText('Valores faltantes en «Cliente»')).toBeVisible();
    await expect(page.getByText('Valores inconsistentes en «Fecha»')).toBeVisible();
    await expect(page.getByLabel('Tipo: Monto')).toHaveValue('number');
    await expect(page.getByLabel('Rol: Monto')).toHaveValue('amount');

    await page.getByLabel('Nombre: Monto').fill('Importe');
    await page.getByLabel('Incluir: Producto').uncheck();
    await page.getByLabel('Nombre del conjunto de datos').fill('Ventas octubre');
    await page.getByRole('button', { name: 'Confirmar importación' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Ventas octubre' })).toBeVisible();
    await expect(page.getByText('Valores sin convertir: 1')).toBeVisible();
    await expect(page.getByText('1–5 de 5')).toBeVisible();
    const dataTable = page.locator('.rc-table--data');
    await expect(dataTable.getByRole('columnheader', { name: 'Importe' })).toBeVisible();
    await expect(dataTable.getByRole('columnheader', { name: 'Producto' })).toHaveCount(0);
    await expect(dataTable.getByText('1,200')).toBeVisible();

    await page.getByRole('link', { name: 'Volver a Analista de datos' }).click();
    await expect(page.getByRole('list', { name: 'Conjuntos de datos' }).getByText('Ventas octubre')).toBeVisible();
  });

  test('a disguised file is rejected with a clear message', async ({ page }) => {
    await page.goto('/data');
    await page.getByLabel(/Elegir archivo/).setInputFiles({ name: 'ventas.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('no soy un excel') });
    await expect(page.getByRole('alert')).toHaveText('El contenido del archivo no coincide con su extensión.');
  });
});
