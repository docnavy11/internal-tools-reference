import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// The golden example, driven through the browser. These tests share one database with
// every other spec file, so records get a unique suffix and nothing is asserted about
// rows this file did not create.
//
// The first user ever to sign in becomes admin, so `beforeAll` claims that slot for
// admin@local.test before any test signs in as somebody else.

const ADMIN = 'admin@local.test';
const MEMBER = 'member@local.test';
const VIEWER = 'viewer-customers@local.test';

const suffix = () => Math.random().toString(36).slice(2, 8);

/** Dev login through the API. `page.request` shares the cookie jar with the page. */
async function signIn(context: APIRequestContext, email: string) {
  const res = await context.post('/api/auth/dev', { data: { email } });
  expect(res.ok()).toBeTruthy();
}

async function createCustomer(
  context: APIRequestContext,
  name: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string }> {
  const res = await context.post('/api/customers', {
    data: { name, email: null, status: 'lead', plan: 'free', tags: [], ...overrides },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; name: string };
}

function row(page: Page, name: string) {
  return page.getByRole('row').filter({ hasText: name });
}

function headerAction(page: Page) {
  return page.locator('[data-slot="page-header-actions"]');
}

test.describe.serial('customers', () => {
  test.beforeAll(async ({ request }) => {
    await signIn(request, ADMIN);
  });

  test('an admin creates a customer, sees it in the list and opens it', async ({ page }) => {
    const name = `Acme ${suffix()}`;
    await signIn(page.request, ADMIN);

    await page.goto('/customers');
    await headerAction(page).getByRole('link', { name: 'New customer' }).click();
    await expect(page).toHaveURL('/customers/new');
    // Routes are code-split: the previous page stays visible until the form chunk renders.
    await expect(page.getByRole('button', { name: 'Create customer' })).toBeVisible();

    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Email').fill('billing@acme.test');
    await page.getByLabel('Tags').fill('vip');
    await page.getByLabel('Tags').press('Enter');
    await page.getByRole('button', { name: 'Create customer' }).click();

    // The form navigates to the new record.
    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText('billing@acme.test')).toBeVisible();
    await expect(page.getByText('vip')).toBeVisible();

    // And it is in the list, found through the search box.
    await page.goto('/customers');
    await page.getByRole('searchbox', { name: 'Search' }).fill(name);
    await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(name).replace('%20', '\\+')}`));
    await expect(row(page, name)).toHaveCount(1);

    await row(page, name).getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
  });

  test('editing a record adds a second history entry with a diff', async ({ page }) => {
    const name = `Globex ${suffix()}`;
    await signIn(page.request, ADMIN);
    const customer = await createCustomer(page.request, name);

    await page.goto(`/customers/${customer.id}`);
    await page.getByRole('button', { name: 'Edit' }).click();
    // Editing happens on the same page; the mode lives in the URL.
    await expect(page).toHaveURL(`/customers/${customer.id}?edit=1`);
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();

    await page.getByLabel('Name', { exact: true }).fill(`${name} Holdings`);
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(`/customers/${customer.id}`);
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: `${name} Holdings` })).toBeVisible();

    await page.getByRole('tab', { name: 'History' }).click();
    const timeline = page.getByRole('listitem');
    await expect(timeline.filter({ hasText: 'customers.create' })).toHaveCount(1);
    await expect(timeline.filter({ hasText: 'customers.update' })).toHaveCount(1);

    // The diff names the field that changed and shows both sides.
    const update = timeline.filter({ hasText: 'customers.update' });
    await expect(update.getByText('name', { exact: true })).toBeVisible();
    await expect(update.getByText('changed')).toBeVisible();
    await expect(update.getByText(`${name} Holdings`)).toBeVisible();
  });

  test('bulk set status changes every selected row', async ({ page }) => {
    const tag = `bulk-${suffix()}`;
    await signIn(page.request, ADMIN);
    const first = await createCustomer(page.request, `Bulk one ${tag}`, { tags: [tag] });
    const second = await createCustomer(page.request, `Bulk two ${tag}`, { tags: [tag] });

    await page.goto(`/customers?tag=${tag}`);
    await expect(page.getByRole('row')).toHaveCount(3); // header plus two rows

    await row(page, first.name).getByRole('checkbox').click();
    await row(page, second.name).getByRole('checkbox').click();
    await expect(page.getByText('2 rows selected')).toBeVisible();

    await page.getByRole('button', { name: 'Bulk actions' }).click();
    await page.getByRole('menuitem', { name: 'Set status: churned' }).click();

    await expect(row(page, first.name).getByText('churned')).toBeVisible();
    await expect(row(page, second.name).getByText('churned')).toBeVisible();
  });

  test('the export button downloads a CSV of the filtered list', async ({ page }) => {
    const name = `Export ${suffix()}`;
    await signIn(page.request, ADMIN);
    await createCustomer(page.request, name);

    await page.goto(`/customers?q=${encodeURIComponent(name)}`);
    await expect(row(page, name)).toHaveCount(1);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);

    expect(download.suggestedFilename()).toContain('customers');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const csv = Buffer.concat(chunks).toString('utf8');

    expect(csv.split('\n')[0]).toContain('name');
    expect(csv).toContain(name);
  });

  test('a soft deleted record leaves the list and can be restored', async ({ page }) => {
    const name = `Initech ${suffix()}`;
    await signIn(page.request, ADMIN);
    const customer = await createCustomer(page.request, name);

    await page.goto(`/customers/${customer.id}`);
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();

    await expect(page).toHaveURL('/customers');

    // Gone from the default list.
    await page.goto(`/customers?q=${encodeURIComponent(name)}`);
    await expect(row(page, name)).toHaveCount(0);
    await expect(page.getByText('No customers match')).toBeVisible();

    // Present once deleted records are included.
    await page.goto(`/customers?q=${encodeURIComponent(name)}&includeDeleted=true`);
    await expect(row(page, name)).toHaveCount(1);

    await page.goto(`/customers/${customer.id}`);
    // The status area carries a "Deleted" badge until the record comes back.
    const deletedBadge = page.locator('[data-slot="badge"]', { hasText: 'Deleted' });
    await expect(deletedBadge).toHaveCount(1);
    await page.getByRole('button', { name: 'Restore' }).click();

    await expect(deletedBadge).toHaveCount(0);
    await page.goto(`/customers?q=${encodeURIComponent(name)}`);
    await expect(row(page, name)).toHaveCount(1);
  });

  test('the audit page shows what happened to a customer', async ({ page }) => {
    const name = `Audited ${suffix()}`;
    await signIn(page.request, ADMIN);
    const customer = await createCustomer(page.request, name);

    await page.goto(`/settings/audit?entityId=${customer.id}`);
    const entry = page.getByRole('row').filter({ hasText: 'customers.create' });
    await expect(entry).toHaveCount(1);

    // The row expands into the same diff the history tab uses.
    await entry.getByRole('button', { name: 'Show details' }).click();
    await expect(page.getByText(name).first()).toBeVisible();
  });

  test('an empty list offers its own New customer link, and the header one still works', async ({
    page,
  }) => {
    // Regression: both links point at /customers/new and carry the same
    // accessible name, so an unscoped getByRole matched two elements and the
    // click failed — but only on a run where the list happened to be empty.
    await signIn(page.request, ADMIN);
    await page.goto(`/customers?q=${encodeURIComponent('no-such-customer-' + suffix())}`);

    await expect(page.getByText('No customers match')).toBeVisible();
    await expect(page.getByRole('link', { name: 'New customer' })).toHaveCount(2);

    const header = headerAction(page).getByRole('link', { name: 'New customer' });
    await expect(header).toHaveCount(1);
    await header.click();
    await expect(page).toHaveURL('/customers/new');
  });

  test('a member may create but is not offered delete, and the API refuses it', async ({
    page,
  }) => {
    const name = `Member made ${suffix()}`;
    await signIn(page.request, MEMBER);

    await page.goto('/customers');
    await expect(headerAction(page).getByRole('link', { name: 'New customer' })).toBeVisible();

    await page.goto('/customers/new');
    await expect(page.getByRole('button', { name: 'Create customer' })).toBeVisible();
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Create customer' }).click();
    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);

    const id = page.url().split('/').pop()!;
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);

    // The hidden control is convenience; the server is the boundary.
    const res = await page.request.delete(`/api/customers/${id}`);
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe('forbidden');
  });

  test('a viewer is not offered the form, and the API refuses a create', async ({
    page,
    request,
  }) => {
    // `request` is a separate cookie jar, so the admin stays signed in there while the
    // browser is signed in as the viewer.
    await signIn(request, ADMIN);
    await signIn(page.request, VIEWER);

    const found = await request.get(`/api/users?q=${encodeURIComponent(VIEWER)}`);
    expect(found.ok()).toBeTruthy();
    const viewerId = ((await found.json()) as { items: { id: string }[] }).items[0]!.id;
    const patched = await request.patch(`/api/users/${viewerId}`, { data: { role: 'viewer' } });
    expect(patched.ok()).toBeTruthy();

    await page.goto('/customers');
    await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
    await expect(headerAction(page).getByRole('link', { name: 'New customer' })).toHaveCount(0);

    const res = await page.request.post('/api/customers', {
      data: { name: 'Not allowed', email: null },
    });
    expect(res.status()).toBe(403);
  });
});
