import { expect, test } from './fixtures';

const CSV = [
  'Fecha;Concepto;Monto',
  '01/10/2026;Ventas;1000', '05/10/2026;Ventas;1500', '10/10/2026;Renta;-800', '15/10/2026;Nómina;-600',
  '01/11/2026;Ventas;700', '05/11/2026;Ventas;600', '10/11/2026;Renta;-800', '15/11/2026;Nómina;-900',
].join('\n');

test.describe('Financial intelligence and AI assistant (real API + PostgreSQL)', () => {
  test('finance from imported movements, then ask the assistant about them', async ({ page }) => {
    await page.goto('/finance');
    await expect(page.getByText('Aún no hay datos financieros')).toBeVisible();

    await page.goto('/data');
    await page.getByLabel(/Elegir archivo/).setInputFiles({ name: 'movimientos.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
    await expect(page.getByLabel('Rol: Monto')).toHaveValue('amount');
    await page.getByLabel('Rol: Concepto').selectOption('category');
    await page.getByRole('button', { name: 'Confirmar importación' }).click();
    await expect(page.getByText('Resumen por columna')).toBeVisible();

    await page.goto('/finance');
    await expect(page.getByText('Ingresos − gastos')).toBeVisible();
    await expect(page.getByText('Comparación 2026-10 → 2026-11')).toBeVisible();
    await expect(page.getByText('Meses con resultado negativo (1): 2026-11.')).toBeVisible();
    await expect(page.getByText('Gastos por «Concepto»')).toBeVisible();
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.goto('/assistant');
    await expect(page.getByText(/Modo simulado/)).toBeVisible();
    await page.getByRole('button', { name: '¿Cuál es mi mayor gasto?' }).click();
    await expect(page.getByText(/Tu mayor gasto es «Renta»/)).toBeVisible();
    await expect(page.getByText('Verificado').first()).toBeVisible();
    await page.getByLabel('Escribe tu pregunta…').fill('¿Qué pueden hacer los agentes?');
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect(page.getByText(/Agentes disponibles hoy/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: /¿Cuál es mi mayor gasto\?/ }).first()).toBeVisible();
    overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test('integrations without Google credentials on the server never pretend to be connected', async ({ page }) => {
  await page.goto('/integrations');
  await expect(page.getByText(/Google todavía no está configurado en el servidor/)).toBeVisible();
  await expect(page.getByText('No conectado')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conectar con Google' })).toBeDisabled();
  const r = await page.request.post('/api/integrations/google/connect', { data: { services: ['sheets'] } });
  expect(r.status()).toBe(403); // sin token CSRF ni configuración: nunca llega a Google
});

test('technical notices live only in Settings → System status (owner)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pon tu negocio bajo control' })).toBeVisible();
  await expect(page.getByText('Base de datos')).toHaveCount(0);
  await expect(page.getByText(/Fase \d de 8/)).toHaveCount(0);
  await page.goto('/settings');
  const card = page.getByRole('heading', { name: 'Estado del sistema' }).locator('xpath=ancestor::section[1]');
  await expect(page.getByRole('heading', { name: 'Estado del sistema' })).toBeVisible();
  await expect(card.getByText('Respuestas automáticas (sin IA de pago)')).toBeVisible();
  await expect(card.getByText(/GOOGLE_OAUTH_CLIENT_ID/)).toBeVisible();
});
