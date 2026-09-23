import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const COOKIE_NAME = 'hola_vallarta_cms';
const SESSION_SECONDS = 60 * 60 * 12;

function secret() {
  const value = process.env.CMS_SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV !== 'production') return 'hola-vallarta-desarrollo-local-no-usar-en-produccion';
  throw new Error('CMS_SESSION_SECRET_NOT_CONFIGURED');
}

function signature(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function passwordMatches(password: string) {
  const configured = process.env.CMS_ADMIN_PASSWORD_HASH;
  if (!configured && process.env.NODE_ENV !== 'production') return password === 'hola-vallarta-local';
  if (!configured) return false;
  const [salt, expected] = configured.split(':');
  if (!salt || !expected) return false;
  return safeEqual(scryptSync(password, salt, 64).toString('hex'), expected);
}

export function validateAdminCredentials(email: string, password: string) {
  const expectedEmail = process.env.CMS_ADMIN_EMAIL ?? (process.env.NODE_ENV !== 'production' ? 'admin@holavallarta.mx' : '');
  return safeEqual(email.trim().toLowerCase(), expectedEmail.trim().toLowerCase()) && passwordMatches(password);
}

export async function createAdminSession(email: string) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = Buffer.from(JSON.stringify({ email, expires })).toString('base64url');
  (await cookies()).set(COOKIE_NAME, `${payload}.${signature(payload)}`, {
    httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_SECONDS,
  });
}

export async function destroyAdminSession() { (await cookies()).delete(COOKIE_NAME); }

export async function getAdminSession() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const [payload, suppliedSignature] = token.split('.');
  if (!payload || !suppliedSignature || !safeEqual(signature(payload), suppliedSignature)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { email: string; expires: number };
    return value.expires > Date.now() / 1000 ? value : null;
  } catch { return null; }
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) redirect('/admin/login');
  return session;
}
