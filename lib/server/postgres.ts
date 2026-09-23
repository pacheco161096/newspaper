import { Pool } from 'pg';
import { attachDatabasePool } from '@vercel/functions';

declare global {
  var holaVallartaPostgresPool: Pool | undefined;
}

export function getPostgresPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL_NOT_CONFIGURED');

  if (!globalThis.holaVallartaPostgresPool) {
    const pool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 30_000,
      ssl: process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : undefined,
    });
    if (process.env.VERCEL) attachDatabasePool(pool);
    globalThis.holaVallartaPostgresPool = pool;
  }

  return globalThis.holaVallartaPostgresPool;
}
