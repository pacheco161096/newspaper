import { timingSafeEqual } from 'node:crypto';

export function isAuthorizedCron(request: Request) {
  const expected = process.env.CRON_SECRET;
  const received = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!expected || !received) return false;
  const a = Buffer.from(expected); const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
