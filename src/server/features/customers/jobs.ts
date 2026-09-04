import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import { z } from 'zod';
import { recordAudit } from '../../platform/audit/record';
import { getDb, withTransaction } from '../../platform/db/client';
import { defineJob, defineSchedule } from '../../platform/jobs/define';
import { serializeCustomer } from './serialize';
import { customers } from './table';
import { users } from '../../platform/auth/table';

// Jobs of the golden example. Two patterns: a job enqueued inside the transaction that
// creates a record, and a scheduled housekeeping job.

// Runs shortly after a customer is created. Phase 5 makes this post to Slack; for now it
// records that the follow-up happened so the pattern (and its audit trail) is visible.
export const afterCustomerCreated = defineJob(
  'customers.after_create',
  z.object({ customerId: z.string().uuid() }),
  async ({ customerId }, ctx) => {
    return withTransaction(async (tx) => {
      const row = (
        await tx
          .select({
            customer: customers,
            owner: { id: users.id, name: users.name, email: users.email },
          })
          .from(customers)
          .leftJoin(users, eq(users.id, customers.ownerId))
          .where(eq(customers.id, customerId))
          .limit(1)
      )[0];
      if (!row) {
        ctx.log.warn({ customerId }, 'customer vanished before follow-up');
        return { skipped: true };
      }
      const customer = serializeCustomer(row.customer, row.owner);
      await recordAudit(tx, ctx.actor, {
        action: 'customers.after_create',
        entityType: 'customer',
        entityId: customerId,
        metadata: { name: customer.name, notified: false },
      });
      ctx.log.info({ customerId, name: customer.name }, 'customer follow-up recorded');
      return { customerId, notified: false };
    });
  },
  { maxAttempts: 3, timeoutMs: 30_000 },
);

// Soft-deleted customers older than this are removed for good. A setting in phase 6.
export const CUSTOMER_TRASH_DAYS = 30;

export const purgeDeletedCustomers = defineJob(
  'customers.purge_deleted',
  z.object({ olderThanDays: z.number().int().min(1).default(CUSTOMER_TRASH_DAYS) }),
  async ({ olderThanDays }, ctx) => {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 3600 * 1000);
    return withTransaction(async (tx) => {
      const rows = await tx
        .select()
        .from(customers)
        .where(and(isNotNull(customers.deletedAt), lt(customers.deletedAt, cutoff)));
      if (rows.length === 0) return { purged: 0 };
      await tx.delete(customers).where(
        inArray(
          customers.id,
          rows.map((r) => r.id),
        ),
      );
      for (const row of rows) {
        await recordAudit(tx, ctx.actor, {
          action: 'customers.purge',
          entityType: 'customer',
          entityId: row.id,
          before: serializeCustomer(row, null),
          metadata: { olderThanDays },
        });
      }
      ctx.log.info({ purged: rows.length }, 'purged deleted customers');
      return { purged: rows.length };
    });
  },
  { maxAttempts: 3, timeoutMs: 5 * 60_000 },
);
defineSchedule('customers.purge_deleted.daily', '0 2 * * *', purgeDeletedCustomers, {
  olderThanDays: CUSTOMER_TRASH_DAYS,
});

// Keeps getDb imported for symmetry with other feature modules that read outside a tx.
void getDb;
