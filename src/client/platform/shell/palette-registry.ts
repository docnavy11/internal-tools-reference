import type { Permission } from '@/shared/permissions';

/**
 * What the command palette can search besides the navigation. A feature adds itself
 * with one `registerPaletteSource` call in `client/features/<name>/palette.ts`, and one
 * import line in `command-palette.tsx` pulls that file in. The registry lives in its own
 * module so a feature can import it without a cycle back through the palette component.
 */

export interface PaletteResult {
  /** Unique within the source; used as the React key. */
  id: string;
  label: string;
  /** Second line, for the detail that tells two similar records apart. */
  description?: string;
  to: string;
}

export interface PaletteSource {
  /** Group heading in the results list, e.g. "Customers". */
  label: string;
  /** Hidden when the signed-in user lacks it; the server checks it again. */
  permission?: Permission;
  /** Called with a trimmed query of at least two characters. */
  search: (query: string) => Promise<PaletteResult[]>;
}

const sources: PaletteSource[] = [];

export function registerPaletteSource(source: PaletteSource): void {
  sources.push(source);
}

export function paletteSources(): readonly PaletteSource[] {
  return sources;
}
