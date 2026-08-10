import { createMiddleware } from 'hono/factory';
import { jwtVerify } from 'jose';

export type WorkerUser = { sub: string; email: string; displayName: string };

export const requireAccessJwt = createMiddleware<{
  Bindings: Env;
  Variables: { user: WorkerUser };
}>(async (c, next) => {
  const secret = c.env.JWT_ACCESS_SECRET;
  if (!secret) {
    return c.json(
      { error: 'Auth is not configured on the edge Worker. Set JWT_ACCESS_SECRET.' },
      503,
    );
  }
  const header = c.req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  try {
    const token = header.slice('Bearer '.length);
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (!payload.sub || typeof payload['email'] !== 'string') {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    c.set('user', {
      sub: payload.sub,
      email: payload['email'],
      displayName: typeof payload['displayName'] === 'string' ? payload['displayName'] : '',
    });
    await next();
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }
});

export function dbUnavailable(detail?: string) {
  return {
    error: 'Database unavailable',
    detail:
      detail ??
      'Configure SUPABASE_SERVICE_ROLE_KEY (preferred on Workers Free) or Hyperdrive / DATABASE_URL on draftlab-api.',
  };
}
