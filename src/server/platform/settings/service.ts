import { eq } from 'drizzle-orm';
import type { Setting } from '../../../shared/settings';
import { recordAudit, type Actor } from '../audit/record';
import { users } from '../auth/table';
import { getDb, withTransaction } from '../db/client';
import { AppError, notFound } from '../http/errors';
import { logger } from '../http/logger';
import {
  getSettingDefinition,
  listSettingDefinitions,
  settingType,
  type SettingDefinition,
} from './registry';
import { settings as table } from './table';

// Effective values are cached per process for CACHE_MS; set() refreshes the cache in the
// process that wrote. Other replicas see the change within CACHE_MS.
const CACHE_MS = 30_000;
let cache: { at: number; values: Map<string, unknown> } | null = null;

async function loadOverrides(): Promise<Map<string, unknown>> {
  const rows = await getDb().select({ key: table.key, value: table.value }).from(table);
  return new Map(rows.map((r) => [r.key, r.value]));
}

async function effective(
  def: SettingDefinition,
  overrides: Map<string, unknown>,
): Promise<unknown> {
  if (!overrides.has(def.key)) return def.default;
  const parsed = def.schema.safeParse(overrides.get(def.key));
  if (parsed.success) return parsed.data;
  // A stored value that no longer fits (the schema changed) falls back to the default.
  logger.warn({ key: def.key }, 'stored setting value is invalid; using default');
  return def.default;
}

export async function getSetting<T>(def: SettingDefinition<T>): Promise<T> {
  if (!cache || Date.now() - cache.at > CACHE_MS)
    cache = { at: Date.now(), values: await loadOverrides() };
  return (await effective(def as SettingDefinition, cache.values)) as T;
}

export function invalidateSettingsCache(): void {
  cache = null;
}

export async function listSettings(): Promise<Setting[]> {
  const db = getDb();
  const rows = await db
    .select({ row: table, user: { id: users.id, name: users.name, email: users.email } })
    .from(table)
    .leftJoin(users, eq(users.id, table.updatedBy));
  const overrides = new Map(rows.map((r) => [r.row.key, r.row.value]));
  const meta = new Map(rows.map((r) => [r.row.key, r]));
  const out: Setting[] = [];
  for (const def of listSettingDefinitions()) {
    const m = meta.get(def.key);
    const { type, options } = settingType(def);
    out.push({
      key: def.key,
      label: def.label,
      description: def.description ?? null,
      group: def.group,
      type,
      options,
      default: def.default,
      value: await effective(def, overrides),
      overridden: overrides.has(def.key),
      updatedAt: m?.row.updatedAt.toISOString() ?? null,
      updatedBy: m?.user?.id ? { id: m.user.id, name: m.user.name, email: m.user.email } : null,
    });
  }
  return out;
}

// value === null removes the override.
export async function setSetting(actor: Actor, key: string, value: unknown): Promise<Setting> {
  const def = getSettingDefinition(key);
  if (!def) throw notFound('Setting');
  await withTransaction(async (tx) => {
    const beforeRow = (await tx.select().from(table).where(eq(table.key, key)))[0];
    const before = beforeRow ? beforeRow.value : def.default;
    let after: unknown;
    if (value === null || value === undefined) {
      await tx.delete(table).where(eq(table.key, key));
      after = def.default;
    } else {
      const parsed = def.schema.safeParse(value);
      if (!parsed.success) {
        throw new AppError('validation_error', 400, 'Invalid request', {
          formErrors: parsed.error.issues.map((i) => i.message),
          fieldErrors: {},
        });
      }
      after = parsed.data;
      await tx
        .insert(table)
        .values({
          key,
          value: parsed.data as object,
          updatedBy: actor.type === 'user' ? actor.userId : null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: table.key,
          set: {
            value: parsed.data as object,
            updatedBy: actor.type === 'user' ? actor.userId : null,
            updatedAt: new Date(),
          },
        });
    }
    await recordAudit(tx, actor, {
      action: 'settings.update',
      entityType: 'setting',
      before: { key, value: before },
      after: { key, value: after },
      metadata: { key },
    });
  });
  invalidateSettingsCache();
  return (await listSettings()).find((s) => s.key === key)!;
}
