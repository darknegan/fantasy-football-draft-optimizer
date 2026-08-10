import { pbkdf2 as pbkdf2Cb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import argon2 from 'argon2';

const pbkdf2 = promisify(pbkdf2Cb);
const PBKDF2_PREFIX = 'pbkdf2-sha256';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

async function verifyPbkdf2(encoded: string, password: string): Promise<boolean> {
  // pbkdf2-sha256$i=310000$salt$hash  (salt/hash are std base64 without padding)
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== PBKDF2_PREFIX) return false;
  const iterations = Number((parts[1] ?? '').replace(/^i=/, ''));
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  const salt = Buffer.from(padB64(parts[2] ?? ''), 'base64');
  const expected = Buffer.from(padB64(parts[3] ?? ''), 'base64');
  const actual = await pbkdf2(password, salt, iterations, expected.length, 'sha256');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function padB64(value: string): string {
  return value + '='.repeat((4 - (value.length % 4)) % 4);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    if (hash.startsWith(`${PBKDF2_PREFIX}$`)) {
      return verifyPbkdf2(hash, password);
    }
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  return null;
}

export function validateEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email';
  return null;
}
