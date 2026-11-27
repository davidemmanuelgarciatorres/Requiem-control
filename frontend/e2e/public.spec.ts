import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { expect, PASSWORD, registerViaApi, test, uniqueEmail } from './fixtures';

// Preparación de la prueba con el rol propietario (las invitaciones tienen RLS).
const DB = process.env.E2E_OWNER_DATABASE_URL ?? 'postgresql://requiem_owner:requiem_owner_dev@localhost:5432/requiem_control_e2e';
/** Los enlaces de correo no son accesibles desde el navegador: la prueba fija un token conocido (solo su hash va a la BD). */
const sql = (q: string) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAtc', q], { encoding: 'utf8' });

test.describe('public pages', () => {
  test('landing, legal and auth pages are accessible and fit on screen', async ({ anonPage: page }) => {
    const problems: string[] = [];
    for (const route of ['/', '/privacy', '/terms', '/login', '/register', '/forgot-password']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) problems.push(`${route}: desborde horizontal de ${overflow}px`);
      const axe = await new AxeBuilder({ page }).exclude('canvas').disableRules(['region']).analyze();
      for (const v of axe.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) {
        problems.push(`${route}: [${v.impact}] ${v.id} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: /Tu negocio, bajo control/ })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Premium' })).toContainText('400');
  });

  test('password recovery end to end', async ({ anonPage: page }) => {
    const { email } = await registerViaApi(page.context().request);
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(page.getByRole('status')).toContainText(`Si existe una cuenta con ${email}`);
    const raw = `e2e-${Date.now()}-reset-token`;
    sql(`UPDATE auth_tokens SET token_hash = sha256(convert_to('${raw}', 'UTF8')) WHERE purpose = 'password_reset' AND used_at IS NULL
         AND user_id = (SELECT id FROM users WHERE email = '${email}')`);
    await page.goto(`/reset-password?token=${raw}`);
    await page.getByLabel('Contraseña nueva').fill('una-clave-nueva-larga');
    await page.getByLabel('Confirma la contraseña').fill('una-clave-nueva-larga');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByRole('status')).toContainText('Tu contraseña se actualizó');
    await page.getByRole('link', { name: 'Iniciar sesión' }).click();
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByRole('alert')).toContainText('incorrectos'); // la anterior ya no sirve
    await page.getByLabel('Contraseña', { exact: true }).fill('una-clave-nueva-larga');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByRole('heading', { name: 'Pon tu negocio bajo control' })).toBeVisible();
  });

  test('a new teammate joins through an email invitation', async ({ page, anonPage }) => {
    const invitee = uniqueEmail('invitee');
    await page.goto('/settings');
    await page.getByLabel('Correo del miembro').fill(invitee);
    await page.getByRole('button', { name: 'Agregar miembro' }).click();
    await expect(page.getByText(`Invitación enviada a ${invitee}.`)).toBeVisible();
    const raw = `e2e-${Date.now()}-invite-token`;
    sql(`UPDATE invitations SET token_hash = sha256(convert_to('${raw}', 'UTF8')) WHERE email = '${invitee}'`);

    await anonPage.goto(`/invite?token=${raw}`);
    await expect(anonPage.getByText(/Te invitaron a unirte a Organización E2E/)).toBeVisible();
    await anonPage.getByLabel('Nombre completo').fill('Nuevo Integrante');
    await anonPage.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await anonPage.getByRole('button', { name: 'Crear cuenta y unirme' }).click();
    await expect(anonPage.getByRole('heading', { name: 'Pon tu negocio bajo control' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('cell', { name: invitee })).toBeVisible();
  });
});
