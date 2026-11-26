import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Fondo: la Tierra girando (WebGL2). El reloj del navegador se controla con
 * page.clock para fijar la fase de rotación (derivada del reloj de pared).
 */
const T0 = Date.UTC(2026, 10, 26, 0, 0, 0); // múltiplo exacto de 120 s → fase 0

async function frameAt(page: Page, time: number): Promise<string> {
  await page.clock.setFixedTime(time);
  await page.clock.runFor(100); // deja pasar al menos un fotograma
  await page.waitForTimeout(150);
  return page.locator('.rc-earth__canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL('image/png'));
}

async function openGlobe(page: Page) {
  await page.clock.install({ time: T0 });
  await page.goto('/login');
  await page.clock.runFor(200);
  await expect(page.locator('.rc-earth')).toHaveAttribute('data-status', 'ready', { timeout: 15_000 });
}

/** Analiza el disco: brillo medio de la mitad derecha (día) y píxeles de luces de ciudad en la izquierda (noche). */
function analyse(page: Page) {
  return page.locator('.rc-earth__canvas').evaluate((c: HTMLCanvasElement) => {
    const ctx = Object.assign(document.createElement('canvas'), { width: c.width, height: c.height }).getContext('2d')!;
    ctx.drawImage(c, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    const r = Math.min(width, height) * 0.44;
    const cx = width / 2;
    const cy = height / 2;
    let dayLum = 0, dayN = 0, cityLights = 0, nightLum = 0, nightN = 0;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const dx = (x - cx) / r, dy = (y - cy) / r;
        if (dx * dx + dy * dy > 0.85) continue; // sin el borde atmosférico
        const i = (y * width + x) * 4;
        const R = data[i]!, G = data[i + 1]!, B = data[i + 2]!;
        const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
        if (dx > 0.45) { dayLum += lum; dayN++; }
        if (dx < -0.35) {
          nightLum += lum; nightN++;
          if (R > 110 && R > B + 40 && G > B) cityLights++; // punto cálido brillante
        }
      }
    }
    return { day: dayLum / dayN, night: nightLum / nightN, cityLights };
  });
}

test.describe('Earth background', () => {
  test('renders with WebGL2 and documents its 120 s cycle', async ({ anonPage: page }) => {
    await openGlobe(page);
    await expect(page.getByTestId('ambient')).toHaveAttribute('data-cycle-seconds', '120');
    await expect(page.getByTestId('earth-canvas')).toHaveAttribute('data-cycle-ms', '120000');
  });

  test('rotates and returns to exactly the same frame after 120 s', async ({ anonPage: page }) => {
    await openGlobe(page);
    const start = await frameAt(page, T0);
    const quarter = await frameAt(page, T0 + 30_000);
    const full = await frameAt(page, T0 + 120_000);
    expect(quarter).not.toBe(start);
    expect(full).toBe(start);
  });

  test('day side is lit; night side is dark with city lights', async ({ anonPage: page }) => {
    await openGlobe(page);
    // Fase 0: África al centro (día); América en el lado izquierdo (noche).
    await frameAt(page, T0);
    const m = await analyse(page);
    expect(m.day).toBeGreaterThan(40);
    expect(m.night).toBeLessThan(m.day / 3);
    expect(m.cityLights).toBeGreaterThan(40);
  });

  test('reduced motion (OS): a single still frame, no rotation', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', locale: 'es-MX' });
    const page = await ctx.newPage();
    await openGlobe(page);
    const a = await frameAt(page, T0 + 5_000);
    const b = await frameAt(page, T0 + 35_000);
    expect(b).toBe(a);
    await ctx.close();
  });

  test('in-app reduced-motion preference also stops the rotation', async ({ page }) => {
    await page.clock.install({ time: T0 });
    await page.goto('/settings');
    await page.clock.runFor(200);
    await page.getByRole('button', { name: /^(Reducido|Reduced)$/ }).click();
    await expect(page.locator('.rc-earth')).toHaveAttribute('data-status', 'ready', { timeout: 15_000 });
    const a = await frameAt(page, T0 + 5_000);
    const b = await frameAt(page, T0 + 35_000);
    expect(b).toBe(a);
  });
});
