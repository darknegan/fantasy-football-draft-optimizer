import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }
  pool = new Pool({ connectionString });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function assertDbReady(poolInstance: pg.Pool = getPool()): Promise<void> {
  try {
    await poolInstance.query('SELECT 1');
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot connect to Postgres (${detail}). Start it with \`docker compose up -d postgres\` ` +
        `or ensure DATABASE_URL in apps/api/.env points at a running database.`,
    );
  }
}

export function isDbConnectionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = 'code' in err ? String((err as { code?: string }).code) : '';
  return code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ENOENT' || code === '57P01';
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
