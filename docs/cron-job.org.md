# Crons para cron-job.org

Todos son **POST**. Cabecera igual en todos:

```text
Authorization: Bearer <CRON_SECRET>
```

Sin cuerpo. URL base: `https://hola-vallarta.vercel.app`

No uses GET. Timeout del job: 60 segundos o más (Vercel corta a 60 s).

La redacción requiere `OPENAI_API_KEY` en Vercel. Facebook requiere `ZERNIO_API_KEY` (y opcional `ZERNIO_FACEBOOK_ACCOUNT_ID` si hay más de una página).

## Jobs a crear (8)

Todos cada **30 minutos**.

| Nombre | URL | Horario | Qué hace |
| --- | --- | --- | --- |
| HV descubrir Noticias PV | `/api/cron/discover?source=noticias_pv` | :00 y :30 | Notas locales |
| HV descubrir Notiespacio PV | `/api/cron/discover?source=notiespacio_pv` | :00 y :30 | Locales (categorías de bahía) |
| HV descubrir El Universal | `/api/cron/discover?source=el_universal` | :00 y :30 | Nacional; máx. 5/día, las más nuevas |
| HV descubrir Récord | `/api/cron/discover?source=record` | :00 y :30 | Deporte; máx. 5/día, las más nuevas |
| HV clasificar cola | `/api/cron/classify` | cada **15 min** | Noticia / publicidad / irrelevante |
| HV resolver eventos | `/api/cron/resolve` | cada **15 min** | Nuevo, duplicado o complemento |
| HV redacción editorial | `/api/cron/editorial` | cada **15 min** | Redacta hasta 4 notas en paralelo |
| HV Facebook Zernio | `/api/cron/facebook` | cada **15 min** | Publica texto; enlace en el primer comentario |

URL completas:

```text
https://hola-vallarta.vercel.app/api/cron/discover?source=noticias_pv
https://hola-vallarta.vercel.app/api/cron/discover?source=notiespacio_pv
https://hola-vallarta.vercel.app/api/cron/discover?source=el_universal
https://hola-vallarta.vercel.app/api/cron/discover?source=record
https://hola-vallarta.vercel.app/api/cron/classify
https://hola-vallarta.vercel.app/api/cron/resolve
https://hola-vallarta.vercel.app/api/cron/editorial
https://hola-vallarta.vercel.app/api/cron/facebook
```

Zona horaria: `America/Mexico_City`.

Tribuna de la Bahía **no** se programa (403 desde Vercel).

## Prueba manual antes de dejarlos activos

Misma cabecera Bearer. `?dryRun=1` en discover y facebook no publica:

```text
POST .../api/cron/discover?source=record&dryRun=1
POST .../api/cron/facebook?dryRun=1
```

El clasificador no usa dryRun: procesa documentos `discovered` de verdad.

Facebook **solo** publica si `GET /noticias/{slug}` responde 200. El post es el resumen + “Más información: continúa leyendo en el primer comentario.” El enlace de la nota va **solo** en el primer comentario.

## Qué no va todavía

Telegram no usa cron.
