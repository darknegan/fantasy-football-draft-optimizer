import { argon2id, argon2Verify } from 'hash-wasm';

/** Match Node `argon2` package defaults used by apps/api (m=65536,t=3,p=4). */
const ARGON2_OPTS = {
  parallelism: 4,
  memorySize: 65536,
  iterations: 3,
  hashLength: 32,
  outputType: 'encoded' as const,
};

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return argon2id({
    password,
    salt,
    ...ARGON2_OPTS,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash });
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
