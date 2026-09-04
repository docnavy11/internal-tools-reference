import { existsSync } from 'node:fs';
import path from 'node:path';

// Locate the repository root (the directory holding package.json) from wherever this
// module lives: src/server/ when run through tsx, dist/server/ when bundled. Nothing
// else in the server depends on the working directory.
function findRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export const appRoot = findRoot(import.meta.dirname);
export const clientDistDir = path.join(appRoot, 'dist', 'client');
export const migrationsDir = path.join(appRoot, 'drizzle');
