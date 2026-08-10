/** Workers-safe password hashing via Web Crypto PBKDF2 (no WASM). */

// Workers Free allows ~10ms CPU/request — keep this modest. Salt + HTTPS mitigate.
const PBKDF2_ITERS = 12_000;
const PBKDF2_PREFIX = 'pbkdf2-sha256';

function b64Encode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=+$/g, '');
}

function b64Decode(value: string): Uint8Array {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(password, salt, PBKDF2_ITERS);
  return `${PBKDF2_PREFIX}$i=${PBKDF2_ITERS}$${b64Encode(salt)}$${b64Encode(hash)}`;
}

async function verifyPbkdf2(encoded: string, password: string): Promise<boolean> {
  // pbkdf2-sha256$i=310000$salt$hash
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== PBKDF2_PREFIX) return false;
  const iterations = Number((parts[1] ?? '').replace(/^i=/, ''));
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  const salt = b64Decode(parts[2] ?? '');
  const expected = b64Decode(parts[3] ?? '');
  const actual = await pbkdf2(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

/**
 * Legacy Argon2id hashes from the Node API (`argon2` package).
 * Pure-JS Argon2 at m=65536 is too heavy for Workers Free, so we only
 * accept PBKDF2 on the edge. Users with Argon2 hashes can re-register or
 * log in once via the Node API and we can migrate later.
 */
export async function verifyPassword(encoded: string, password: string): Promise<boolean> {
  if (encoded.startsWith(`${PBKDF2_PREFIX}$`)) {
    return verifyPbkdf2(encoded, password);
  }
  if (encoded.startsWith('$argon2')) {
    return false;
  }
  return false;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  return null;
}

export function validateEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email';
  return null;
}
