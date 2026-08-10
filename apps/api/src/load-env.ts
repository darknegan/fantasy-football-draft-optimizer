import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Load apps/api/.env before any auth/db code reads process.env. */
export function loadEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../.env'),
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'apps/api/.env'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      // Prefer apps/api/.env over a stale exported shell DATABASE_URL.
      config({ path, override: true });
      return;
    }
  }
}
