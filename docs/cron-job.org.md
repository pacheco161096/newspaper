# Crons para cron-job.org

Todos son **POST**. Cabecera igual en los seis:

```text
Authorization: Bearer <CRON_SECRET>
```

Sin cuerpo. URL base: `https://hola-vallarta.vercel.app`

No uses GET. Timeout del job: 60 segundos o más (Vercel corta a 60 s).

La redacción requiere `OPENAI_API_KEY` en Vercel. Sin esa variable el job editorial responde 503.

## Jobs a crear (6)

Todos cada **30 minutos**.

| Nombre | URL | Horario | Qué hace |
| --- | --- | --- | --- |
| HV descubrir Noticias PV | `/api/cron/discover?source=noticias_pv` | :00 y :30 | Notas locales |
| HV descubrir El Universal | `/api/cron/discover?source=el_universal` | :00 y :30 | Nacional; máx. 10/día |
| HV descubrir Récord | `/api/cron/discover?source=record` | :00 y :30 | Deporte; máx. 15/día |
| HV clasificar cola | `/api/cron/classify` | cada **15 min** | Noticia / publicidad / irrelevante |
| HV resolver eventos | `/api/cron/resolve` | cada **15 min** | Nuevo, duplicado o complemento |
| HV redacción editorial | `/api/cron/editorial` | cada **15 min** | Redacta hasta 4 notas en paralelo |

URL completas:

```text
https://hola-vallarta.vercel.app/api/cron/discover?source=noticias_pv
https://hola-vallarta.vercel.app/api/cron/discover?source=el_universal
https://hola-vallarta.vercel.app/api/cron/discover?source=record
https://hola-vallarta.vercel.app/api/cron/classify
https://hola-vallarta.vercel.app/api/cron/resolve
https://hola-vallarta.vercel.app/api/cron/editorial
```

Zona horaria: `America/Mexico_City`.

Tribuna de la Bahía **no** se programa (403 desde Vercel).

## Prueba manual antes de dejarlos activos

Misma cabecera Bearer. Añade `?dryRun=1` solo a discover:

```text
POST .../api/cron/discover?source=record&dryRun=1
```

El clasificador no usa dryRun: procesa documentos `discovered` de verdad.

## Qué no va todavía

No hay cron de Zernio todavía. Telegram no usa cron.
