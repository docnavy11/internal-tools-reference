import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';
import { authzTagOf } from '../../src/server/platform/auth/middleware';

// Every endpoint under /api must declare its access rule: requireAuth(),
// requirePermission(...) or publicRoute(). Forgetting one fails this test.
describe('authorization coverage', () => {
  it('every /api endpoint carries an authz marker', () => {
    const app = createApp();
    const groups = new Map<string, string[]>();
    for (const route of app.routes) {
      if (!route.path.startsWith('/api/') || route.method === 'ALL') continue;
      const key = `${route.method} ${route.path}`;
      const tags = groups.get(key) ?? [];
      const tag = authzTagOf(route.handler);
      if (tag) tags.push(tag);
      groups.set(key, tags);
    }
    expect(groups.size).toBeGreaterThan(5);
    const untagged = [...groups.entries()]
      .filter(([, tags]) => tags.length === 0)
      .map(([key]) => key);
    expect(untagged, 'routes without requireAuth/requirePermission/publicRoute').toEqual([]);

    // publicRoute() is only legitimate on the sign-in flow, the client error sink and
    // inbound webhooks. Anything else tagged public is a mistake.
    const allowedPublic = [/^\/api\/auth\//, /^\/api\/client-errors$/, /^\/api\/webhooks\/[^/]+$/];
    const wronglyPublic = [...groups.entries()]
      .filter(([, tags]) => tags.includes('public'))
      .map(([key]) => key)
      .filter((key) => !allowedPublic.some((re) => re.test(key.split(' ')[1]!)));
    expect(wronglyPublic, 'routes marked public outside the allowed set').toEqual([]);
    // The admin side of the webhook inbox must not be public even though its path starts the same way.
    for (const [key, tags] of groups)
      if (/^GET \/api\/webhooks/.test(key)) expect(tags, key).not.toContain('public');
  });
});
