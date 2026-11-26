import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError, type SessionInfo } from './api';
import { DEMO_EMAIL, DEMO_PASSWORD, handleDemo, resetDemo } from './demoApi';

describe('demo API (serverless demo build only)', () => {
  beforeEach(async () => {
    await resetDemo();
  });

  it('signs in with the demo account and rejects wrong passwords', async () => {
    await expect(handleDemo('GET', '/auth/me', undefined)).rejects.toMatchObject({ status: 401 });
    await expect(handleDemo('POST', '/auth/login', { email: DEMO_EMAIL, password: 'nope' })).rejects.toBeInstanceOf(ApiError);
    const s = (await handleDemo('POST', '/auth/login', { email: DEMO_EMAIL, password: DEMO_PASSWORD })) as SessionInfo;
    expect(s.active_organization?.name).toBe('Ferretería del Centro');
    expect(s.role).toBe('owner');
  });

  it('applies the same rules as the server: member limit and last owner', async () => {
    await handleDemo('POST', '/auth/login', { email: DEMO_EMAIL, password: DEMO_PASSWORD });
    await handleDemo('POST', '/organizations/current/members', { email: 'dario@ejemplo.mx', role: 'member' });
    await expect(handleDemo('POST', '/organizations/current/members', { email: 'elena@ejemplo.mx' })).rejects.toMatchObject({ status: 402, code: 'plan.max_members' });
    await expect(handleDemo('PATCH', '/organizations/current/members/m-1', { role: 'admin' })).rejects.toMatchObject({ code: 'members.last_owner' });
  });

  it('a viewer cannot manage members', async () => {
    await handleDemo('POST', '/auth/login', { email: DEMO_EMAIL, password: DEMO_PASSWORD });
    await handleDemo('POST', '/auth/switch-organization', { organization_id: 'org-demo-2' });
    await expect(handleDemo('POST', '/organizations/current/members', { email: 'carla@ejemplo.mx' })).rejects.toMatchObject({ status: 403 });
  });
});
