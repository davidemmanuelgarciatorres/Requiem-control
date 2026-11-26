import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

export const PASSWORD = 'correct-horse-battery';

export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Registra una cuenta real en la API. Las cookies quedan en el contexto del navegador. */
export async function registerViaApi(request: APIRequestContext, org = 'Organización E2E', name = 'Prueba E2E') {
  const email = uniqueEmail();
  const res = await request.post('/api/auth/register', {
    data: { email, password: PASSWORD, full_name: name, organization_name: org, preferred_language: 'es' },
  });
  expect(res.status(), await res.text()).toBe(201);
  return { email, session: await res.json() };
}

/** `page` ya autenticada con una cuenta nueva; `anonPage` sin sesión. */
export const test = base.extend<{ anonPage: Page }>({
  page: async ({ page }, use) => {
    await registerViaApi(page.request);
    await use(page);
  },
  anonPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await use(p);
    await ctx.close();
  },
});

export { expect };
