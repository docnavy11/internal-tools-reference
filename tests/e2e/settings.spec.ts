import { createHmac } from 'node:crypto';
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

// The settings admin and the inbound webhook inbox, driven through the browser against
// a server run with APP_MODE=all, so a worker is processing webhook events while these
// tests run.
//
// These specs share one database with every other spec file. Settings are global rather
// than per-record, so each test starts by putting the key it touches back on its default
// instead of assuming what a previous run left behind, and puts it back afterwards when
// another spec could care about the value. The first user ever to sign in becomes admin,
// so `beforeAll` claims that slot for admin@local.test before any test signs in as
// somebody else.

const ADMIN = 'admin@local.test';
const MEMBER = 'member@local.test';

// The secret playwright.config.ts gives the example vendor in the e2e environment.
const WEBHOOK_SECRET = 'e2e-webhook-secret';

// The worker polls, and an event has to be claimed, processed and committed before the
// UI can show a result.
const JOB_WAIT = 30_000;

async function signIn(context: APIRequestContext, email: string) {
  const res = await context.post('/api/auth/dev', { data: { email } });
  expect(res.ok()).toBeTruthy();
}

/** Put a setting back on the value from the registry, if something overrode it. */
async function resetToDefault(row: Locator) {
  const reset = row.getByRole('button', { name: 'Reset to default' });
  if ((await reset.count()) > 0) {
    await reset.click();
    await expect(reset).toHaveCount(0);
  }
}

async function openSettings(page: Page, key: string): Promise<Locator> {
  await page.goto('/settings/general');
  await expect(page.getByRole('heading', { name: 'General' })).toBeVisible();
  const row = page.getByTestId(`setting-${key}`);
  await expect(row).toBeVisible();
  return row;
}

test.describe.serial('settings and webhooks', () => {
  test.beforeAll(async ({ request }) => {
    await signIn(request, ADMIN);
  });

  test('a boolean setting toggles, survives a reload and resets to its default', async ({
    page,
  }) => {
    await signIn(page.request, ADMIN);

    const row = await openSettings(page, 'customers.slack_on_create');
    // The registry groups this key under Customers, and the card is titled by the group.
    await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();

    await resetToDefault(row);
    const toggle = row.getByRole('switch');
    await expect(toggle).toBeChecked();
    await expect(row.getByTestId('setting-default')).toHaveCount(0);

    // Off is a real PATCH: the switch reflects what came back, not the click.
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(row.getByTestId('setting-default')).toHaveText('Default: On');

    // The override is stored, not just in this tab.
    await page.reload();
    await expect(row.getByRole('switch')).not.toBeChecked();
    await expect(row.getByTestId('setting-default')).toBeVisible();

    // Removing the override brings the code default back, and with it the hint goes.
    await row.getByRole('button', { name: 'Reset to default' }).click();
    await expect(row.getByRole('switch')).toBeChecked();
    await expect(row.getByTestId('setting-default')).toHaveCount(0);
  });

  test('an enum setting is changed from its select and comes back after a reload', async ({
    page,
  }) => {
    await signIn(page.request, ADMIN);

    const row = await openSettings(page, 'customers.default_plan');
    await resetToDefault(row);

    const select = row.getByRole('combobox');
    await expect(select).toContainText('free');

    await select.click();
    await page.getByRole('option', { name: 'pro' }).click();
    await expect(select).toContainText('pro');

    await page.reload();
    const reloaded = page.getByTestId('setting-customers.default_plan');
    await expect(reloaded.getByRole('combobox')).toContainText('pro');
    await expect(reloaded.getByTestId('setting-default')).toHaveText('Default: free');

    // Other specs create customers; leave the plan they would get alone.
    await resetToDefault(reloaded);
    await expect(reloaded.getByRole('combobox')).toContainText('free');
  });

  test('a number setting the server rejects reports why and keeps the stored value', async ({
    page,
  }) => {
    await signIn(page.request, ADMIN);

    const row = await openSettings(page, 'customers.trash_days');
    await resetToDefault(row);

    const input = row.getByRole('spinbutton');
    const stored = await input.inputValue();
    expect(stored).not.toBe('0');

    await input.fill('0');
    await input.press('Enter');

    // The setting's own schema said no, so its message is on the control.
    await expect(row.getByTestId('setting-error')).toBeVisible();
    await expect(input).toHaveValue(stored);

    // Nothing was stored, so there is no override to reset.
    await page.reload();
    await expect(
      page.getByTestId('setting-customers.trash_days').getByRole('spinbutton'),
    ).toHaveValue(stored);
  });

  test('a signed delivery reaches the inbox, shows its payload and can be replayed', async ({
    page,
    request,
  }) => {
    await signIn(page.request, ADMIN);

    // Sign the body the way the example vendor does: HMAC over `<timestamp>.<raw body>`.
    const externalId = `evt_e2e_${Date.now()}`;
    const body = JSON.stringify({
      id: externalId,
      type: 'widget.updated',
      data: { widgetId: 'w1' },
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', WEBHOOK_SECRET)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    // `data` as a string is sent verbatim, which is what the signature is over.
    const delivered = await request.post('/api/webhooks/example-vendor', {
      headers: {
        'content-type': 'application/json',
        'x-example-signature': `sha256=${signature}`,
        'x-example-timestamp': timestamp,
      },
      data: body,
    });
    expect(delivered.ok()).toBeTruthy();

    // Newest first is the default sort, so the delivery just made is the first row.
    await page.goto('/settings/webhooks?vendor=example-vendor&eventType=widget.updated');
    await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: 'widget.updated' }).first();
    await expect(row).toBeVisible({ timeout: JOB_WAIT });

    await row.getByRole('button', { name: 'widget.updated' }).click();
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(externalId);
    await expect(sheet.getByTestId('webhook-payload')).toContainText('"widgetId": "w1"');
    await expect(sheet.getByTestId('webhook-headers')).toContainText('x-example-signature');

    // The worker runs in e2e, and the sheet polls while the event is pending.
    await expect(sheet.getByTestId('webhook-status')).toHaveText('processed', {
      timeout: JOB_WAIT,
    });
    await expect(sheet.getByTestId('webhook-attempts')).toHaveText('1');

    await sheet.getByRole('button', { name: 'Replay' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Replay' }).click();
    await expect(page.getByText('Queued the event to be processed again.')).toBeVisible();

    // Back to pending, then processed again. The badge is not asserted in `pending`: the
    // worker can claim the event before the refetch that follows the replay lands. The
    // attempt counter is what proves the handler really ran a second time.
    await expect(sheet.getByTestId('webhook-attempts')).toHaveText('2', { timeout: JOB_WAIT });
    await expect(sheet.getByTestId('webhook-status')).toHaveText('processed', {
      timeout: JOB_WAIT,
    });
  });

  test('a member cannot open the settings or the webhooks page', async ({ page }) => {
    await signIn(page.request, MEMBER);

    await page.goto('/settings/general');
    await expect(page).toHaveURL('/settings/general');
    await expect(page.getByText('No access')).toBeVisible();

    await page.goto('/settings/webhooks');
    await expect(page).toHaveURL('/settings/webhooks');
    await expect(page.getByText('No access')).toBeVisible();

    const sidebar = page.locator('[data-slot="sidebar"]');
    await expect(sidebar.getByRole('link', { name: 'General' })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: 'Webhooks' })).toHaveCount(0);
  });
});
