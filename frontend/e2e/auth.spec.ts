import type { Page } from '@playwright/test';
import { expect, PASSWORD, registerViaApi, test, uniqueEmail } from './fixtures';

/** En móvil el selector de organización vive en el menú lateral. */
async function openOrgSwitcher(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('button', { name: /^Organización:/ }).click();
}
function orgButton(page: Page, name: string) {
  return page.getByRole('button', { name: `Organización: ${name}` });
}

test.describe('authentication & organizations (real API + PostgreSQL)', () => {
  test('anonymous users are sent to login', async ({ anonPage }) => {
    await anonPage.goto('/settings');
    await expect(anonPage).toHaveURL(/\/login$/);
    await expect(anonPage.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
  });

  test('register through the UI, sign out and sign back in', async ({ anonPage: page }) => {
    const email = uniqueEmail('ui');
    await page.goto('/register');
    await page.getByLabel('Nombre completo').fill('Ana López');
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByLabel('Nombre de tu negocio u organización').fill('Ferretería Ana');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByText(/^Hola, Ana\./)).toBeVisible();
    await expect(page.getByText('Operativo').first()).toBeVisible();

    const cookies = await page.context().cookies();
    const session = cookies.find((c) => c.name === 'rc_session');
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe('Lax');

    await page.getByRole('button', { name: 'Perfil' }).click();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña').fill('wrong-password-123');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');

    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByText(/^Hola, Ana\./)).toBeVisible();
  });

  test('settings: rename organization and see it in the switcher', async ({ page, isMobile }) => {
    await page.goto('/settings');
    const name = page.getByLabel('Nombre de la organización');
    await name.fill('Distribuidora Norte');
    await name.locator('xpath=ancestor::form').getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('1 / 3')).toBeVisible(); // miembros usados / límite del plan gratuito
    if (isMobile) await page.getByRole('button', { name: 'Abrir menú' }).click();
    await expect(orgButton(page, 'Distribuidora Norte')).toBeVisible();
  });

  test('create a second organization and switch between them', async ({ page, isMobile }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await openOrgSwitcher(page, isMobile);
    await page.getByPlaceholder('Nombre de la organización').fill('Segunda Sucursal');
    await page.getByRole('button', { name: 'Crear' }).click();
    await expect(orgButton(page, 'Segunda Sucursal')).toBeVisible();
    await orgButton(page, 'Segunda Sucursal').click();
    await page.getByRole('button', { name: /Organización E2E/ }).click();
    await expect(orgButton(page, 'Organización E2E')).toBeVisible();
    expect((await (await page.request.get('/api/organizations')).json()).length).toBe(2);
  });

  test('add a teammate; they can only see the organizations they belong to', async ({ page, browser, isMobile }) => {
    const mateCtx = await browser.newContext({ locale: 'es-MX', viewport: page.viewportSize() ?? undefined, isMobile, hasTouch: isMobile });
    const mate = await mateCtx.newPage();
    const { email: mateEmail, session: mateSession } = await registerViaApi(mate.request, 'Org del Compañero', 'Beto Ruiz');

    await page.goto('/settings');
    await page.getByLabel('Correo del miembro').fill(mateEmail);
    await page.getByRole('button', { name: 'Agregar miembro' }).click();
    await expect(page.getByRole('cell', { name: mateEmail })).toBeVisible();

    // El compañero ve ambas organizaciones; el propietario original NO puede entrar a la del compañero.
    await mate.goto('/');
    await expect(mate.getByRole('heading', { level: 1 })).toBeVisible();
    await openOrgSwitcher(mate, isMobile);
    await expect(mate.getByRole('button', { name: /Organización E2E/ })).toBeVisible();

    const me = await (await page.request.get('/api/auth/me')).json();
    const res = await page.request.post('/api/auth/switch-organization', {
      data: { organization_id: mateSession.active_organization.id },
      headers: { 'X-CSRF-Token': me.csrf_token },
    });
    expect(res.status()).toBe(403);
    await mateCtx.close();
  });

  test('state-changing requests without the CSRF token are rejected', async ({ page }) => {
    const res = await page.request.patch('/api/auth/me', { data: { full_name: 'Hacker' } });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe('auth.csrf');
  });
});
