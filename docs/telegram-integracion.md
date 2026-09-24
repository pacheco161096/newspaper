# Integración de Telegram — análisis técnico

Análisis del proyecto Hola Vallarta para recibir noticias de reporteros por un bot de Telegram, reutilizando el pipeline y el CMS que ya existen.

Las fases 1 y 2 (webhook y texto) ya están implementadas. La operación está en [telegram-webhook.md](./telegram-webhook.md). Este documento sigue siendo el análisis: fotos, envíos, IA y publicación no están hechas.

Fecha: 24 de septiembre de 2026.

El bot encaja en el dominio que el proyecto ya reservó (`Reporter → Report → Contribution → NewsEvent → PublishedArticle`), pero hoy ese camino no tiene código: las noticias que se publican entran por otro tubo, el de medios externos. No hay almacenamiento de archivos ni galería; una nota solo admite una URL de imagen.

## A. Arquitectura actual

Next.js **16.3** (`next: ^16.3.6`), React 19.2, TypeScript 5.9, Node 22. **App Router** en `app/`. No hay `middleware.ts`. No hay Pages Router activo.

No hay ORM. El acceso a datos es SQL con `pg` en `lib/server/postgres.ts` (pool, SSL, `attachDatabasePool` de `@vercel/functions` cuando corre en Vercel). Esquemas `cms` y `pipeline`. Migraciones en `database/migrations/`, aplicadas por `scripts/migrate.mjs`.

| Pieza | Dónde está |
| --- | --- |
| Sitio público | `app/page.tsx`, `app/[category]/page.tsx`, `app/noticias/[slug]/page.tsx`, `app/autores/[slug]/page.tsx` |
| Lectura pública | `lib/content-provider.ts` (solo artículos `published`) |
| CMS | `app/admin/**`, Server Actions en `app/admin/actions.ts` |
| Auth del panel | `lib/cms/auth.ts` (cookie HMAC `hola_vallarta_cms`, 12 h) |
| Artículos y autores | `lib/cms/repository.ts`, `lib/cms/types.ts` |
| Contratos de dominio | `lib/domain.ts` |
| Descubrimiento de medios | `lib/pipeline/discovery.ts`, `lib/pipeline/sources.ts` |
| Cola, bloqueo, idempotencia de fuentes | `lib/pipeline/repository.ts` |
| Clasificar / resolver / redactar | `lib/pipeline/classify.ts`, `resolve.ts`, `editorial.ts` |
| OpenAI | `lib/pipeline/openai.ts` (`fetch` a `api.openai.com`, sin SDK) |
| Crons | `app/api/cron/{discover,classify,resolve,editorial}/route.ts` |
| Auth de crons | `lib/server/cron-auth.ts` (`Authorization: Bearer CRON_SECRET`) |
| SEO | `app/sitemap.ts`, `app/robots.ts`, `generateMetadata` y JSON-LD en la ficha |
| Sitio / URL | `lib/site.ts` (`NEXT_PUBLIC_SITE_URL`) |
| SQL | `database/migrations/001`–`010` |

La carpeta `cms/` es un Strapi de arranque que **no** es el CMS en producción. El panel real es `/admin`.

Despliegue: Vercel (`hola-vallarta`, URL `https://hola-vallarta.vercel.app`). Postgres en Neon (pool para la app, conexión directa para migraciones). Docker solo para Postgres local. Los jobs salen de cron-job.org hacia esas rutas POST, con `maxDuration = 60`.

Librerías de runtime: `next`, `react`, `pg`, `cheerio`, `fast-xml-parser`, `@vercel/functions`. No hay Zod, logger, cola, storage SDK ni cliente de Telegram.

Variables que el código lee:

- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED` / `MIGRATION_DATABASE_URL`
- `DATABASE_SSL`
- `DATABASE_SSL_REJECT_UNAUTHORIZED`
- `DATABASE_POOL_MAX`
- `CMS_ADMIN_EMAIL`
- `CMS_ADMIN_PASSWORD_HASH`
- `CMS_SESSION_SECRET`
- `CRON_SECRET`
- `NEXT_PUBLIC_SITE_URL`
- `OPENAI_API_KEY`
- `OPENAI_CLASSIFY_MODEL`
- `OPENAI_EDITORIAL_MODEL`
- `VERCEL`

## B. Flujo actual de noticias

Hay dos entradas. La que publica sola es la de medios. La de reportero está en el esquema y en `lib/domain.ts`, y no tiene funciones ni endpoints.

**Flujo que sí corre**

```text
cron-job.org
→ POST /api/cron/discover          (Bearer CRON_SECRET)
→ lib/pipeline/discovery.ts        (WordPress REST, sitemaps, HTML)
→ pipeline.source_documents        (único por source_key + external_id y por fingerprint)
→ POST /api/cron/classify          (reglas; OpenAI si hay API key)
→ pipeline_status classified | rejected
→ POST /api/cron/resolve           (similitud de título, pg_trgm)
→ pipeline.news_events + event_documents
→ POST /api/cron/editorial
→ OpenAI (prompt en lib/pipeline/editorial.ts)
→ cms.articles + cms.article_revisions
→ revalidatePath de portada, categoría, ficha y sitemap
→ el sitio lee status = 'published'
```

1. Entra un documento crudo de Noticias PV, El Universal, Récord o Tribuna (esta última pausada).
2. El único receptor automático es `POST /api/cron/discover`.
3. Guarda `source_key`, `external_id`, URL, fechas, `raw_title`, `raw_excerpt`, `raw_content`, `fingerprint`, `metadata`.
4. Tabla `pipeline.source_documents`. Cada corrida deja fila en `pipeline.ingestion_runs`.
5. Clasificación: `news` / `advertisement` / `irrelevant`. Publicidad e irrelevante pasan a `rejected`.
6. Resolución: evento nuevo, duplicado o complemento. Duplicado no se redacta (`editorial_status = skipped`).
7. La redacción exige `raw_content` de al menos 180 caracteres. La IA devuelve titular, bajada, cuerpo, categoría, SEO y texto de Facebook. `heroImageUrl` queda siempre `null`: el prompt prohíbe reutilizar fotos de terceros.
8. Categoría: la IA propone `ultimo-minuto` | `jalisco` | `nacional`. Si no es válida, Récord y El Universal caen en `nacional` y el resto en `jalisco`.
9. Autor: `getDefaultCmsAuthor()` (hoy Emilio Vargas, `cms.authors.is_default`). Si el evento ya tiene nota, se conserva su autor y su slug.
10. Slug: `slugifyTitle` + `uniqueSlug` en `lib/pipeline/editorial.ts`.
11. SEO: `seo_title` y `seo_description` del JSON de la IA. En la ficha, si faltan, se usan titular y resumen. JSON-LD `NewsArticle` en `app/noticias/[slug]/page.tsx`. Sitemap en `app/sitemap.ts`.
12. Estados de la nota: solo `published` y `unpublished`. `shouldAutoPublish` publica si hay titular, resumen y cuerpo, y el texto no parece un borrador vacío. El código no aplica el umbral de confiabilidad ≥ 60 que mencionan los docs.
13. Quien publica en automático es `persistEditorial` → `createCmsArticle` / `updateCmsArticle`. En el panel, `createArticleAction`, `updateArticleAction` y `changeArticleStatusAction`.
14. Reutilizable para Telegram: `createCmsArticle`, `uniqueSlug`, `draftEditorial` (con otro insumo), `revalidatePath`, el patrón de cola (`SKIP LOCKED`, reintento exponencial) y las tablas `reporters` / `reports` / `report_contributions` / `news_events`. No reutilizable tal cual: `storeDocuments` (el `source_key` no admite `telegram`) ni el cron editorial (solo reclama `source_documents` con texto largo de un medio).

La otra entrada es manual: un editor en `/admin` manda un formulario a las Server Actions. Ahí la imagen es una URL pegada, no un archivo.

## C. APIs existentes

No existen `POST /api/news`, `/api/media` ni `/api/telegram`. Solo estas cuatro, todas `runtime = 'nodejs'`, `maxDuration = 60`, sin cuerpo JSON.

| Ruta | Auth | Qué hace | Tablas | ¿Sirve para Telegram? |
| --- | --- | --- | --- | --- |
| `POST /api/cron/discover` | Bearer `CRON_SECRET`. 401 si falla. 400 fuente desconocida. 409 fuente pausada. 200 o 207 | Descarga medios. `?source=` y `?dryRun=1` | `ingestion_runs`, `source_documents` | No. Es de scrapers |
| `POST /api/cron/classify` | Igual. `?limit=` (default 12, tope 50) | Noticia / publicidad / irrelevante | `source_documents`, `openai_usage` | No sobre reportes |
| `POST /api/cron/resolve` | Igual. `?limit=` default 8 | Agrupa en `news_events` | `news_events`, `event_documents`, `source_documents` | El concepto de evento sí; la función no lee `reports` |
| `POST /api/cron/editorial` | Igual. 503 sin `OPENAI_API_KEY`. `?limit=` default 4 | Redacta y puede publicar | `source_documents`, `cms.articles`, `article_revisions`, `openai_usage` | El publicador sí; el reclamo de cola no |

Respuesta típica: `{ ok, executedAt, results, ... }` con 200 si todo salió bien y 207 si alguna pieza falló.

El panel no es una API HTTP. Son Server Actions en `app/admin/actions.ts`, protegidas por cookie de sesión (`requireAdmin`).

## D. Modelos de datos

### `pipeline.reporters`

El reportero de campo.

- `id` uuid
- `display_name` obligatorio
- `telegram_user_id` único y opcional
- `status`: `active` | `suspended`
- `created_at`

No está ligado a `cms.authors`. Nadie inserta filas todavía.

### `pipeline.reports`

El aporte original.

- `id` uuid
- `reporter_id` obligatorio → `pipeline.reporters`
- `channel`: `telegram` | `web` | `manual`
- `external_message_id` opcional
- `raw_text` obligatorio
- `occurred_at` opcional
- `received_at`
- `status`: `received` | `validated` | `rejected` | `merged`
- Único `(channel, external_message_id)`

En Postgres varios `NULL` en `external_message_id` no chocan, así que sin id el reintento no es idempotente.

### `pipeline.report_contributions`

Atribución y pago.

- `event_id` → `pipeline.news_events`
- `report_id` → `pipeline.reports`
- `reporter_id` → `pipeline.reporters`
- `kind`: `tip` | `lead` | `update` | `photo` | `video`
- `weight`, `payment_status` (`pending` | `approved` | `paid` | `void`), `amount_minor`
- Único `(event_id, report_id, kind)`

No guarda URL de archivo.

### `pipeline.news_events`

El hecho. `status`: `developing` | `closed`. `canonical_title`, `first_seen_at`, `last_seen_at`.

### `pipeline.event_documents`

Une un documento de medio con un evento (`origin` | `duplicate` | `update`). No une reportes.

### `pipeline.source_documents`

Insumo de medios.

- Estados de cola: `discovered` → `processing` → `classified` | `rejected` | `resolved` | `failed`
- `editorial_status`: `pending` | `processing` | `drafted` | `published` | `skipped` | `failed`
- `source_key` solo `noticias_pv`, `tribuna_bahia`, `el_universal`, `record`
- Único `(source_key, external_id)` y `fingerprint` único
- Campos de cola: `attempt_count`, `next_attempt_at`, `locked_at`, `locked_by`, `last_error`

### `pipeline.ingestion_runs` y `pipeline.openai_usage`

Bitácora de corridas y costo de IA. `purpose` solo admite `classify` | `editorial`.

### `cms.authors`

Firma pública.

- `slug` único, `name`, `role` (default `Reportero`), `bio`, `is_default`
- Semilla: Emilio Vargas
- No tiene `telegram_user_id`

### `cms.articles`

La noticia del sitio.

Obligatorios: `slug`, `category` (`ultimo-minuto` | `jalisco` | `nacional`), `title`, `summary`, `body_text`, `author_id`, `status` (`published` | `unpublished`).

Opcionales: `hero_image_url`, `image_alt`, `seo_title`, `seo_description`, `facebook_excerpt`, `source_name`, `source_url`, `event_id`, `source_document_id`, `published_at`.

Publicar exige `published_at`. Un evento solo puede tener una nota (`articles_event_unique`).

### `cms.article_revisions`

Auditoría: `created` | `updated` | `published` | `unpublished`, actor por defecto `Hola Vallarta`, snapshot JSON.

No hay tablas de etiquetas, usuarios con roles, multimedia, sesiones de Telegram ni logs de aplicación aparte de `last_error` en documentos y `error` en `ingestion_runs`.

La entidad para el reportero de Telegram ya existe: `pipeline.reporters.telegram_user_id`. La firma que ve el lector es otra tabla, `cms.authors`.

## E. Sistema de multimedia

No hay almacenamiento propio. No hay Supabase, S3, Cloudinary, Vercel Blob ni disco. `cms.articles.hero_image_url` es un `text` con una sola URL. El formulario del admin (`app/admin/components/article-form.tsx`) pide esa URL. La ficha hace `<img src={article.image}>`. No hay resize, compresión, thumbnails, límite de peso ni lista de formatos: el navegador carga lo que sea esa URL.

La redacción automática deja la imagen en `null` a propósito.

Una foto de Telegram, hoy, solo entra al sitio si alguien la convierte en una URL HTTPS pública y la escribe en `hero_image_url`. Varias fotos no tienen dónde vivir: el modelo es una imagen por nota. `report_contributions.kind = 'photo'` registra el aporte para pago, no el archivo.

## F. Sistema de publicación

Publicar es poner `cms.articles.status = 'published'` y `published_at`.

- Automático: `persistEditorial` en `lib/pipeline/editorial.ts`, llamado desde `POST /api/cron/editorial`.
- Manual: `setCmsArticleStatus` / `createCmsArticle` / `updateCmsArticle` desde `app/admin/actions.ts`.

Campos mínimos del formulario: titular, slug, resumen, cuerpo, categoría válida, autor. La IA además exige que el borrador no sea un stub (cuerpo ≥ 400 caracteres y sin frases de “sin información”).

Al publicar, el cron editorial llama `revalidatePath` de `/`, `/sitemap.xml`, `/noticias/{slug}` y `/{categoría}`. El sitemap se genera en cada request a `app/sitemap.ts` leyendo notas publicadas. No hay RSS, feed, indexación externa ni webhooks. Facebook/Zernio está previsto y no existe.

`changeArticleStatusAction` revalida portada y sitemap, y no revalida la ficha ni la categoría. El cron editorial sí lo hace. Conviene usar ese mismo conjunto de rutas cuando Telegram publique.

## G. Seguridad actual

- Crons: secreto compartido, comparación con `timingSafeEqual`. Sin secreto configurado, todo queda en 401.
- Panel: una sola cuenta por variables de entorno. Cookie `httpOnly`, `sameSite=strict`, `secure` en producción, firma HMAC. Contraseña con scrypt (`salt:hash`).
- No hay JWT, API keys por usuario, rate limit, CORS explícito ni validación de archivos.
- No hay Zod. Las actions validan a mano categoría, estado, slug y campos vacíos.
- Las rutas `/api/cron/*` aceptan POST de quien tenga el bearer. No hay allowlist de IP.
- Errores de cola se guardan en `last_error` (recortado a 2000 caracteres) con reintento `min(60, 2^intentos)` minutos y candado de 15 minutos. No hay logger.

Para el bot, el mismo patrón que el cron: secreto que solo conocen Telegram y la app. Al registrar el webhook, Telegram permite un `secret_token`. En cada POST manda `X-Telegram-Bot-Api-Secret-Token`. La ruta lo compara con `timingSafeEqual` contra `TELEGRAM_WEBHOOK_SECRET`. Un 401 corto si no coincide. El token del bot (`TELEGRAM_BOT_TOKEN`) no viaja en esa petición: sirve para llamar a la API de Telegram (descargar archivos, responder al chat).

Eso no basta por sí solo para fiarse del remitente humano. Después del secreto, el `from.id` tiene que existir en `pipeline.reporters` con `status = active`. Un usuario de Telegram desconocido se ignora.

## H. Arquitectura propuesta para Telegram

El webhook debe vivir en este Next.js. Un proceso Node aparte implicaría otro deploy, otro secreto y otra conexión a Neon, para hacer lo que una ruta `app/api/telegram/webhook/route.ts` ya puede hacer: autenticar, persistir y responder 200. El proyecto ya trabaja así: cron-job.org despierta funciones cortas; no hay worker residente. Long polling no encaja en Vercel.

La función del webhook tiene que ser corta. La redacción, la descarga pesada y la publicación siguen el patrón de cola que ya usan classify, resolve y editorial.

```text
Reportero en Telegram
→ Bot API (webhook HTTPS)
→ POST /api/telegram/webhook
→ secreto del header + reportero active
→ idempotencia por update_id y por (chat_id, message_id)
→ pipeline.reports (+ adjuntos)
→ cola (mismo estilo SKIP LOCKED)
→ cron de procesamiento
   → agrupar mensajes del mismo envío
   → news_events + report_contributions
   → redacción existente (OpenAI), adaptada al texto del reportero
   → cms.articles en unpublished
→ editor en /admin publica
→ el mismo sitio, sitemap y revalidación de siempre
```

grammY o Telegraf como proceso aparte solo valen si más adelante el diálogo se vuelve largo y con estado en memoria. Para webhook + Postgres, sobran.

### Webhook en Next.js o servicio aparte

| | Next.js (recomendado) | Servicio Node aparte |
| --- | --- | --- |
| Deploy | El mismo proyecto en Vercel | Segundo servicio, segundo secreto, otra conexión a Neon |
| Encaje | Igual que los crons: HTTP corto y cola en Postgres | Hace falta un proceso siempre encendido para polling |
| Webhook | Una ruta de App Router | También puede recibir el webhook, sin ganar nada en este repo |
| Límite | La función no puede redactar ni bajar fotos en el mismo request | Podría hacerlo en el mismo proceso, y duplicaría la cola que ya existe |

## I. Flujo del reportero

Telegram manda un mensaje por update. Texto y fotos suelen llegar separados. `pipeline.reports` es una fila por mensaje (`raw_text` obligatorio) y no agrupa un álbum.

Hace falta un envío abierto por reportero, con vida corta (por ejemplo 15 minutos):

1. Llega texto o foto. Si hay un envío `open` de ese `telegram_user_id`, se anexa. Si no, se abre uno.
2. Cada mensaje crea un `reports` con `external_message_id` = `{chat_id}:{message_id}` y `status = received`.
3. Un álbum de Telegram trae el mismo `media_group_id`: esas fotos son un solo bloque.
4. El reportero cierra con un comando (`/enviar`) o al vencer el plazo. Entonces el envío pasa a `ready` y entra a la cola.
5. `/cancelar` marca el envío `cancelled` sin crear nota.
6. Texto después de las fotos, o fotos después del texto, se appenden al mismo envío abierto.
7. Un envío sin texto queda `incomplete` y el bot pide el texto; no entra a redacción.
8. Reintento del webhook no crea otra fila: choca con la llave única.
9. La nota del CMS nace en `unpublished`. Publicar sigue siendo decisión del panel o, más adelante, de la misma regla de `shouldAutoPublish`.

Ese envío es una tabla nueva (`pipeline.report_submissions`). Meter el agrupado dentro de `news_events` mezclaría “el reportero aún está escribiendo” con “ya hay un hecho editorial”.

### Estados propuestos

El sistema actual ya cubre la nota publicada. No hace falta otro enum sobre `cms.articles`.

| Capa | Estados que ya existen | Qué agregar |
| --- | --- | --- |
| Reporte | `received`, `validated`, `rejected`, `merged` | Sirven para cada mensaje suelto |
| Envío (nuevo) | — | `open`, `incomplete`, `ready`, `processing`, `drafted`, `cancelled`, `failed` |
| Nota CMS | `unpublished`, `published` | Nada. Revisión = `unpublished`. Publicada = `published` |
| Editorial de medios | `pending` … `published` / `failed` | Se reutiliza el patrón de cola, no hace falta copiar esos estados al reporte |

`RECEIVED`, `PROCESSING`, `DRAFT`, `READY_FOR_REVIEW`, `APPROVED`, `PUBLISHED`, `REJECTED` y `FAILED` se reparten así: recepción y fallo viven en el envío; borrador y revisión son `cms.articles.unpublished`; publicado es `published`. `APPROVED` sobra mientras publicar y aprobar sean el mismo acto del editor.

## J. Identificación del reportero

```text
update.message.from.id
→ pipeline.reporters.telegram_user_id
→ pipeline.reports.reporter_id
→ pipeline.report_contributions
→ cms.articles.author_id   (solo si se decide la firma)
```

Alta manual: un editor crea el reportero (o se inserta la fila) con el `user_id` numérico de Telegram. `username` y nombre cambian; el id no. Conviene guardarlos como datos de apoyo, no como llave.

`cms.authors` no debe recibir el id de Telegram. Si la firma pública debe ser la persona, se agrega `pipeline.reporters.author_id → cms.authors.id`. Si la firma sigue siendo la de la casa (hoy Emilio Vargas), `author_id` de la nota se resuelve como ya lo hace `persistEditorial`, y el reportero solo queda en `report_contributions` para atribución y pago.

Un `status = suspended` corta el webhook aunque el secreto sea válido.

## K. Manejo de múltiples fotografías

Hoy no hay dónde guardarlas. Propuesta mínima:

1. El webhook responde 200 y deja `file_id` en una tabla `pipeline.report_assets` (`report_id`, `telegram_file_id`, `kind`, `sort_order`, `status`).
2. Un job descarga con `getFile` y `https://api.telegram.org/file/bot<token>/<path>`. Esos archivos caducan en Telegram; hay que copiarlos.
3. Se suben a un almacén nuevo (Vercel Blob o el object storage de Neon) y se guarda la URL pública.
4. La primera foto válida pasa a `cms.articles.hero_image_url` e `image_alt`. El resto queda en los assets, porque la ficha solo pinta una imagen.
5. Formatos de foto de Telegram: JPEG y a veces WebP. Tamaño máximo de la API de bots para descarga: 20 MB. Vídeo, audio y documentos quedan fuera hasta tener columna y UI; el `kind` de contributions ya prevé `video`.

Sin almacén, la integración de fotos no puede reutilizar el sitio actual.

## L. Idempotencia y errores

Lo que ya existe, y solo para medios:

- `unique (source_key, external_id)` y `fingerprint` único, con `ON CONFLICT`.
- Candado `FOR UPDATE SKIP LOCKED`, `attempt_count`, `next_attempt_at`.
- `unique (event_id)` en artículos.
- `openai_usage.purpose` no admite un valor nuevo sin migración.

Para Telegram hay que sumar:

| Fallo | Comportamiento |
| --- | --- |
| Telegram no puede entregar el webhook | Telegram reintenta. La ruta debe responder 200 en cuanto el mensaje quedó guardado. Un 5xx provoca otro intento |
| El mismo `update_id` llega dos veces | Tabla de updates vistos, o la unique de `(channel, external_message_id)`. Insert duplicado = 200 y no se procesa de nuevo |
| Se guardó el texto y falló la foto | El reporte queda `received`; el asset queda `failed` y el job de medios reintenta. La nota no se publica sin decidir qué hacer con la imagen |
| La foto se bajó y falló la BD | No se confirma el asset. El archivo en el blob puede quedar huérfano; el reintento vuelve a subir o reutiliza la URL si ya se guardó el `file_id` |
| Falla OpenAI | Igual que `failEditorial`: `pending` con backoff, o `failed` si el error es de contenido |
| Falla la publicación | La nota no cambia de estado. El cron editorial ya separa “redacté” de “publiqué” (`drafted` vs `published`) |
| Mensaje duplicado con otro id | No hay deduplicación de texto. El resolver de eventos podría usarse después, comparando títulos, no en el webhook |

`external_message_id` debe ser `{chat_id}:{message_id}`. El `message_id` solo es único dentro del chat. El `update_id` cubre el reintento del webhook; el par chat+mensaje cubre el contenido.

## M. Webhook

`POST /api/telegram/webhook`

- Auth: header `X-Telegram-Bot-Api-Secret-Token` contra `TELEGRAM_WEBHOOK_SECRET`, con `timingSafeEqual`. Sin secreto configurado, 401, igual que el cron.
- Cuerpo: update de la Bot API (`update_id`, `message` o `edited_message`, `from`, `chat`, `text`, `photo[]`, `media_group_id`, `caption`). Ignorar `channel_post`, callbacks y grupos si el reportero escribe al bot en privado.
- Validar que sea JSON, que exista `update_id`, y que `from.id` sea un reportero activo. No hace falta un schema enorme el primer día: texto, foto y caption.
- Idempotencia antes de cualquier efecto.
- Respuesta: 200 `{ ok: true }` si se aceptó o si era duplicado. 401 si el secreto falla. 200 también ante un usuario desconocido, para que Telegram no reintente indefinidamente; se registra y no se persiste como noticia.
- Log: fila de update (id, chat, resultado, error corto). Sin volcar el token ni el cuerpo completo en logs de Vercel si trae datos personales de más.

Quien llame la URL sin ese header no pasa. El secreto se entrega a Telegram solo en `setWebhook`, no en el cliente del reportero.

## N. IA

Ya hay OpenAI por HTTP en `lib/pipeline/openai.ts`.

- Clasificar: `OPENAI_CLASSIFY_MODEL` o `gpt-5.6-luna`, propósito `classify`.
- Redactar: `OPENAI_EDITORIAL_MODEL` o `gpt-5.6-luna`, timeout 25 s, propósito `editorial`.
- El prompt de redacción está en `SYSTEM_PROMPT` dentro de `lib/pipeline/editorial.ts`. Pide titular, bajada, cuerpo, categoría, SEO y Facebook, prohíbe inventar y fuerza `heroImageUrl: null`.
- El costo cae en `pipeline.openai_usage`. El check de `purpose` solo permite `classify` y `editorial`.

Para Telegram no hace falta otro proveedor. El punto de enganche es un reclamador hermano de `claimDocumentsForEditorial` que arme el JSON de entrada con el `raw_text` del envío (y captions) en lugar de `source_documents`. Se puede reutilizar `parseDraft`, `uniqueSlug`, `persistEditorial` y `shouldAutoPublish`. El filtro de “no menciones al medio de origen” no aplica igual a un texto propio; el de “no inventes” sí.

Umbral práctico: el cron editorial no reclama textos de menos de 180 caracteres. Un parte de reportero corto se quedaría fuera si se mete en esa cola sin cambiar el filtro.

La primera versión puede guardar el texto crudo y dejar la nota en `unpublished` para el editor, y enchufar la IA en una fase posterior. El prompt actual asume insumos de otros medios, no un parte de campo.

## O. Infraestructura

Vercel sirve HTTPS público en `https://hola-vallarta.vercel.app`. El webhook puede registrarse ahí. `holavallarta.mx` todavía no está conectado; cuando lo esté, hay que volver a llamar `setWebhook`.

Implicaciones concretas:

- La ruta es serverless. Hay que contestar en pocos segundos. Descargar fotos, llamar a OpenAI y publicar dentro del mismo request se sale de los 60 s que ya declaran los crons, y Telegram reintenta si tardas.
- El procesamiento va a otro `POST /api/cron/...` con el mismo `CRON_SECRET` y cron-job.org, como classify y editorial.
- No hay cola externa (Inngest, SQS, etc.). La cola actual es Postgres. Conviene seguir así.
- Imágenes: hace falta un bucket y variables nuevas. Vercel Blob encaja con el hosting; Neon Object Storage encaja con la base que ya usan. Cualquiera de los dos produce la URL que `hero_image_url` ya sabe mostrar.
- El token del bot y el secreto del webhook van en Vercel Production (y Preview solo si el webhook de pruebas apunta a otro bot).
- Local: Telegram no llama a `localhost`. Hace falta un túnel HTTPS o probar el handler con un update de ejemplo.

## P. Dependencias recomendadas

El código de OpenAI ya usa `fetch` y no mete SDKs. Lo coherente es hablar con la Bot API igual: `fetch` a `https://api.telegram.org/bot<token>/...` para `setWebhook`, `sendMessage` y `getFile`.

| Opción | En este repo |
| --- | --- |
| Bot API con `fetch` | Encaja con `openai.ts` y con una ruta que solo valida, guarda y responde |
| grammY | Útil si el diálogo crece (escenas, álbumes, comandos). El adaptador de webhook funciona en serverless. Es la alternativa si `fetch` se vuelve incómodo |
| Telegraf | Pensado para proceso largo y middleware. En Vercel obliga a cuidar el lifecycle |
| node-telegram-bot-api | Polling y tipos más viejos. No aporta nada aquí |

No instalar nada hasta la fase 1. Si en esa fase el webhook ya necesita comandos y álbumes, grammY es la segunda opción, no un servicio separado.

## Q. Variables de entorno nuevas

Ya existen las de base, CMS, cron, sitio y OpenAI. No hace falta duplicarlas.

Agregar, sin escribirlas todavía:

- `TELEGRAM_BOT_TOKEN` — llamadas salientes a Telegram.
- `TELEGRAM_WEBHOOK_SECRET` — el `secret_token` de `setWebhook`.
- `TELEGRAM_WEBHOOK_URL` — URL pública registrada (operación, no hace falta en runtime si el setWebhook es manual).
- Una de almacenamiento, según el servicio elegido: por ejemplo `BLOB_READ_WRITE_TOKEN`, o las claves del object storage de Neon.

Opcional más adelante: `TELEGRAM_ALLOWED_CHAT_IDS` solo como defensa extra; la fuente de verdad debe seguir siendo `pipeline.reporters`.

`openai_usage.purpose` habría que ampliar el check si se quiere un propósito `telegram` distinto de `editorial`.

## R. Archivos a crear o modificar

Esto es propuesta. No forma parte de este documento como cambio de código.

### CREATE

- `app/api/telegram/webhook/route.ts` — recibir el update, autenticar, persistir, responder.
- `lib/telegram/auth.ts` — comparar el secreto como `cron-auth.ts`.
- `lib/telegram/updates.ts` — leer el JSON de Telegram y sacar texto, fotos, `media_group_id`.
- `lib/telegram/client.ts` — `sendMessage`, `getFile`, descarga. `fetch`.
- `lib/pipeline/reports.ts` — insertar reportero/reporte/envío/asset con idempotencia.
- `app/api/cron/reports/route.ts` — reclamar envíos listos, crear evento, contribución y borrador CMS.
- `database/migrations/011_telegram_submissions.sql` — envíos, assets, `update_id` visto, y el vínculo opcional `reporters.author_id`.

### MODIFY

- `lib/pipeline/editorial.ts` — aceptar texto de reportero además de `source_documents`, o extraer la parte que ya sirve (`uniqueSlug`, `persistEditorial`).
- `lib/pipeline/openai.ts` — solo si el propósito de costo deja de caber en `editorial`.
- `lib/cms/repository.ts` — cuando exista galería o haya que guardar más de una URL. La creación de una nota con una sola `hero_image_url` ya sirve.
- `app/noticias/[slug]/page.tsx` — solo cuando haya más de una imagen que mostrar.
- `docs/architecture.md` y `docs/estado.md` — alinear autor, umbral de publicación y el flujo real del bot.
- `README.md` — variables nuevas, cuando existan.

### DO NOT TOUCH

- `lib/pipeline/discovery.ts`, `sources.ts` y `app/api/cron/discover` — son de medios externos.
- `cms/` (Strapi) — no es el sistema vivo.
- `app/admin/actions.ts` de login — la sesión del editor no autentica al bot.
- `lib/content.ts` — artículos de respaldo de desarrollo.

## S. Riesgos y decisiones pendientes

1. **Dos tuberías.** El código publica desde `source_documents`. El dominio del reportero está en tablas vacías. Unirlas en `news_events` + `cms.articles` evita un segundo publicador. Meter Telegram como `source_key` nuevo obliga a migrar un check, a inventar un `raw_content` de 180 caracteres y a pasar un parte de campo por un clasificador hecho para copiar de otros medios.
2. **No hay archivos.** Sin bucket, las fotos no llegan al sitio. Decidir Vercel Blob o Neon Object Storage antes de la fase de fotos.
3. **Una sola imagen en la nota.** Varias fotos se guardan; la portada usa la primera hasta que la ficha tenga galería.
4. **`raw_text` es obligatorio.** Una foto sin caption no cabe en `reports` hasta usar un texto vacío permitido o exigir el texto del envío antes de cerrar.
5. **Firma pública.** `pipeline.reporters` y `cms.authors` están separados. Hay que decidir si el lector ve al reportero o a Emilio Vargas / la marca. Los docs dicen “siempre Hola Vallarta”; el código firma como el autor default.
6. **Publicación automática.** `shouldAutoPublish` no mira el score de confiabilidad. Un parte de Telegram no debería usar esa regla el primer día: mejor `unpublished` y revisión en `/admin`.
7. **`changeArticleStatusAction` no revalida la ficha.** Al publicar a mano, la URL puede quedar vieja hasta otro refresh. El cron editorial sí revalida.
8. **Idempotencia incompleta en `reports`.** La unique actual no incluye el chat y no cubre `NULL`.
9. **Límites de Vercel.** IA y descarga de archivos dentro del webhook van a provocar reintentos de Telegram.
10. **Docs desfasados** en autor, tope diario de Récord (código y `estado.md` dicen 5; `cron-job.org.md` dice 15) y el umbral ≥ 60.

## T. Plan de implementación por fases

### Fase 1 — Telegram básico

Registrar el webhook contra `POST /api/telegram/webhook`, validar el secreto y responder 200.

Archivos: `app/api/telegram/webhook/route.ts`, `lib/telegram/auth.ts`. Variables en Vercel, sin lógica de noticias.

### Fase 2 — Recepción de texto

Resolver `from.id` en `pipeline.reporters` e insertar `pipeline.reports` (`channel = telegram`). Confirmar por `sendMessage`.

Archivos: `lib/telegram/client.ts`, `lib/telegram/updates.ts`, `lib/pipeline/reports.ts`.

### Fase 3 — Recepción de fotografías

Guardar `file_id` en `report_assets`. La descarga al bucket puede esperar a la fase 5.

### Fase 4 — Asociación texto + fotografías

Tabla `report_submissions`, ventana de tiempo, `media_group_id`, comandos de cierre y cancelación. Migración `011`.

### Fase 5 — Persistencia de drafts

Al cerrar el envío, crear `news_events`, `report_contributions` y un `cms.articles` en `unpublished` con el texto crudo, slug y autor default. Reutilizar `createCmsArticle` y `uniqueSlug`. La primera URL de imagen, cuando exista el bucket, va a `hero_image_url`.

### Fase 6 — Procesamiento

`POST /api/cron/reports` con `CRON_SECRET`, `SKIP LOCKED` y reintento, copiando el estilo de `claimDocumentsForEditorial`. El webhook solo encola.

### Fase 7 — IA

Reutilizar `draftEditorial` / `openaiJsonCompletion` con el texto del envío. Ampliar el check de `purpose` solo si hace falta. La nota sigue en `unpublished`.

### Fase 8 — Revisión

El editor usa el `/admin` actual. No hace falta otro panel. Completar revalidación de la ficha al publicar a mano.

### Fase 9 — Publicación

El mismo `setCmsArticleStatus` o `persistEditorial` con `published`, más `revalidatePath` de portada, categoría, ficha y sitemap. Sin RSS ni Zernio.

### Fase 10 — Seguridad, observabilidad e idempotencia

Unique de `{chat_id}:{message_id}`, registro de `update_id`, reporteros suspendidos, errores por asset, y no registrar el token. Rate limit solo si el volumen lo pide; el filtro de reportero activo cubre el abuso casual.

La fase 1 puede hacerse sin tocar el modelo de noticias. Las fotos no deben bloquear el texto: las fases 2 y 5 ya dejan un borrador revisable en el CMS que ya publica el sitio.
