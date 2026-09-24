import { isAuthorizedTelegramWebhook } from '../lib/telegram/auth';
import { sendMessage } from '../lib/telegram/client';
import { telegramExternalMessageId } from '../lib/pipeline/reports';
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

function deps(reporter: { id: string; status: string } | null, outcome: 'created' | 'duplicate' | 'throw' = 'created') {
  const calls = { find: [] as string[], create: [] as Array<{ reporterId: string; chatId: string; messageId: number; rawText: string }>, send: [] as string[] };
  const doubles: TelegramWebhookDeps = {
    async findReporterByTelegramUserId(telegramUserId) {
      calls.find.push(telegramUserId);
      return reporter;
    },
    async createTelegramReport(input) {
      calls.create.push(input);
      if (outcome === 'throw') throw Object.assign(new Error('insert failed'), { code: '08006' });
      if (outcome === 'duplicate') return { outcome: 'duplicate' };
      return { outcome: 'created', id: '22222222-2222-4222-8222-222222222222' };
    },
    async sendMessage(input) {
      calls.send.push(input.text);
    },
  };
  return { calls, doubles };
}

async function post(body: unknown, options: { secret?: string | null; reporter?: { id: string; status: string } | null; outcome?: 'created' | 'duplicate' | 'throw' } = {}) {
  const { calls, doubles } = deps(options.reporter === undefined ? { id: REPORTER_ID, status: 'active' } : options.reporter, options.outcome ?? 'created');
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
  assert(withoutMessage.status === 200 && withoutMessage.json.result === 'ignored' && withoutMessage.calls.create.length === 0, 'update sin message');

  const unknown = await post(textUpdate('Prueba de reporte'), { reporter: null });
  assert(unknown.status === 200 && unknown.json.result === 'unauthorized' && unknown.calls.create.length === 0 && unknown.calls.send[0] === TELEGRAM_COPY.unauthorized, 'usuario desconocido');

  const suspended = await post(textUpdate('Prueba de reporte'), { reporter: { id: REPORTER_ID, status: 'suspended' } });
  assert(suspended.status === 200 && suspended.calls.create.length === 0 && suspended.calls.send[0] === TELEGRAM_COPY.unauthorized, 'reporter suspendido');

  const active = await post(textUpdate('Prueba de reporte'));
  assert(active.status === 200 && active.json.result === 'created' && active.calls.find[0] === '555' && active.calls.create[0]?.reporterId === REPORTER_ID && active.calls.send[0] === TELEGRAM_COPY.received, 'reporter activo');

  const created = await post(textUpdate('Prueba de reporte'));
  assert(created.json.result === 'created' && created.calls.create[0]?.rawText === 'Prueba de reporte' && created.calls.create[0]?.chatId === '555' && created.calls.create[0]?.messageId === 7, 'mensaje nuevo');

  const duplicate = await post(textUpdate('Prueba de reporte'), { outcome: 'duplicate' });
  assert(duplicate.status === 200 && duplicate.json.result === 'duplicate' && duplicate.calls.send[0] === TELEGRAM_COPY.duplicate, 'mensaje duplicado');

  const empty = await post(textUpdate('   '));
  assert(empty.status === 200 && empty.json.reason === 'empty_text' && empty.calls.find.length === 0 && empty.calls.create.length === 0, 'texto vacio');

  const wrongSecret = await post(textUpdate('Prueba de reporte'), { secret: 'no-coincide' });
  assert(wrongSecret.status === 401 && wrongSecret.calls.find.length === 0, 'webhook rechaza secret incorrecto');

  const photo = await post({ update_id: 9, message: { message_id: 3, photo: [{ file_id: 'abc' }], caption: 'foto', chat: { id: 555, type: 'private' }, from: { id: 555 } } });
  assert(photo.status === 200 && photo.json.reason === 'photo' && photo.calls.create.length === 0, 'foto no crea reporte');

  const parsed = parseTelegramUpdate(textUpdate('  Hola  '));
  assert(parsed.kind === 'text' && parsed.update.text === 'Hola' && parsed.update.username === 'ana' && parsed.update.fromId === '555', 'parser de texto');
  assert(telegramExternalMessageId('555', 7) === '555:7', 'external_message_id');

  const dbError = await post(textUpdate('Prueba de reporte'), { outcome: 'throw' });
  assert(dbError.status === 500 && dbError.calls.send.length === 0, 'error de postgres');

  const { calls, doubles } = deps({ id: REPORTER_ID, status: 'active' });
  doubles.sendMessage = async () => { throw new Error('TELEGRAM_SEND_FAILED:403'); };
  const sent = await handleTelegramWebhook(request(JSON.stringify(textUpdate('Prueba de reporte'))), doubles);
  assert(sent.status === 200 && calls.create.length === 1, 'fallo de Telegram no borra el reporte');

  const logs: string[] = [];
  console.warn = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  await post(textUpdate('Prueba de reporte secreta'));
  console.warn = () => undefined;
  const logged = logs.join('\n');
  assert(!logged.includes('Prueba de reporte secreta') && !logged.includes(SECRET), 'el log no incluye texto ni secret');

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
