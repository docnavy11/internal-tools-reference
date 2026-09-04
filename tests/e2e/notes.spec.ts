import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Notes are the child-entity example: a tab on the customer detail page, a composer
// that posts multipart, an attachment that downloads through /api/files/:id, and a
// count that travels back to the parent's list row.
//
// These tests share one database with every other spec file, so records get a unique
// suffix and nothing is asserted about rows this file did not create.

const ADMIN = 'admin@local.test';
const VIEWER = 'viewer-notes@local.test';

const suffix = () => Math.random().toString(36).slice(2, 8);

/** Dev login through the API. `page.request` shares the cookie jar with the page. */
async function signIn(context: APIRequestContext, email: string) {
  const res = await context.post('/api/auth/dev', { data: { email } });
  expect(res.ok()).toBeTruthy();
}

async function createCustomer(context: APIRequestContext, name: string): Promise<{ id: string }> {
  const res = await context.post('/api/customers', {
    data: { name, email: null, status: 'lead', plan: 'free', tags: [] },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string };
}

async function openNotesTab(page: Page, customerId: string) {
  await page.goto(`/customers/${customerId}?tab=notes`);
  await expect(page.getByRole('tab', { name: 'Notes' })).toHaveAttribute('data-state', 'active');
}

function noteCard(page: Page, text: string) {
  return page.locator('[data-slot="note"]').filter({ hasText: text });
}

test.describe.serial('notes', () => {
  test.beforeAll(async ({ request }) => {
    // The first user ever to sign in becomes admin; claim that slot before anyone else.
    await signIn(request, ADMIN);
  });

  test('an admin posts a note with an attachment, edits it and deletes it', async ({ page }) => {
    const tag = suffix();
    const name = `Noted ${tag}`;
    const body = `First contact ${tag}`;
    const attachmentBody = `hello from ${tag}\n`;
    await signIn(page.request, ADMIN);
    const customer = await createCustomer(page.request, name);

    await openNotesTab(page, customer.id);
    await expect(page.getByText('No notes yet')).toBeVisible();

    // Post a note with a small text file attached.
    await page.getByLabel('Note', { exact: true }).fill(body);
    await page.getByLabel('Attachment').setInputFiles({
      name: `note-${tag}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from(attachmentBody, 'utf8'),
    });
    await expect(page.getByText(`note-${tag}.txt`)).toBeVisible();
    await page.getByRole('button', { name: 'Post note' }).click();

    // It appears in the list with the attachment beside it.
    const card = noteCard(page, body);
    await expect(card).toHaveCount(1);
    await expect(card.getByText(body)).toBeVisible();
    const attachment = card.getByRole('link', { name: `note-${tag}.txt` });
    await expect(attachment).toBeVisible();

    // The link is a normal download through /api/files/:id, cookie auth and all.
    const [download] = await Promise.all([page.waitForEvent('download'), attachment.click()]);
    expect(download.suggestedFilename()).toBe(`note-${tag}.txt`);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString('utf8')).toBe(attachmentBody);

    // Editing the body in place.
    const edited = `Edited ${tag}`;
    await card.getByRole('button', { name: 'Note actions' }).click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await page.getByLabel('Edit note').fill(edited);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(noteCard(page, edited)).toHaveCount(1);
    await expect(page.getByText(body, { exact: true })).toHaveCount(0);

    // The count on the parent travelled to the tab label and the list row.
    await expect(page.getByRole('tab', { name: 'Notes' })).toContainText('1');
    await page.goto(`/customers?q=${encodeURIComponent(name)}`);
    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole('cell', { name: '1', exact: true })).toBeVisible();

    // Deleting it empties the tab again.
    await openNotesTab(page, customer.id);
    await noteCard(page, edited).getByRole('button', { name: 'Note actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No notes yet')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Notes' })).toContainText('0');
  });

  test('a viewer reads the notes but is offered no composer and no row actions', async ({
    page,
    request,
  }) => {
    const tag = suffix();
    const body = `Admin wrote this ${tag}`;

    // `request` is a separate cookie jar, so the admin stays signed in there while the
    // browser is signed in as the viewer.
    await signIn(request, ADMIN);
    const customer = await createCustomer(request, `Read only ${tag}`);
    const posted = await request.post(`/api/customers/${customer.id}/notes`, {
      multipart: { body },
    });
    expect(posted.status()).toBe(201);

    await signIn(page.request, VIEWER);
    const found = await request.get(`/api/users?q=${encodeURIComponent(VIEWER)}`);
    expect(found.ok()).toBeTruthy();
    const viewerId = ((await found.json()) as { items: { id: string }[] }).items[0]!.id;
    const patched = await request.patch(`/api/users/${viewerId}`, { data: { role: 'viewer' } });
    expect(patched.ok()).toBeTruthy();

    await openNotesTab(page, customer.id);
    await expect(noteCard(page, body)).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Post note' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Note actions' })).toHaveCount(0);

    // The hidden controls are convenience; the server is the boundary.
    const refused = await page.request.post(`/api/customers/${customer.id}/notes`, {
      multipart: { body: 'Not allowed' },
    });
    expect(refused.status()).toBe(403);
  });
});
