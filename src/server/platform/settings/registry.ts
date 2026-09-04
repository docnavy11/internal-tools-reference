import { z } from 'zod';
import type { Setting } from '../../../shared/settings';

// Settings are declared in code. Features add entries by calling defineSettings() from
// their settings.ts, which src/server/features/index.ts imports. Secrets never go here.

export interface SettingDefinition<T = unknown> {
  key: string;
  schema: z.ZodType<T>;
  default: T;
  label: string;
  description?: string;
  group: string;
}

const registry = new Map<string, SettingDefinition>();

export function defineSetting<T>(def: SettingDefinition<T>): SettingDefinition<T> {
  def.schema.parse(def.default); // a default that fails its own schema is a bug at boot
  registry.set(def.key, def as SettingDefinition);
  return def;
}

type SettingInput = {
  schema: z.ZodTypeAny;
  default: unknown;
  label: string;
  description?: string;
  group: string;
};

export function defineSettings<const D extends Record<string, SettingInput>>(
  defs: D,
): { [K in keyof D]: SettingDefinition<z.infer<D[K]['schema']>> } {
  const out = {} as { [K in keyof D]: SettingDefinition<z.infer<D[K]['schema']>> };
  for (const [key, def] of Object.entries(defs)) {
    out[key as keyof D] = defineSetting({
      key,
      ...def,
    } as SettingDefinition) as SettingDefinition<never>;
  }
  return out;
}

export function getSettingDefinition(key: string): SettingDefinition | undefined {
  return registry.get(key);
}

export function listSettingDefinitions(): SettingDefinition[] {
  return [...registry.values()].sort(
    (a, b) => a.group.localeCompare(b.group) || a.key.localeCompare(b.key),
  );
}

// UI control type derived from the Zod schema; the client never sees Zod.
export function settingType(def: SettingDefinition): {
  type: Setting['type'];
  options: string[] | null;
} {
  let s: z.ZodTypeAny = def.schema;
  while (
    s instanceof z.ZodDefault ||
    s instanceof z.ZodOptional ||
    s instanceof z.ZodNullable ||
    s instanceof z.ZodEffects
  ) {
    s = s instanceof z.ZodEffects ? s.innerType() : s._def.innerType;
  }
  if (s instanceof z.ZodBoolean) return { type: 'boolean', options: null };
  if (s instanceof z.ZodNumber) return { type: 'number', options: null };
  if (s instanceof z.ZodEnum) return { type: 'enum', options: [...(s.options as string[])] };
  return { type: 'string', options: null };
}
