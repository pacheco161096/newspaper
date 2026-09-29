import { isAuthorizedTelegramWebhook } from '../lib/telegram/auth';
import { sendMessage } from '../lib/telegram/client';
import { telegramExternalMessageId } from '../lib/pipeline/reports';
import { parseReporterDraft, shouldRewriteReporterArticle } from '../lib/pipeline/editorial';
import { reporterErrorRetries } from '../lib/pipeline/report-processing';
import { draftFromReporterTexts } from '../lib/pipeline/submissions';
import { telegramPhotoMeta } from '../lib/telegram/client';
import { parseTelegramUpdate } from '../lib/telegram/updates';
import { handleTelegramWebhook, TELEGRAM_COPY } from '../lib/telegram/webhook';
import type { TelegramWebhookDeps } from '../lib/telegram/webhook';

const SECRET = 'test-webhook-secret';
const REPORTER_ID = '11111111-1111-4111-8111-111111111111';

let failed = 0;

function assert(condition: unknown, message: string) {
  if (condition) return;
  failed += 1;
  console.error(`FAIL ${message}`);
}

function textUpdate(text: string, patch: Record<string, unknown> = {}) {
  return {
    update_id: 100,
    message: {
      message_id: 7,
      from: { id: 555, is_bot: false, first_name: 'Ana', last_name: 'López', username: 'ana' },
      chat: { id: 555, type: 'private' },
      date: 1_700_000_000,
      text,
      ...patch,
    },
  };
}

function request(body: string, secret: string | null = SECRET) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (secret !== null) headers.set('x-telegram-bot-api-secret-token', secret);
  return new Request('http://localhost/api/telegram/webhook', { method: 'POST', headers, body });
}

const LARGE_FILE_ID = 'AgACAgIAAxkBAAIBYWlargephoto123456';
const SMALL_FILE_ID = 'AgACAgIAAxkBAAIBYWsmallphoto123456';

function deps(
  reporter: { id: string; status: string } | null,
  outcome: 'created' | 'duplicate' | 'throw' = 'created',
  placement: 'opened' | 'appended' = 'opened',
  finishResult: 'ready' | 'needs_text' | 'expired' | 'none' = 'none',
  cancelResult: 'cancelled' | 'none' = 'none',
) {
  const calls = {
    find: [] as string[],
    messages: [] as Array<{ reporterId: string; chatId: string; messageId: number; rawText: string; fileId: string | null; mediaGroupId: string | null }>,
    finish: [] as string[],
    cancel: [] as string[],
    send: [] as string[],
  };
  const doubles: TelegramWebhookDeps = {
    async findReporterByTelegramUserId(telegramUserId) {
      calls.find.push(telegramUserId);
      return reporter;
    },
    async receiveTelegramMessage(input) {
      calls.messages.push(input);
      if (outcome === 'throw') throw Object.assign(new Error('insert failed'), { code: '08006' });
      if (outcome === 'duplicate') return { outcome: 'duplicate' };
      return { outcome: 'created', placement, reportId: '22222222-2222-4222-8222-222222222222' };
    },
    async finishTelegramSubmission(reporterId) {
      calls.finish.push(reporterId);
      return finishResult;
    },
    async cancelTelegramSubmission(reporterId) {
      calls.cancel.push(reporterId);
      return cancelResult;
    },
    async sendMessage(input) {
      calls.send.push(input.text);
    },
  };
  return { calls, doubles };
}

async function post(body: unknown, options: { secret?: string | null; reporter?: { id: string; status: string } | null; outcome?: 'created' | 'duplicate' | 'throw'; placement?: 'opened' | 'appended'; finishResult?: 'ready' | 'needs_text' | 'expired' | 'none'; cancelResult?: 'cancelled' | 'none' } = {}) {
  const { calls, doubles } = deps(options.reporter === undefined ? { id: REPORTER_ID, status: 'active' } : options.reporter, options.outcome ?? 'created', options.placement ?? 'opened', options.finishResult ?? 'none', options.cancelResult ?? 'none');
  const response = await handleTelegramWebhook(
    request(typeof body === 'string' ? body : JSON.stringify(body), options.secret === undefined ? SECRET : options.secret),
    doubles,
  );
  return { status: response.status, json: await response.json() as { ok?: boolean; result?: string; reason?: string }, calls };
}

async function main() {
  const previousSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const warn = console.warn;
  const error = console.error;
  console.warn = () => undefined;
  console.error = (...args: unknown[]) => {
    if (String(args[0] ?? '').startsWith('FAIL') || String(args[0] ?? '').includes('comprobaciones fallaron')) error(...args);
  };
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;

  const authorized = new Request('http://localhost/api/telegram/webhook', { headers: { 'x-telegram-bot-api-secret-token': SECRET } });
  const rejected = new Request('http://localhost/api/telegram/webhook', { headers: { 'x-telegram-bot-api-secret-token': 'otro-secreto' } });
  assert(isAuthorizedTelegramWebhook(authorized) === true, 'secret correcto');
  assert(isAuthorizedTelegramWebhook(rejected) === false, 'secret incorrecto');
  assert(isAuthorizedTelegramWebhook(new Request('http://localhost/api/telegram/webhook')) === false, 'secret ausente');
  process.env.TELEGRAM_WEBHOOK_SECRET = '';
  assert(isAuthorizedTelegramWebhook(authorized) === false, 'secret vacio');
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;

  const invalidJson = await post('{');
  assert(invalidJson.status === 400 && invalidJson.calls.find.length === 0, 'JSON invalido');

  const withoutMessage = await post({ update_id: 4, callback_query: { id: '1' } });
  assert(withoutMessage.status === 200 && withoutMessage.json.result === 'ignored' && withoutMessage.calls.messages.length === 0, 'update sin message');

  const unknown = await post(textUpdate('Prueba de reporte'), { reporter: null });
  assert(unknown.status === 200 && unknown.json.result === 'unauthorized' && unknown.calls.messages.length === 0 && unknown.calls.send[0] === TELEGRAM_COPY.unauthorized, 'usuario desconocido');

  const suspended = await post(textUpdate('Prueba de reporte'), { reporter: { id: REPORTER_ID, status: 'suspended' } });
  assert(suspended.status === 200 && suspended.calls.messages.length === 0 && suspended.calls.send[0] === TELEGRAM_COPY.unauthorized, 'reporter suspendido');

  const active = await post(textUpdate('Prueba de reporte'));
  assert(active.status === 200 && active.json.result === 'created' && active.calls.find[0] === '555' && active.calls.messages[0]?.reporterId === REPORTER_ID && active.calls.send[0] === TELEGRAM_COPY.textOpened, 'reporter activo');

  const created = await post(textUpdate('Prueba de reporte'));
  assert(created.json.result === 'created' && created.calls.messages[0]?.rawText === 'Prueba de reporte' && created.calls.messages[0]?.chatId === '555' && created.calls.messages[0]?.messageId === 7, 'mensaje nuevo');

  const duplicate = await post(textUpdate('Prueba de reporte'), { outcome: 'duplicate' });
  assert(duplicate.status === 200 && duplicate.json.result === 'duplicate' && duplicate.calls.send[0] === TELEGRAM_COPY.duplicate, 'mensaje duplicado');

  const empty = await post(textUpdate('   '));
  assert(empty.status === 200 && empty.json.reason === 'empty_text' && empty.calls.find.length === 0 && empty.calls.messages.length === 0, 'texto vacio');

  const wrongSecret = await post(textUpdate('Prueba de reporte'), { secret: 'no-coincide' });
  assert(wrongSecret.status === 401 && wrongSecret.calls.find.length === 0, 'webhook rechaza secret incorrecto');

  const photo = await post({
    update_id: 9,
    message: {
      message_id: 3,
      photo: [
        { file_id: SMALL_FILE_ID, width: 90, height: 90, file_size: 1000 },
        { file_id: LARGE_FILE_ID, width: 1280, height: 720, file_size: 80000 },
      ],
      caption: 'Incendio en el centro',
      media_group_id: 'album-1',
      chat: { id: 555, type: 'private' },
      from: { id: 555 },
    },
  });
  assert(photo.status === 200 && photo.json.result === 'created' && photo.calls.messages[0]?.fileId === LARGE_FILE_ID && photo.calls.messages[0]?.rawText === 'Incendio en el centro' && photo.calls.messages[0]?.mediaGroupId === 'album-1' && photo.calls.send[0] === TELEGRAM_COPY.photoOpened, 'foto guarda el file_id grande');

  const photoOnly = await post({ update_id: 10, message: { message_id: 4, photo: [{ file_id: LARGE_FILE_ID, width: 800, height: 600 }], chat: { id: 555, type: 'private' }, from: { id: 555 } } });
  assert(photoOnly.json.result === 'created' && photoOnly.calls.messages[0]?.rawText === '' && photoOnly.calls.messages[0]?.fileId === LARGE_FILE_ID, 'foto sin caption');

  const duplicatePhoto = await post({ update_id: 11, message: { message_id: 5, photo: [{ file_id: LARGE_FILE_ID, width: 800, height: 600 }], chat: { id: 555, type: 'private' }, from: { id: 555 } } }, { outcome: 'duplicate' });
  assert(duplicatePhoto.status === 200 && duplicatePhoto.json.result === 'duplicate' && duplicatePhoto.calls.send[0] === TELEGRAM_COPY.photoDuplicate, 'foto duplicada');

  const unknownPhoto = await post({ update_id: 12, message: { message_id: 6, photo: [{ file_id: LARGE_FILE_ID, width: 800, height: 600 }], chat: { id: 555, type: 'private' }, from: { id: 555 } } }, { reporter: null });
  assert(unknownPhoto.status === 200 && unknownPhoto.calls.messages.length === 0 && unknownPhoto.calls.send[0] === TELEGRAM_COPY.unauthorized, 'foto de usuario desconocido');

  const video = await post({ update_id: 13, message: { message_id: 8, video: { file_id: LARGE_FILE_ID }, chat: { id: 555, type: 'private' }, from: { id: 555 } } });
  assert(video.status === 200 && video.json.reason === 'video' && video.calls.messages.length === 0, 'video no crea reporte');

  const shortFileId = await post({ update_id: 14, message: { message_id: 9, photo: [{ file_id: 'abc' }], chat: { id: 555, type: 'private' }, from: { id: 555 } } });
  assert(shortFileId.status === 200 && shortFileId.json.reason === 'invalid_photo' && shortFileId.calls.messages.length === 0, 'file_id invalido');

  const appended = await post(textUpdate('Otro dato'), { placement: 'appended' });
  assert(appended.calls.send[0] === TELEGRAM_COPY.textAppended && appended.calls.messages.length === 1, 'texto agregado al envio');

  const enviar = await post(textUpdate('/enviar'), { finishResult: 'ready' });
  assert(enviar.status === 200 && enviar.json.result === 'ready' && enviar.calls.messages.length === 0 && enviar.calls.finish[0] === REPORTER_ID && enviar.calls.send[0] === TELEGRAM_COPY.ready, 'enviar cierra con texto');

  const enviarSinTexto = await post(textUpdate('/enviar@HolaVallartaNoticiasBot'), { finishResult: 'needs_text' });
  assert(enviarSinTexto.calls.messages.length === 0 && enviarSinTexto.calls.send[0] === TELEGRAM_COPY.needsText, 'enviar sin texto');

  const cancelar = await post(textUpdate('/cancelar'), { cancelResult: 'cancelled' });
  assert(cancelar.json.result === 'cancelled' && cancelar.calls.cancel[0] === REPORTER_ID && cancelar.calls.send[0] === TELEGRAM_COPY.cancelled, 'cancelar');

  const sinEnvio = await post(textUpdate('/enviar'), { finishResult: 'none' });
  assert(sinEnvio.calls.send[0] === TELEGRAM_COPY.noSubmission, 'enviar sin envio');

  const start = await post(textUpdate('/start'));
  assert(start.json.reason === 'command' && start.calls.messages.length === 0 && start.calls.finish.length === 0, 'otro comando se ignora');

  const comandoAjeno = await post(textUpdate('/cancelar'), { reporter: null, cancelResult: 'cancelled' });
  assert(comandoAjeno.calls.cancel.length === 0 && comandoAjeno.calls.send[0] === TELEGRAM_COPY.unauthorized, 'comando de usuario desconocido');

  const parsedCommand = parseTelegramUpdate(textUpdate('/enviar@bot'));
  assert(parsedCommand.kind === 'command' && parsedCommand.update.command === 'enviar', 'parser de enviar');

  const parsed = parseTelegramUpdate(textUpdate('  Hola  '));
  assert(parsed.kind === 'text' && parsed.update.text === 'Hola' && parsed.update.username === 'ana' && parsed.update.fromId === '555', 'parser de texto');
  assert(telegramExternalMessageId('555', 7) === '555:7', 'external_message_id');
  const draft = draftFromReporterTexts(['  Incendio en el centro  ', '', 'Hay dos heridos.']);
  assert(draft.title === 'Incendio en el centro' && draft.summary.startsWith('Incendio en el centro') && draft.body.includes('Hay dos heridos.'), 'borrador usa el texto crudo');
  assert(telegramPhotoMeta('photos/file_1.jpg').contentType === 'image/jpeg', 'foto jpg');
  let badPath = false;
  try { telegramPhotoMeta('../secreto.jpg'); } catch { badPath = true; }
  assert(badPath, 'ruta de foto invalida');
  const rewritten = parseReporterDraft(JSON.stringify({ title: 'Incendio en el centro', summary: 'Hay dos heridos.', bodyText: 'Un incendio en el centro dejó dos heridos. Los equipos siguen en el lugar y no hay una causa confirmada.'.padEnd(80, '.') }));
  assert(rewritten.title === 'Incendio en el centro' && (rewritten.bodyText ?? '').length >= 80, 'redaccion de reportero');
  assert(shouldRewriteReporterArticle('unpublished', 'processing') && !shouldRewriteReporterArticle('published', 'processing'), 'no reescribe una nota ya publicada');
  assert(!reporterErrorRetries('EDITORIAL_INSUFFICIENT_FACTS') && reporterErrorRetries('BLOB_READ_WRITE_TOKEN_MISSING'), 'reintento de redacción');

  const seen = new Set<number>();
  const released: number[] = [];
  const tracked = deps({ id: REPORTER_ID, status: 'active' });
  tracked.doubles.claimTelegramUpdate = async (id) => {
    if (seen.has(id)) return 'duplicate';
    seen.add(id);
    return 'new';
  };
  tracked.doubles.markTelegramUpdate = async () => undefined;
  tracked.doubles.releaseTelegramUpdate = async (id) => { released.push(id); seen.delete(id); };
  const firstUpdate = await handleTelegramWebhook(request(JSON.stringify(textUpdate('Prueba de reporte'))), tracked.doubles);
  const secondUpdate = await handleTelegramWebhook(request(JSON.stringify(textUpdate('Prueba de reporte'))), tracked.doubles);
  assert(firstUpdate.status === 200 && secondUpdate.status === 200 && (await secondUpdate.json()).result === 'duplicate_update' && tracked.calls.send.length === 1 && tracked.calls.messages.length === 1, 'update repetido no vuelve a confirmar');

  const failing = deps({ id: REPORTER_ID, status: 'active' }, 'throw');
  failing.doubles.claimTelegramUpdate = async () => 'new';
  failing.doubles.releaseTelegramUpdate = async (id) => { released.push(id); };
  const failedUpdate = await handleTelegramWebhook(request(JSON.stringify(textUpdate('Prueba de reporte'))), failing.doubles);
  assert(failedUpdate.status === 500 && released.includes(100), 'un error de postgres libera el update');

  const dbError = await post(textUpdate('Prueba de reporte'), { outcome: 'throw' });
  assert(dbError.status === 500 && dbError.calls.send.length === 0, 'error de postgres');

  const { calls, doubles } = deps({ id: REPORTER_ID, status: 'active' });
  doubles.sendMessage = async () => { throw new Error('TELEGRAM_SEND_FAILED:403'); };
  const sent = await handleTelegramWebhook(request(JSON.stringify(textUpdate('Prueba de reporte'))), doubles);
  assert(sent.status === 200 && calls.messages.length === 1, 'fallo de Telegram no borra el reporte');

  const logs: string[] = [];
  console.warn = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  await post(textUpdate('Prueba de reporte secreta'));
  await post({ update_id: 15, message: { message_id: 16, photo: [{ file_id: LARGE_FILE_ID, width: 800, height: 600 }], caption: 'Incendio secreto', chat: { id: 555, type: 'private' }, from: { id: 555 } } });
  console.warn = () => undefined;
  const logged = logs.join('\n');
  assert(!logged.includes('Prueba de reporte secreta') && !logged.includes(SECRET) && !logged.includes(LARGE_FILE_ID) && !logged.includes('Incendio secreto'), 'el log no incluye texto, file_id ni secret');

  const token = '123456789:AAHexampletokenvalue1234567890';
  process.env.TELEGRAM_BOT_TOKEN = token;
  const originalFetch = globalThis.fetch;
  let payload: { chat_id?: string; text?: string; disable_notification?: boolean } = {};
  globalThis.fetch = async (_url, init) => {
    payload = JSON.parse(String(init && 'body' in init ? init.body : '{}')) as typeof payload;
    return new Response(JSON.stringify({ ok: false, error_code: 400, description: `bot ${token}` }), { status: 400 });
  };
  let clientError = '';
  try {
    await sendMessage({ chatId: 42, text: 'hola', options: { disable_notification: true, chat_id: 'evil', text: 'no' } });
  } catch (error) {
    clientError = error instanceof Error ? error.message : '';
  }
  globalThis.fetch = originalFetch;
  assert(payload.chat_id === '42' && payload.text === 'hola' && payload.disable_notification === true, 'sendMessage arma el cuerpo');
  assert(clientError === 'TELEGRAM_SEND_FAILED:400' && !clientError.includes(token), 'sendMessage no filtra el token');

  console.warn = warn;
  console.error = error;
  if (previousSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
  else process.env.TELEGRAM_WEBHOOK_SECRET = previousSecret;
  if (previousToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = previousToken;

  if (failed) {
    console.error(`${failed} comprobaciones fallaron`);
    process.exitCode = 1;
    return;
  }
  console.log('telegram checks ok');
}

await main();
