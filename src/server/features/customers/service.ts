import { and, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { ListParams, Page } from '../../../shared/api-types';
import type {
  BulkResult,
  Customer,
  CustomerBulkInput,
  CustomerFilters,
  CustomerInput,
  CustomerPatch,
} from '../../../shared/features/customers/schema';
import { recordAudit, type Actor } from '../../platform/audit/record';
import { users } from '../../platform/auth/table';
import { getDb, withTransaction, type DbOrTx } from '../../platform/db/client';
import { totalOf } from '../../platform/db/count';
import { AppError, notFound } from '../../platform/http/errors';
import { offset, orderBy, page } from '../../platform/http/list';
import { enqueue } from '../../platform/jobs/enqueue';
import { afterCustomerCreated } from './jobs';
import { serializeCustomer } from './serialize';
import { customers } from './table';

// All reads and writes for customers. Routes validate and authorize, then call here.
// Every write runs in a transaction and records an audit row in it (adr/0011).

const sortColumns = {
  name: customers.name,
  email: customers.email,
  status: customers.status,
  plan: customers.plan,
  createdAt: customers.createdAt,
  updatedAt: customers.updatedAt,
};

const ownerColumns = { id: users.id, name: users.name, email: users.email };

function whereFor(filters: CustomerFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (!filters.includeDeleted) conditions.push(isNull(customers.deletedAt));
  if (filters.q) {
    const term = `%${filters.q.replace(/[%_\\]/g, '\\$&')}%`;
    conditions.push(or(ilike(customers.name, term), ilike(customers.email, term))!);
  }
  if (filters.status) conditions.push(inArray(customers.status, filters.status));
  if (filters.plan) conditions.push(inArray(customers.plan, filters.plan));
  if (filters.ownerId) conditions.push(eq(customers.ownerId, filters.ownerId));
  if (filters.tag) conditions.push(sql`${filters.tag} = any(${customers.tags})`);
  return conditions.length ? and(...conditions) : undefined;
}

function baseQuery(db: DbOrTx) {
  return db
    .select({ customer: customers, owner: ownerColumns })
    .from(customers)
    .leftJoin(users, eq(users.id, customers.ownerId));
}

export async function listCustomers(params: ListParams & CustomerFilters): Promise<Page<Customer>> {
  const db = getDb();
  const where = whereFor(params);
  const [rows, totalRows] = await Promise.all([
    baseQuery(db)
      .where(where)
      .orderBy(orderBy(params, sortColumns, customers.createdAt), desc(customers.id))
      .limit(params.pageSize)
      .offset(offset(params)),
    db.select({ total: count() }).from(customers).where(where),
  ]);
  return page(
    rows.map((r) => serializeCustomer(r.customer, r.owner)),
    totalOf(totalRows),
    params,
  );
}

// For CSV export: every matching row, in batches, without paging parameters.
export async function* iterateCustomers(
  params: ListParams & CustomerFilters,
  batch = 500,
): AsyncGenerator<Customer> {
  const db = getDb();
  const where = whereFor(params);
  let cursor = 0;
  for (;;) {
    const rows = await baseQuery(db)
      .where(where)
      .orderBy(orderBy(params, sortColumns, customers.createdAt), desc(customers.id))
      .limit(batch)
      .offset(cursor);
    for (const r of rows) yield serializeCustomer(r.customer, r.owner);
    if (rows.length < batch) return;
    cursor += batch;
  }
}

async function loadOne(db: DbOrTx, id: string): Promise<Customer> {
  const row = (await baseQuery(db).where(eq(customers.id, id)).limit(1))[0];
  if (!row) throw notFound('Customer');
  return serializeCustomer(row.customer, row.owner);
}

export async function getCustomer(id: string): Promise<Customer> {
  return loadOne(getDb(), id);
}

async function assertOwnerExists(db: DbOrTx, ownerId: string | null | undefined): Promise<void> {
  if (!ownerId) return;
  const owner = (
    await db.select({ id: users.id }).from(users).where(eq(users.id, ownerId)).limit(1)
  )[0];
  if (!owner)
    throw new AppError('validation_error', 400, 'Invalid request', {
      formErrors: [],
      fieldErrors: { ownerId: ['Unknown user'] },
    });
}

export async function createCustomer(actor: Actor, input: CustomerInput): Promise<Customer> {
  return withTransaction(async (tx) => {
    await assertOwnerExists(tx, input.ownerId);
    const actorId = actor.type === 'user' ? actor.userId : null;
    const inserted = (
      await tx
        .insert(customers)
        .values({
          ...input,
          tags: [...new Set(input.tags)],
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: customers.id })
    )[0]!;
    const after = await loadOne(tx, inserted.id);
    await recordAudit(tx, actor, {
      action: 'customers.create',
      entityType: 'customer',
      entityId: after.id,
      after,
    });
    // Same transaction: the follow-up job exists only if the customer does.
    await enqueue(afterCustomerCreated, { customerId: after.id }, { tx });
    return after;
  });
}

export async function updateCustomer(
  actor: Actor,
  id: string,
  patch: CustomerPatch,
): Promise<Customer> {
  return withTransaction(async (tx) => {
    const before = await loadOne(tx, id);
    if (before.deletedAt)
      throw new AppError('deleted', 409, 'This customer is deleted. Restore it first.');
    await assertOwnerExists(tx, patch.ownerId);
    const { tags, ...rest } = patch;
    await tx
      .update(customers)
      .set({
        ...rest,
        ...(tags ? { tags: [...new Set(tags)] } : {}),
        updatedAt: new Date(),
        updatedBy: actor.type === 'user' ? actor.userId : null,
      })
      .where(eq(customers.id, id));
    const after = await loadOne(tx, id);
    await recordAudit(tx, actor, {
      action: 'customers.update',
      entityType: 'customer',
      entityId: id,
      before,
      after,
    });
    return after;
  });
}

export async function deleteCustomer(actor: Actor, id: string): Promise<void> {
  await withTransaction(async (tx) => {
    const before = await loadOne(tx, id);
    if (before.deletedAt) return;
    await tx
      .update(customers)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: actor.type === 'user' ? actor.userId : null,
      })
      .where(eq(customers.id, id));
    const after = await loadOne(tx, id);
    await recordAudit(tx, actor, {
      action: 'customers.delete',
      entityType: 'customer',
      entityId: id,
      before,
      after,
    });
  });
}

export async function restoreCustomer(actor: Actor, id: string): Promise<Customer> {
  return withTransaction(async (tx) => {
    const before = await loadOne(tx, id);
    if (!before.deletedAt) return before;
    await tx
      .update(customers)
      .set({
        deletedAt: null,
        updatedAt: new Date(),
        updatedBy: actor.type === 'user' ? actor.userId : null,
      })
      .where(eq(customers.id, id));
    const after = await loadOne(tx, id);
    await recordAudit(tx, actor, {
      action: 'customers.restore',
      entityType: 'customer',
      entityId: id,
      before,
      after,
    });
    return after;
  });
}

// One audit row per affected record so history stays complete per customer.
export async function bulkCustomers(actor: Actor, input: CustomerBulkInput): Promise<BulkResult> {
  return withTransaction(async (tx) => {
    const rows = await baseQuery(tx).where(
      and(inArray(customers.id, input.ids), isNull(customers.deletedAt)),
    );
    const now = new Date();
    const updatedBy = actor.type === 'user' ? actor.userId : null;
    let affected = 0;
    for (const r of rows) {
      const before = serializeCustomer(r.customer, r.owner);
      const set =
        input.action === 'set_status'
          ? { status: input.status }
          : input.action === 'set_plan'
            ? { plan: input.plan }
            : { deletedAt: now };
      if (input.action === 'set_status' && before.status === input.status) continue;
      if (input.action === 'set_plan' && before.plan === input.plan) continue;
      await tx
        .update(customers)
        .set({ ...set, updatedAt: now, updatedBy })
        .where(eq(customers.id, r.customer.id));
      const after = await loadOne(tx, r.customer.id);
      await recordAudit(tx, actor, {
        action: input.action === 'delete' ? 'customers.delete' : 'customers.update',
        entityType: 'customer',
        entityId: r.customer.id,
        before,
        after,
        metadata: { bulk: input.action },
      });
      affected += 1;
    }
    return { affected };
  });
}
