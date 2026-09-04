import { expect, test } from '@playwright/test';

test.describe('smoke', () => {
  test('status page loads and both badges reach up', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Internal tools', { exact: true })).toBeVisible();

    const apiBadge = page.locator('dt:text-is("API") + dd [data-slot="badge"]');
    const dbBadge = page.locator('dt:text-is("Database") + dd [data-slot="badge"]');

    await expect(apiBadge).toHaveText('up');
    await expect(dbBadge).toHaveText('up');
  });

  test('unknown API route returns the JSON error envelope', async ({ request }) => {
    const res = await request.get('/api/does-not-exist');
    expect(res.status()).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe('not_found');
    expect(body.error.requestId).toBe(res.headers()['x-request-id']);
  });

  test('healthz reports ok', async ({ request }) => {
    const res = await request.get('/healthz');
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toEqual({ ok: true });
  });
});
