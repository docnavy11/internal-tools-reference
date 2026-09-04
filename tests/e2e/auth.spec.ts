import { expect, test, type Page } from '@playwright/test';

// These tests share one database with every other spec file. The first user ever to
// sign in becomes admin, so `beforeAll` claims that slot for admin@local.test before
// any test signs in as somebody else.

const ADMIN = 'admin@local.test';
const MEMBER = 'viewer@local.test';

async function devSignIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Sign in as').fill(email);
  await page.getByRole('button', { name: 'Dev sign in' }).click();
}

function sidebar(page: Page) {
  return page.locator('[data-slot="sidebar"]');
}

test.describe.serial('auth', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/auth/dev', { data: { email: ADMIN } });
    expect(res.ok()).toBeTruthy();
  });

  test('an anonymous visitor is sent to the login page', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('button', { name: 'Dev sign in' })).toBeVisible();
  });

  test('an anonymous visitor comes back to the page they asked for', async ({ page }) => {
    await page.goto('/settings/users');

    await expect(page).toHaveURL('/login?redirect_to=%2Fsettings%2Fusers');

    await page.getByLabel('Sign in as').fill(ADMIN);
    await page.getByRole('button', { name: 'Dev sign in' }).click();

    await expect(page).toHaveURL('/settings/users');
  });

  test('an admin sees the users page and their own row', async ({ page }) => {
    await devSignIn(page, ADMIN);

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();

    await sidebar(page).getByRole('link', { name: 'Users' }).click();

    await expect(page).toHaveURL('/settings/users');

    const adminRow = page.getByRole('row').filter({ hasText: ADMIN });
    await expect(adminRow).toHaveCount(1);
    // Own row: the role shows as a badge because the server refuses self role changes.
    await expect(adminRow.getByText('admin', { exact: true })).toBeVisible();
  });

  test('a member does not see the users page', async ({ page }) => {
    await devSignIn(page, MEMBER);
    await expect(page).toHaveURL('/');

    await expect(sidebar(page).getByRole('link', { name: 'Users' })).toHaveCount(0);

    // A direct URL hit renders the no-access page and stays where it is.
    await page.goto('/settings/users');
    await expect(page).toHaveURL('/settings/users');
    await expect(page.getByText('No access')).toBeVisible();
  });

  test('signing out returns to the login page', async ({ page }) => {
    await devSignIn(page, ADMIN);
    await expect(page).toHaveURL('/');

    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();

    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('button', { name: 'Dev sign in' })).toBeVisible();
  });
});
