import path from 'node:path';
import { expect, test } from './fixtures';

const asset = (name: string) => path.resolve(process.cwd(), 'e2e', 'assets', name);

test.describe('floating images (real API + browser canvas)', () => {
  test('tapping "Agregar imagen" opens the device file/gallery picker', async ({ page }) => {
    await page.goto('/settings');
    const add = page.locator('label.rc-file-label');
    await add.scrollIntoViewIfNeeded();
    const chooser = page.waitForEvent('filechooser');
    await add.click();
    const fc = await chooser;
    expect(fc.isMultiple()).toBe(false);
    await fc.setFiles(asset('floater-a.png'));
    await expect(page.getByRole('dialog', { name: 'Recorta tu imagen' })).toBeVisible();
  });

  test('crop, upload up to 3 images and see them on screen', async ({ page }) => {
    await page.goto('/settings');
    for (const name of ['floater-a.png', 'floater-b.png', 'floater-c.png']) {
      await page.locator('input[type=file][accept="image/*"]').setInputFiles(asset(name));
      const dialog = page.getByRole('dialog', { name: 'Recorta tu imagen' });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('slider').fill('1.5');
      await dialog.getByRole('button', { name: 'Usar imagen' }).click();
      await expect(dialog).toBeHidden();
    }
    await expect(page.getByRole('img', { name: /Imagen flotante/ })).toHaveCount(3);
    await expect(page.getByText('Ya tienes 3 imágenes. Quita una para agregar otra.')).toBeVisible();
    await expect(page.getByTestId('floaters-layer')).toHaveAttribute('data-count', '3');

    // El servidor devolvió una imagen pequeña (≤ 256 px) en WebP.
    const res = await page.request.get((await page.getByRole('img', { name: 'Imagen flotante 1' }).getAttribute('src'))!);
    expect(res.headers()['content-type']).toBe('image/webp');
    expect((await res.body()).length).toBeLessThan(40_000);
  });

  test('preferences persist and images are drawn (still frame with reduced motion)', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', locale: 'es-MX' });
    const page = await ctx.newPage();
    const email = `fl-${Date.now()}@example.com`;
    await page.request.post('/api/auth/register', { data: { email, password: 'correct-horse-battery', full_name: 'Ana', organization_name: 'Org' } });
    await page.goto('/settings');
    await page.locator('input[type=file][accept="image/*"]').setInputFiles(asset('floater-a.png'));
    await page.getByRole('dialog').getByRole('button', { name: 'Usar imagen' }).click();
    await page.getByRole('button', { name: 'Estrellas' }).click();
    // Guardado diferido: esperar a que el servidor confirme las preferencias finales.
    const saved = page.waitForResponse((r) => r.url().includes('/api/me/preferences/floaters') && r.request().method() === 'PUT'
      && (r.request().postData() ?? '').includes('"size":120') && r.ok());
    await page.getByRole('slider', { name: /Tamaño/ }).fill('120');
    await saved;
    await page.reload();
    await expect(page.getByRole('button', { name: 'Estrellas' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('120 px')).toBeVisible();
    await page.waitForTimeout(500);
    const opaque = await page.getByTestId('floaters-layer').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 16) if (d[i]! > 200) n++;
      return n;
    });
    expect(opaque).toBeGreaterThan(500); // la imagen se dibujó
    await ctx.close();
  });

  test('the layer never blocks taps or clicks', async ({ page }) => {
    await page.goto('/settings');
    await page.locator('input[type=file][accept="image/*"]').setInputFiles(asset('floater-b.png'));
    await page.getByRole('dialog').getByRole('button', { name: 'Usar imagen' }).click();
    await page.getByRole('slider', { name: /Tamaño/ }).fill('120');
    await expect(page.getByTestId('floaters-layer')).toHaveCSS('pointer-events', 'none');
    // Los controles bajo la capa (que está delante) siguen respondiendo.
    for (const name of ['Corazones', 'Chispas', 'Onda']) {
      await page.getByRole('button', { name }).click();
      await expect(page.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
    }
  });
});
