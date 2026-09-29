import { findReporterByTelegramUserId, telegramExternalMessageId } from '../pipeline/reports';
import { claimTelegramUpdate, markTelegramUpdate, releaseTelegramUpdate } from '../pipeline/telegram-updates';
import type { TelegramReporter } from '../pipeline/reports';
import { cancelTelegramSubmission, finishTelegramSubmission, receiveTelegramMessage } from '../pipeline/submissions';
import type { CancelTelegramSubmissionResult, FinishTelegramSubmissionResult, ReceiveTelegramMessageInput, ReceiveTelegramMessageResult } from '../pipeline/submissions';
import { isAuthorizedTelegramWebhook } from './auth';
import { sendMessage as deliverTelegramMessage } from './client';
import { parseTelegramUpdate } from './updates';

const MAX_BODY_BYTES = 256 * 1024;

export const TELEGRAM_COPY = {
  textOpened: '✅ Recibí tu información. Cuando termines, envía /enviar.',
  textAppended: '✅ Lo agregué a tu envío.',
  duplicate: '✅ Esta información ya había sido recibida.',
  photoOpened: '✅ Recibí tu fotografía. Cuando termines, envía /enviar.',
  photoAppended: '✅ Agregué la fotografía a tu envío.',
  photoDuplicate: '✅ Esta fotografía ya había sido recibida.',
  ready: '✅ Envío recibido. Quedó como borrador.',
  needsText: 'Falta el texto del reporte.',
  expired: 'Ese envío venció sin texto.',
  cancelled: 'Envío cancelado.',
  noSubmission: 'No tengo un envío abierto.',
  unauthorized: 'Este bot no está habilitado para esta cuenta.',
} as const;

export type TelegramWebhookDeps = {
  findReporterByTelegramUserId: (telegramUserId: string) => Promise<TelegramReporter | null>;
  receiveTelegramMessage: (input: ReceiveTelegramMessageInput) => Promise<ReceiveTelegramMessageResult>;
  finishTelegramSubmission: (reporterId: string, closeExternalMessageId?: string) => Promise<FinishTelegramSubmissionResult>;
  cancelTelegramSubmission: (reporterId: string) => Promise<CancelTelegramSubmissionResult>;
  sendMessage: (input: { chatId: string; text: string }) => Promise<void>;
  claimTelegramUpdate?: (updateId: number) => Promise<'new' | 'duplicate'>;
  markTelegramUpdate?: (updateId: number, result: string) => Promise<void>;
  releaseTelegramUpdate?: (updateId: number) => Promise<void>;
};

const defaultDeps: TelegramWebhookDeps = {
  findReporterByTelegramUserId,
  receiveTelegramMessage,
  finishTelegramSubmission,
  cancelTelegramSubmission,
  sendMessage: ({ chatId, text }) => deliverTelegramMessage({ chatId, text }),
  claimTelegramUpdate,
  markTelegramUpdate,
  releaseTelegramUpdate,
};

function logTelegram(level: 'error' | 'warn', fields: Record<string, string | number | null>) {
  const line = JSON.stringify({ source: 'telegram_webhook', ...fields });
  if (level === 'error') console.error(line);
  else console.warn(line);
}

function safeErrorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) {
    return error.code;
  }
  if (error instanceof Error && /^TELEGRAM_[A-Z0-9_:]+$/.test(error.message)) return error.message;
  return 'unknown';
}

async function readLimitedBody(request: Request) {
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    const size = Number(declared);
    if (!Number.isInteger(size) || size < 0 || size > MAX_BODY_BYTES) return 'too_large' as const;
  }
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return 'too_large' as const;
    }
    chunks.push(value);
  }
  const body = new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));
  return body.charCodeAt(0) === 0xfeff ? body.slice(1) : body;
}

async function confirm(deps: TelegramWebhookDeps, chatId: string, text: string, fields: Record<string, string | number | null>) {
  try {
    await deps.sendMessage({ chatId, text });
  } catch (error) {
    logTelegram('error', { ...fields, result: 'confirmation_failed', error: safeErrorCode(error) });
  }
}

export async function handleTelegramWebhook(request: Request, deps: TelegramWebhookDeps = defaultDeps) {
  if (!isAuthorizedTelegramWebhook(request)) return Response.json({ ok: false }, { status: 401 });

  const body = await readLimitedBody(request);
  if (body === 'too_large') return Response.json({ ok: false }, { status: 413 });

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const parsed = parseTelegramUpdate(json);
  if (parsed.kind === 'invalid') return Response.json({ ok: false }, { status: 400 });

  const updateId = parsed.kind === 'ignore' ? parsed.updateId : parsed.update.updateId;
  let claimedUpdate = false;
  if (deps.claimTelegramUpdate) {
    try {
      const claim = await deps.claimTelegramUpdate(updateId);
      if (claim === 'duplicate') {
        logTelegram('warn', { update_id: updateId, chat_id: null, reporter_id: null, result: 'duplicate_update' });
        return Response.json({ ok: true, result: 'duplicate_update' });
      }
      claimedUpdate = true;
    } catch (error) {
      logTelegram('error', { update_id: updateId, chat_id: null, reporter_id: null, result: 'db_error', error: safeErrorCode(error) });
      return Response.json({ ok: false }, { status: 500 });
    }
  }

  const finish = async (response: Response, result: string) => {
    if (!claimedUpdate) return response;
    try {
      if (response.status >= 500) await deps.releaseTelegramUpdate?.(updateId);
      else await deps.markTelegramUpdate?.(updateId, result);
    } catch (error) {
      logTelegram('error', { update_id: updateId, chat_id: null, reporter_id: null, result: 'update_log_failed', error: safeErrorCode(error) });
    }
    return response;
  };

  if (parsed.kind === 'ignore') {
    logTelegram('warn', { update_id: parsed.updateId, chat_id: null, reporter_id: null, result: 'ignored', reason: parsed.reason });
    return finish(Response.json({ ok: true, result: 'ignored', reason: parsed.reason }), 'ignored');
  }

  const { update } = parsed;
  const logBase = { update_id: update.updateId, chat_id: update.chatId, reporter_id: null as string | null };

  let reporter: TelegramReporter | null;
  try {
    reporter = await deps.findReporterByTelegramUserId(update.fromId);
  } catch (error) {
    logTelegram('error', { ...logBase, result: 'db_error', error: safeErrorCode(error) });
    return finish(Response.json({ ok: false }, { status: 500 }), 'db_error');
  }

  if (!reporter || reporter.status !== 'active') {
    logTelegram('warn', {
      ...logBase,
      reporter_id: reporter?.id ?? null,
      telegram_user_id: update.fromId,
      result: reporter ? 'suspended' : 'unknown',
    });
    await confirm(deps, update.chatId, TELEGRAM_COPY.unauthorized, logBase);
    return finish(Response.json({ ok: true, result: 'unauthorized' }), reporter ? 'suspended' : 'unknown');
  }

  if (parsed.kind === 'command') {
    let result: FinishTelegramSubmissionResult | CancelTelegramSubmissionResult;
    try {
      result = parsed.update.command === 'cancelar'
        ? await deps.cancelTelegramSubmission(reporter.id)
        : await deps.finishTelegramSubmission(reporter.id, telegramExternalMessageId(update.chatId, update.messageId));
    } catch (error) {
      logTelegram('error', { ...logBase, reporter_id: reporter.id, result: 'db_error', error: safeErrorCode(error) });
      return finish(Response.json({ ok: false }, { status: 500 }), 'db_error');
    }
    const reply = result === 'ready' ? TELEGRAM_COPY.ready
      : result === 'needs_text' ? TELEGRAM_COPY.needsText
        : result === 'expired' ? TELEGRAM_COPY.expired
          : result === 'cancelled' ? TELEGRAM_COPY.cancelled
            : TELEGRAM_COPY.noSubmission;
    logTelegram('warn', { ...logBase, reporter_id: reporter.id, result, kind: parsed.update.command });
    await confirm(deps, update.chatId, reply, { ...logBase, reporter_id: reporter.id });
    return finish(Response.json({ ok: true, result }), result);
  }

  let saved: ReceiveTelegramMessageResult;
  try {
    if (parsed.kind === 'photo') {
      saved = await deps.receiveTelegramMessage({
        reporterId: reporter.id,
        chatId: parsed.update.chatId,
        messageId: parsed.update.messageId,
        rawText: parsed.update.caption,
        fileId: parsed.update.fileId,
        mediaGroupId: parsed.update.mediaGroupId,
      });
    } else {
      saved = await deps.receiveTelegramMessage({
        reporterId: reporter.id,
        chatId: parsed.update.chatId,
        messageId: parsed.update.messageId,
        rawText: parsed.update.text,
        fileId: null,
        mediaGroupId: null,
      });
    }
  } catch (error) {
    logTelegram('error', { ...logBase, reporter_id: reporter.id, result: 'db_error', error: safeErrorCode(error) });
    return finish(Response.json({ ok: false }, { status: 500 }), 'db_error');
  }

  const isPhoto = parsed.kind === 'photo';
  const reply = saved.outcome === 'duplicate'
    ? (isPhoto ? TELEGRAM_COPY.photoDuplicate : TELEGRAM_COPY.duplicate)
    : saved.placement === 'appended'
      ? (isPhoto ? TELEGRAM_COPY.photoAppended : TELEGRAM_COPY.textAppended)
      : (isPhoto ? TELEGRAM_COPY.photoOpened : TELEGRAM_COPY.textOpened);
  logTelegram('warn', { ...logBase, reporter_id: reporter.id, result: saved.outcome === 'duplicate' ? 'duplicate' : saved.placement, kind: isPhoto ? 'photo' : 'text' });
  const outcome = saved.outcome === 'duplicate' ? 'duplicate' : 'created';
  await confirm(deps, update.chatId, reply, { ...logBase, reporter_id: reporter.id });
  return finish(Response.json({ ok: true, result: outcome }), outcome);
}
