import postgres from 'postgres';

export type Sql = ReturnType<typeof postgres>;

type WaitUntilCtx = { waitUntil(promise: Promise<unknown>): void };

/** Create a short-lived SQL client for one Worker request. */
export function createSql(env: Env): Sql {
  const hyperdrive = env.HYPERDRIVE;
  const connectionString = hyperdrive?.connectionString ?? env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'Database is not configured. Set Worker secret DATABASE_URL or bind Hyperdrive as HYPERDRIVE.',
    );
  }

  return postgres(connectionString, {
    // Required for Supabase transaction pooler and recommended with Hyperdrive.
    prepare: false,
    max: 5,
    fetch_types: false,
    // Hyperdrive terminates TLS to the origin; direct/pooler URLs need TLS.
    ...(hyperdrive ? {} : { ssl: 'require' as const }),
  });
}

export async function endSql(sql: Sql, ctx?: WaitUntilCtx): Promise<void> {
  const done = sql.end({ timeout: 2 });
  if (ctx) ctx.waitUntil(done);
  else await done;
}
