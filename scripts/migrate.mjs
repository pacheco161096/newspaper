import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL_UNPOOLED o DATABASE_URL es obligatorio para ejecutar migraciones.');

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : undefined,
});

const migrationsDirectory = path.resolve('database/migrations');
const filenames = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort();

try {
  await pool.query('create schema if not exists pipeline');
  await pool.query(`create table if not exists pipeline.schema_migrations (
    filename text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  )`);

  for (const filename of filenames) {
    const sql = await readFile(path.join(migrationsDirectory, filename), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existing = await pool.query('select checksum from pipeline.schema_migrations where filename = $1', [filename]);
    if (existing.rows[0]) {
      if (existing.rows[0].checksum !== checksum) throw new Error(`La migración aplicada cambió: ${filename}`);
      console.log(`omitida ${filename}`);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into pipeline.schema_migrations (filename, checksum) values ($1, $2)', [filename, checksum]);
      await client.query('commit');
      console.log(`aplicada ${filename}`);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
