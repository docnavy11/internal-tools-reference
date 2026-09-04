import { expect, test } from '@playwright/test';

test.describe('smoke', () => {
  test('home page loads and both status badges reach up', async ({ page }) => {
    // page.request shares the cookie jar with the page, so this signs the browser in.
    await page.request.post('/api/auth/dev', { data: { email: 'admin@local.test' } });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();

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
