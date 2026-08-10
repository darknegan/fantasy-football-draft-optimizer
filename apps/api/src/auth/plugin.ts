import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken, type AccessClaims } from './tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AccessClaims;
  }
}

export function getBearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = getBearerToken(req);
  if (!token) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
  try {
    req.user = await verifyAccessToken(token);
  } catch {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}

export function requireUser(req: FastifyRequest): AccessClaims {
  if (!req.user) throw new Error('Missing authenticated user');
  return req.user;
}

export async function registerAuthDecorators(app: FastifyInstance): Promise<void> {
  app.decorateRequest('user', undefined);
}
