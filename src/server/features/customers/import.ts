import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import Papa from 'papaparse';
import { z } from 'zod';
import type {
  ImportAccepted,
  ImportRejectedRow,
  ImportStatus,
} from '../../../shared/features/customers/schema';
import {
  customerImportColumns,
  customerImportRow,
  type CustomerImportRow,
} from '../../../shared/features/customers/schema';
import { recordAudit } from '../../platform/audit/record';
import { requirePermission } from '../../platform/auth/middleware';
import { users } from '../../platform/auth/table';
import { getDb, withTransaction } from '../../platform/db/client';
import { csvLine } from '../../platform/csv/stream';
import { AppError, notFound } from '../../platform/http/errors';
import type { AppEnv } from '../../platform/http/types';
import { uploadBodyLimit } from '../../platform/http/body-limit';
import { validate } from '../../platform/http/validate';
import { defineJob } from '../../platform/jobs/define';
import { enqueue } from '../../platform/jobs/enqueue';
import { jobs } from '../../platform/jobs/table';
import { customers } from './table';

// CSV import: the request validates every row and answers immediately with what was
// accepted and rejected; a job inserts the accepted rows in batches so a large file
// never ties up a request. Jobs run with a job actor, so each created row's audit entry
// carries the importing user in metadata.

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;

const importPayload = z.object({
  requestedBy: z.string().uuid(),
  rows: z.array(z.object({ line: z.number().int(), data: customerImportRow })),
});

export const importCustomers = defineJob(
  'customers.import',
  importPayload,
  async ({ requestedBy, rows }, ctx) => {
    const failed: { line: number; error: string }[] = [];
    let created = 0;
    // Resolve owners once. Unknown owner emails fail their row rather than the job.
    // Stored emails are lower-cased (see auth/policy.ts); compare case-insensitively.
    const ownerEmails = [
      ...new Set(rows.map((r) => r.data.owner?.toLowerCase()).filter((e): e is string => !!e)),
    ];
    const owners = ownerEmails.length
      ? await getDb()
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(inArray(users.email, ownerEmails))
      : [];
    const ownerByEmail = new Map(owners.map((o) => [o.email, o.id]));

    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200);
      await withTransaction(async (tx) => {
        for (const { line, data } of batch) {
          const ownerId = data.owner ? ownerByEmail.get(data.owner.toLowerCase()) : null;
          if (data.owner && !ownerId) {
            failed.push({ line, error: `Unknown owner ${data.owner}` });
            continue;
          }
          const inserted = (
            await tx
              .insert(customers)
              .values({
                name: data.name,
                email: data.email,
                status: data.status,
                plan: data.plan,
                tags: [...new Set(data.tags)],
                ownerId: ownerId ?? null,
                notes: data.notes,
                createdBy: requestedBy,
                updatedBy: requestedBy,
              })
              .returning()
          )[0]!;
          await recordAudit(tx, ctx.actor, {
            action: 'customers.create',
            entityType: 'customer',
            entityId: inserted.id,
            after: {
              ...inserted,
              createdAt: inserted.createdAt.toISOString(),
              updatedAt: null,
              deletedAt: null,
            },
            metadata: { import: true, requestedBy, line },
          });
          created += 1;
        }
      });
      if (ctx.signal.aborted) throw new Error('import aborted');
    }
    ctx.log.info({ created, failed: failed.length }, 'customer import finished');
    return { created, failed };
  },
  { maxAttempts: 1, timeoutMs: 10 * 60_000 },
);

export interface ParsedImport {
  accepted: { line: number; data: CustomerImportRow }[];
  rejected: ImportRejectedRow[];
}

// Parse and validate a CSV text. Exported for tests.
export function parseCustomerCsv(text: string): ParsedImport {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
    // Stop parsing one row past the cap instead of materialising a whole oversized file.
    preview: IMPORT_MAX_ROWS + 1,
  });
  const fields = parsed.meta.fields ?? [];
  if (!fields.includes('name')) {
    throw new AppError('validation_error', 400, 'Invalid request', {
      formErrors: [
        `The CSV needs a "name" column. Found: ${fields.join(', ') || 'none'}. Expected columns: ${customerImportColumns.join(', ')}.`,
      ],
      fieldErrors: {},
    });
  }
  if (parsed.data.length > IMPORT_MAX_ROWS) {
    throw new AppError('validation_error', 400, 'Invalid request', {
      formErrors: [
        `Too many rows (${parsed.data.length}). The limit is ${IMPORT_MAX_ROWS} per file.`,
      ],
      fieldErrors: {},
    });
  }
  const accepted: ParsedImport['accepted'] = [];
  const rejected: ImportRejectedRow[] = [];
  parsed.data.forEach((raw, index) => {
    const line = index + 2; // header is line 1
    const result = customerImportRow.safeParse(raw);
    if (result.success) accepted.push({ line, data: result.data });
    else
      rejected.push({
        line,
        errors: result.error.issues.map((i) => `${i.path.join('.') || 'row'}: ${i.message}`),
      });
  });
  return { accepted, rejected };
}

const jobIdParam = z.object({ jobId: z.string().uuid() });

export function customerImportRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const write = requirePermission('customers:write');

  r.get('/customers/import/template', write, (c) => {
    c.header('content-type', 'text/csv; charset=utf-8');
    c.header('content-disposition', 'attachment; filename="customers-import-template.csv"');
    return c.body(
      csvLine([...customerImportColumns]) +
        csvLine([
          'Acme Inc.',
          'billing@acme.example',
          'active',
          'pro',
          'vip;eu',
          'admin@local.test',
          'Imported from the old CRM',
        ]),
    );
  });

  r.post('/customers/import', write, uploadBodyLimit, async (c) => {
    const body = await c.req.parseBody();
    const file = body['file'];
    if (!(file instanceof File)) {
      throw new AppError('validation_error', 400, 'Invalid request', {
        formErrors: ['Attach a CSV file in the "file" field.'],
        fieldErrors: {},
      });
    }
    if (file.size > IMPORT_MAX_BYTES) {
      throw new AppError('validation_error', 400, 'Invalid request', {
        formErrors: [`The file is larger than ${IMPORT_MAX_BYTES / 1024 / 1024} MB.`],
        fieldErrors: {},
      });
    }
    if (
      file.type &&
      !/csv|text\/plain|excel/i.test(file.type) &&
      !file.name.toLowerCase().endsWith('.csv')
    ) {
      throw new AppError('validation_error', 400, 'Invalid request', {
        formErrors: ['Only .csv files are accepted.'],
        fieldErrors: {},
      });
    }
    const { accepted, rejected } = parseCustomerCsv(await file.text());
    const requestedBy = c.get('session')!.user.id;
    const { id } = await withTransaction((tx) =>
      enqueue(importCustomers, { requestedBy, rows: accepted }, { tx }),
    );
    const response: ImportAccepted = { jobId: id, accepted: accepted.length, rejected };
    return c.json(response, 202);
  });

  r.get('/customers/import/:jobId', write, validate('param', jobIdParam), async (c) => {
    const row = (
      await getDb()
        .select()
        .from(jobs)
        .where(eq(jobs.id, c.req.valid('param').jobId))
        .limit(1)
    )[0];
    if (!row || row.name !== importCustomers.name) throw notFound('Import');
    const payload = row.payload as { requestedBy?: string };
    const me = c.get('session')!.user;
    // Only the person who started it, or a jobs admin, may follow an import.
    if (payload.requestedBy !== me.id && me.role !== 'admin') throw notFound('Import');
    const response: ImportStatus = {
      jobId: row.id,
      status: row.status as ImportStatus['status'],
      result: (row.result as ImportStatus['result']) ?? null,
      lastError: row.lastError,
    };
    return c.json(response);
  });

  return r;
}
