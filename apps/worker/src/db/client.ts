import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type postgres from 'postgres';

export type Sb = SupabaseClient;
export type Sql = ReturnType<typeof postgres>;

type WaitUntilCtx = { waitUntil(promise: Promise<unknown>): void };

export type Db =
  | { kind: 'supabase'; sb: Sb }
  | { kind: 'sql'; sql: Sql };

const SUPABASE_URL = 'https://mvuwjtlcvsoamasbuirf.supabase.co';

/**
 * Prefer Supabase HTTP (service role) on the edge — each query is one fetch
 * and stays under the Workers Free 50-subrequest limit.
 */
export function createDb(env: Env): Db {
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      kind: 'supabase',
      sb: createClient(SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    };
  }

  throw new Error(
    'Database is not configured. Set Worker secret SUPABASE_SERVICE_ROLE_KEY ' +
      '(preferred on Workers Free).',
  );
}

export async function endDb(db: Db, ctx?: WaitUntilCtx): Promise<void> {
  if (db.kind === 'sql') {
    const done = db.sql.end({ timeout: 2 });
    if (ctx) ctx.waitUntil(done);
    else await done;
  }
}

export async function dbHealthCheck(db: Db): Promise<void> {
  if (db.kind === 'supabase') {
    const { error } = await db.sb.from('users').select('id').limit(1);
    if (error) throw new Error(error.message);
    return;
  }
  await db.sql`SELECT 1`;
}
