import { Hono } from 'hono';
import { z } from 'zod';
import type { Permission } from '../../../shared/permissions';
import {
  customerBulkInput,
  customerFilters,
  customerInput,
  customerPatch,
  customerSortColumns,
} from '../../../shared/features/customers/schema';
import { hasPermission, requirePermission } from '../../platform/auth/middleware';
import { entityHistory } from '../../platform/audit/service';
import { csvFilename, csvResponse } from '../../platform/csv/stream';
import { forbidden } from '../../platform/http/errors';
import { parseListQuery } from '../../platform/http/list';
import type { AppEnv } from '../../platform/http/types';
import { validate } from '../../platform/http/validate';
import type { Role } from '../../../shared/permissions';
import {
  bulkCustomers,
  createCustomer,
  deleteCustomer,
  getCustomer,
  iterateCustomers,
  listCustomers,
  restoreCustomer,
  updateCustomer,
} from './service';

const idParam = z.object({ id: z.string().uuid() });
const historyQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

// Routes do three things: authorize, validate, call the service. No business logic here.
export function customerRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const read = requirePermission('customers:read');
  const write = requirePermission('customers:write');
  const del = requirePermission('customers:delete');

  r.get('/customers', read, async (c) => {
    const params = parseListQuery(c.req.query(), customerFilters, customerSortColumns);
    if (c.req.query('format') === 'csv') {
      return csvResponse(c, csvFilename('customers'), csvColumns, iterateCustomers(params));
    }
    return c.json(await listCustomers(params));
  });

  r.post('/customers', write, validate('json', customerInput), async (c) => {
    return c.json(await createCustomer(c.get('actor'), c.req.valid('json')), 201);
  });

  r.post('/customers/bulk', write, validate('json', customerBulkInput), async (c) => {
    const input = c.req.valid('json');
    if (input.action === 'delete' && !can(c.get('session')!.user.role as Role, 'customers:delete'))
      throw forbidden();
    return c.json(await bulkCustomers(c.get('actor'), input));
  });

  r.get('/customers/:id', read, validate('param', idParam), async (c) => {
    return c.json(await getCustomer(c.req.valid('param').id));
  });

  r.patch(
    '/customers/:id',
    write,
    validate('param', idParam),
    validate('json', customerPatch),
    async (c) => {
      return c.json(
        await updateCustomer(c.get('actor'), c.req.valid('param').id, c.req.valid('json')),
      );
    },
  );

  r.delete('/customers/:id', del, validate('param', idParam), async (c) => {
    await deleteCustomer(c.get('actor'), c.req.valid('param').id);
    return c.body(null, 204);
  });

  r.post('/customers/:id/restore', del, validate('param', idParam), async (c) => {
    return c.json(await restoreCustomer(c.get('actor'), c.req.valid('param').id));
  });

  r.get(
    '/customers/:id/history',
    read,
    validate('param', idParam),
    validate('query', historyQuery),
    async (c) => {
      const { page, pageSize } = c.req.valid('query');
      return c.json(
        await entityHistory('customer', c.req.valid('param').id, { page, pageSize, order: 'desc' }),
      );
    },
  );

  return r;
}

const can = (role: Role, permission: Permission) => hasPermission(role, permission);

const csvColumns = [
  { header: 'id', value: (r: { id: string }) => r.id },
  { header: 'name', value: (r: { name: string }) => r.name },
  { header: 'email', value: (r: { email: string | null }) => r.email },
  { header: 'status', value: (r: { status: string }) => r.status },
  { header: 'plan', value: (r: { plan: string }) => r.plan },
  { header: 'tags', value: (r: { tags: string[] }) => r.tags },
  { header: 'owner', value: (r: { owner: { email: string } | null }) => r.owner?.email ?? null },
  { header: 'createdAt', value: (r: { createdAt: string }) => r.createdAt },
  { header: 'updatedAt', value: (r: { updatedAt: string | null }) => r.updatedAt },
];
