import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// The command palette: navigation entries the user may see, plus the records of every
// feature that registered a palette source.
//
// These specs share one database with every other spec file, so the customer created
// here gets a unique suffix and nothing is asserted about rows this file did not create.
// The first user ever to sign in becomes admin, so `beforeAll` claims that slot for
// admin@local.test before any test signs in as somebody else.

const ADMIN = 'admin@local.test';
const VIEWER = 'viewer-palette@local.test';

const suffix = () => Math.random().toString(36).slice(2, 8);

async function signIn(context: APIRequestContext, email: string) {
  const res = await context.post('/api/auth/dev', { data: { email } });
  expect(res.ok()).toBeTruthy();
}

/** Ctrl+K from anywhere on the page; the listener is on the window. */
async function openPalette(page: Page) {
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox')).toBeFocused();
  return dialog;
}

test.describe.serial('command palette', () => {
  test.beforeAll(async ({ request }) => {
    await signIn(request, ADMIN);
  });

  test('an admin finds a customer through the palette and opens it', async ({ page }) => {
    await signIn(page.request, ADMIN);

    const name = `Palette ${suffix()}`;
    const created = await page.request.post('/api/customers', {
      data: { name, email: null, status: 'lead', plan: 'free', tags: [] },
    });
    expect(created.status()).toBe(201);
    const customer = (await created.json()) as { id: string };

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();

    const dialog = await openPalette(page);

    // With an empty query the palette is the navigation, filtered by permission.
    await expect(dialog.getByRole('option', { name: 'Home' })).toBeVisible();
    await expect(dialog.getByRole('option', { name: 'Customers' })).toBeVisible();
    await expect(dialog.getByRole('option', { name: 'Users' })).toBeVisible();

    // Two characters or more also searches every registered source.
    await dialog.getByRole('combobox').fill(name);
    const option = dialog.getByRole('option', { name });
    await expect(option).toBeVisible();

    // No navigation entry matches this query, so the record is the first item and Enter
    // opens it.
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/customers/${customer.id}`);
    await expect(page.getByRole('heading', { name })).toBeVisible();
  });

  test('the arrow keys move the highlight and Escape closes the palette', async ({ page }) => {
    await signIn(page.request, ADMIN);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();

    const dialog = await openPalette(page);
    const options = dialog.getByRole('option');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(options.first()).toHaveAttribute('aria-selected', 'false');

    await page.keyboard.press('ArrowUp');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('the top bar trigger opens the same palette', async ({ page }) => {
    await signIn(page.request, ADMIN);
    await page.goto('/');

    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('dialog').getByRole('combobox')).toBeFocused();
  });

  test('a viewer only sees the entries their role allows', async ({ page, request }) => {
    // `request` is a separate cookie jar, so the admin stays signed in there while the
    // browser is signed in as the viewer.
    await signIn(request, ADMIN);
    await signIn(page.request, VIEWER);

    const found = await request.get(`/api/users?q=${encodeURIComponent(VIEWER)}`);
    expect(found.ok()).toBeTruthy();
    const viewerId = ((await found.json()) as { items: { id: string }[] }).items[0]!.id;
    const patched = await request.patch(`/api/users/${viewerId}`, { data: { role: 'viewer' } });
    expect(patched.ok()).toBeTruthy();

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();

    const dialog = await openPalette(page);
    await expect(dialog.getByRole('option', { name: 'Home' })).toBeVisible();
    await expect(dialog.getByRole('option', { name: 'Customers' })).toBeVisible();

    // The settings group needs permissions a viewer does not have.
    for (const hidden of ['General', 'Users', 'Audit log', 'Jobs', 'Webhooks']) {
      await expect(dialog.getByRole('option', { name: hidden })).toHaveCount(0);
    }
  });
});
