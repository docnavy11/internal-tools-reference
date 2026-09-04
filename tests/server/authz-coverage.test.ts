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
  });
});
