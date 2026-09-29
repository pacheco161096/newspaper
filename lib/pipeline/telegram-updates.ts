import { getPostgresPool } from '../server/postgres';

export async function claimTelegramUpdate(updateId: number) {
  if (!Number.isSafeInteger(updateId) || updateId < 0) throw new Error('TELEGRAM_UPDATE_ID_INVALID');
  const result = await getPostgresPool().query<{ update_id: string }>(
    `insert into pipeline.telegram_updates (update_id) values ($1)
     on conflict (update_id) do nothing
     returning update_id`,
    [updateId],
  );
  return result.rows[0] ? 'new' as const : 'duplicate' as const;
}

export async function markTelegramUpdate(updateId: number, result: string) {
  await getPostgresPool().query(
    `update pipeline.telegram_updates set result = $2 where update_id = $1`,
    [updateId, result.slice(0, 40)],
  );
}

export async function releaseTelegramUpdate(updateId: number) {
  await getPostgresPool().query(`delete from pipeline.telegram_updates where update_id = $1`, [updateId]);
}
