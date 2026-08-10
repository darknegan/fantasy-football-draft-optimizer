import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';

export type Sql = ReturnType<typeof postgres>;
export type Sb = SupabaseClient;

type WaitUntilCtx = { waitUntil(promise: Promise<unknown>): void };

export type Db =
  | { kind: 'supabase'; sb: Sb }
  | { kind: 'sql'; sql: Sql };

const SUPABASE_URL = 'https://mvuwjtlcvsoamasbuirf.supabase.co';

/**
 * Prefer Supabase HTTP (service role) on the edge — each query is one fetch
 * and stays under the Workers Free 50-subrequest limit.
 * Fall back to Hyperdrive / DATABASE_URL TCP when configured.
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

  const hyperdrive = env.HYPERDRIVE;
  const connectionString = hyperdrive?.connectionString ?? env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'Database is not configured. Set Worker secret SUPABASE_SERVICE_ROLE_KEY ' +
        '(preferred) or DATABASE_URL / Hyperdrive HYPERDRIVE.',
    );
  }

  return {
    kind: 'sql',
    sql: postgres(connectionString, {
      prepare: false,
      max: 1,
      fetch_types: false,
      connect_timeout: 15,
      idle_timeout: 5,
      max_lifetime: 60,
      connection: { application_name: 'draftlab-api-worker' },
      ...(hyperdrive ? {} : { ssl: 'require' as const }),
    }),
  };
}

/** @deprecated use createDb */
export function createSql(env: Env): Sql {
  const db = createDb(env);
  if (db.kind !== 'sql') {
    throw new Error('createSql requires DATABASE_URL/Hyperdrive; use createDb for Supabase HTTP');
  }
  return db.sql;
}

export async function endDb(db: Db, ctx?: WaitUntilCtx): Promise<void> {
  if (db.kind === 'sql') {
    const done = db.sql.end({ timeout: 2 });
    if (ctx) ctx.waitUntil(done);
    else await done;
  }
}

export async function endSql(sql: Sql, ctx?: WaitUntilCtx): Promise<void> {
  const done = sql.end({ timeout: 2 });
  if (ctx) ctx.waitUntil(done);
  else await done;
}

export async function dbHealthCheck(db: Db): Promise<void> {
  if (db.kind === 'supabase') {
    const { error } = await db.sb.from('users').select('id').limit(1);
    if (error) throw new Error(error.message);
    return;
  }
  await db.sql`SELECT 1`;
}
