import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// The jobs admin and the CSV import, driven through the browser against a server run
// with APP_MODE=all, so a worker is processing jobs while these tests run.
//
// These specs share one database with every other spec file, so every record gets a
// unique suffix and nothing is asserted about rows this file did not create. The first
// user ever to sign in becomes admin, so `beforeAll` claims that slot for
// admin@local.test before any test signs in as somebody else.
//
// Waits are generous: the worker polls, and a job has to be claimed, run and committed
// before the UI can show a result.

const ADMIN = 'admin@local.test';
const MEMBER = 'member@local.test';

const JOB_WAIT = 30_000;

const suffix = () => Math.random().toString(36).slice(2, 8);

async function signIn(context: APIRequestContext, email: string) {
  const res = await context.post('/api/auth/dev', { data: { email } });
  expect(res.ok()).toBeTruthy();
}

/**
 * Two rows that pass validation, one with a status the enum does not have and one with
 * no name at all. The header is line 1, so the bad rows are lines 4 and 5.
 */
function importCsv(tag: string): string {
  return [
    'name,email,status,plan,tags,owner,notes',
    `Import One ${tag},one-${tag}@example.test,active,pro,${tag};vip,,First`,
    `Import Two ${tag},two-${tag}@example.test,lead,free,${tag},,Second`,
    `Import Bad ${tag},bad-${tag}@example.test,not_a_status,free,${tag},,Bad status`,
    `,orphan-${tag}@example.test,lead,free,${tag},,No name`,
    '',
  ].join('\n');
}

async function uploadCsv(page: Page, csv: string, name: string) {
  await page.getByRole('button', { name: 'Import CSV' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('CSV file').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await page.getByRole('button', { name: 'Upload' }).click();
}

test.describe.serial('jobs and import', () => {
  test.beforeAll(async ({ request }) => {
    await signIn(request, ADMIN);
  });

  test('an admin imports a CSV, sees the rejected rows and the created records', async ({
    page,
  }) => {
    const tag = suffix();
    await signIn(page.request, ADMIN);

    await page.goto('/customers');
    await uploadCsv(page, importCsv(tag), `customers-${tag}.csv`);

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('import-accepted')).toContainText(
      '2 rows accepted, 2 rejected',
    );

    // The two bad rows are named by their line in the file, header included.
    const rejected = dialog.getByTestId('import-rejected');
    await expect(rejected.getByRole('row')).toHaveCount(3); // header plus two rows
    await expect(rejected.getByRole('row').nth(1).locator('td').first()).toHaveText('4');
    await expect(rejected.getByRole('row').nth(1)).toContainText('status');
    await expect(rejected.getByRole('row').nth(2).locator('td').first()).toHaveText('5');
    await expect(rejected.getByRole('row').nth(2)).toContainText('name');

    // The accepted rows are created by a background job the dialog polls.
    await expect(dialog.getByTestId('import-created')).toContainText('Created 2 customers', {
      timeout: JOB_WAIT,
    });
    await expect(dialog.getByTestId('import-failed')).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Both names are in the list, found by the tag every imported row carries.
    await page.goto(`/customers?tag=${tag}`);
    await expect(page.getByRole('row').filter({ hasText: `Import One ${tag}` })).toHaveCount(1);
    await expect(page.getByRole('row').filter({ hasText: `Import Two ${tag}` })).toHaveCount(1);
  });

  test('the jobs page shows the import job and its result', async ({ page }) => {
    const tag = suffix();
    await signIn(page.request, ADMIN);

    await page.goto('/customers');
    await uploadCsv(page, importCsv(tag), `customers-${tag}.csv`);
    await expect(page.getByRole('dialog').getByTestId('import-created')).toContainText(
      'Created 2 customers',
      { timeout: JOB_WAIT },
    );
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();

    await page.goto('/settings/jobs?name=customers.import&status=succeeded');
    await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible();

    // `exact` matters: the Job filter trigger's accessible name contains the job name
    // as well, and it comes first in the DOM.
    const firstJob = page.getByRole('button', { name: 'customers.import', exact: true }).first();
    await expect(firstJob).toBeVisible({ timeout: JOB_WAIT });
    await expect(
      page.getByRole('row').filter({ hasText: 'customers.import' }).first(),
    ).toContainText('succeeded');

    // The sheet holds the whole job, including the result the row does not show.
    await firstJob.click();
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('job-result')).toContainText('"created": 2');
    await expect(sheet.getByTestId('job-payload')).toBeVisible();
  });

  test('the schedules tab toggles a schedule and runs one now', async ({ page }) => {
    await signIn(page.request, ADMIN);

    await page.goto('/settings/jobs?tab=schedules');
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: JOB_WAIT });

    const first = rows.first();
    const jobName = (await first.locator('td').nth(2).innerText()).trim();
    const toggle = first.getByRole('switch');

    // Every spec file shares one database, so start from a known state rather than
    // assuming a previous run left this schedule enabled.
    if (!(await toggle.isChecked())) {
      await toggle.click();
      await expect(toggle).toBeChecked();
    }

    // Off, then back on. Both are real PATCHes: the switch reflects what came back.
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(page.getByText('is now disabled')).toBeVisible();

    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(page.getByText('is now enabled').first()).toBeVisible();

    // "Run now" queues the schedule's job and sends the user to the Jobs tab.
    await first.getByRole('button', { name: /^Run .* now$/ }).click();
    await expect(page).toHaveURL('/settings/jobs');

    await page.goto(`/settings/jobs?name=${encodeURIComponent(jobName)}`);
    await expect(page.getByRole('button', { name: jobName, exact: true }).first()).toBeVisible({
      timeout: JOB_WAIT,
    });
  });

  test('a member cannot open the jobs page but can import customers', async ({ page }) => {
    await signIn(page.request, MEMBER);

    await page.goto('/settings/jobs');
    await expect(page).toHaveURL('/settings/jobs');
    await expect(page.getByText('No access')).toBeVisible();
    await expect(
      page.locator('[data-slot="sidebar"]').getByRole('link', { name: 'Jobs' }),
    ).toHaveCount(0);

    // The import belongs to customers:write, which a member has.
    await page.goto('/customers');
    await page.getByRole('button', { name: 'Import CSV' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByLabel('CSV file')).toBeVisible();
  });
});
