# Webhook de Telegram

Primera versión del bot: recibe un texto de un reportero activo, lo guarda en `pipeline.reports` y confirma en el chat. No redacta, no publica y no descarga archivos.

```text
Reportero → Bot de Telegram → POST /api/telegram/webhook
→ secreto → telegram_user_id → reportero active → pipeline.reports → sendMessage
```

## Variables

Solo en el servidor (Vercel Production, o `.env.local` en local). No uses `NEXT_PUBLIC_`.

| Variable | Uso |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Llamadas salientes a `sendMessage`. Formato `123456789:AA...` |
| `TELEGRAM_WEBHOOK_SECRET` | Valor de `secret_token` al registrar el webhook. Telegram lo reenvía en `X-Telegram-Bot-Api-Secret-Token` |

El secreto admite de 1 a 256 caracteres: `A-Z`, `a-z`, `0-9`, `_` y `-`.

Sin secreto, vacío o distinto, la ruta responde `401` sin decir cuál de los tres fue.

## Qué hace la ruta

`POST /api/telegram/webhook`

1. Compara el header con `timingSafeEqual`.
2. Lee como máximo 256 KB y exige JSON con `update_id`.
3. Solo persiste un mensaje de texto en un chat privado y de un humano. Ignora foto, video, audio, documento, ediciones y cualquier texto que empiece por `/`.
4. Busca `pipeline.reporters.telegram_user_id`. La identidad es ese número, no el `@username`.
5. Si el reportero no existe o no está `active`, no inserta y responde en el chat: `Este bot no está habilitado para esta cuenta.`
6. Inserta `channel = telegram`, `status = received`, `raw_text` y `external_message_id = {chat_id}:{message_id}`.
7. Si esa pareja ya existe, no crea otra fila. Telegram puede reenviar el update.
8. Confirma `✅ Recibí tu información.` o `✅ Esta información ya había sido recibida.`
9. Si Postgres falla, responde `500` para que Telegram reintente. Si `sendMessage` falla, el reporte ya guardado se conserva y la ruta igual responde `200`.

Fotos, `edited_message`, `channel_post` y `callback_query` responden `200` y no crean reporte.

No hace falta una migración nueva. La tabla y la llave única `(channel, external_message_id)` salen de `database/migrations/001_reporting_foundation.sql`.

## Configurar el bot

1. En Telegram, abre [@BotFather](https://t.me/BotFather) y crea un bot con `/newbot`. Copia el token a `TELEGRAM_BOT_TOKEN`.
2. Genera un secreto, por ejemplo `openssl rand -hex 32`, y guárdalo en `TELEGRAM_WEBHOOK_SECRET`.
3. Obtén tu user id numérico (abajo) e inserta un reportero activo.
4. Arranca la app y registra el webhook solo cuando la URL sea HTTPS pública. No registres producción hasta querer recibir mensajes reales.

### Reportero

```sql
insert into pipeline.reporters (display_name, telegram_user_id, status)
values ('Nombre', '123456789', 'active');
```

`123456789` es el id numérico, no el username. Para suspender:

```sql
update pipeline.reporters set status = 'suspended' where telegram_user_id = '123456789';
```

### User id

Antes de registrar el webhook, escribe cualquier mensaje al bot y consulta:

```bash
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates"
```

El id está en `message.from.id`. Cuando el webhook ya está registrado, `getUpdates` no entrega mensajes. En ese caso pregunta el id a [@userinfobot](https://t.me/userinfobot) o a [@getidsbot](https://t.me/getidsbot).

## Probar en local

Telegram no llama a `localhost`. Esta fase se prueba con un update de ejemplo contra el servidor de desarrollo.

```bash
npm run telegram:check
npm run dev
```

En otra terminal, con las dos variables cargadas en el entorno de `next dev`:

```bash
curl -sS -X POST http://localhost:3000/api/telegram/webhook \
  -H 'content-type: application/json' \
  -H "x-telegram-bot-api-secret-token: ${TELEGRAM_WEBHOOK_SECRET}" \
  -d '{"update_id":100,"message":{"message_id":7,"from":{"id":123456789,"is_bot":false,"first_name":"Ana"},"chat":{"id":123456789,"type":"private"},"date":1700000000,"text":"Prueba de reporte"}}'
```

Sustituye `123456789` por el `telegram_user_id` del reportero. La respuesta esperada es `{"ok":true,"result":"created"}`. El chat solo recibe la confirmación si `TELEGRAM_BOT_TOKEN` es real y ese `chat.id` es un chat con el bot.

Comprueba la fila:

```sql
select channel, reporter_id, raw_text, status, external_message_id, received_at
from pipeline.reports
order by received_at desc
limit 5;
```

Repite el mismo `curl`. La segunda vez debe responder `duplicate` y no insertar otra fila.

Para que Telegram llegue a tu máquina hace falta un túnel HTTPS y registrar esa URL temporal. No hace falta para validar el guardado.

`npm run telegram:check` cubre secreto, JSON inválido, update sin mensaje, usuario desconocido, reportero suspendido, reportero activo, alta, duplicado y texto vacío. No abre una base de datos.

## Registrar el webhook

No está registrado por el código en el arranque. Desde producción:

```text
GET https://hola-vallarta.vercel.app/api/telegram/webhook?register=1
```

Equivale a `setWebhook` con esa URL, `secret_token` = `TELEGRAM_WEBHOOK_SECRET` y `allowed_updates: ["message"]`. No tira la cola pendiente.

```bash
curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H 'content-type: application/json' \
  -d "{\"url\":\"https://hola-vallarta.vercel.app/api/telegram/webhook\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\",\"allowed_updates\":[\"message\"],\"drop_pending_updates\":true}"
```

`secret_token` tiene que ser exactamente `TELEGRAM_WEBHOOK_SECRET`. `allowed_updates` limita la entrega a mensajes nuevos. `drop_pending_updates` tira la cola vieja; quítalo si quieres procesarla.

Comprobar sin imprimir el token en un ticket:

```bash
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

Para pruebas locales con túnel, usa la URL del túnel en `url` y un bot distinto al de producción. Al volver a producción hay que llamar `setWebhook` otra vez: un bot solo tiene un webhook.
