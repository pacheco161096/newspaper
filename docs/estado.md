# Hola Vallarta — estado de construcción

Documento vivo: qué ya existe, cómo está armado y qué falta. Actualizado el 23 de septiembre de 2026.

La arquitectura de dominio está en [architecture.md](./architecture.md).

## Dónde se quedó el trabajo

Los 4 crons de descubrimiento y clasificación ya están activos. Sigue agregar **HV resolver eventos** (`POST /api/cron/resolve`) a las :10 y :40.

El acuerdo explícito: **no implementar el prompt editorial** hasta revisarlo juntos.

---

## Cómo se está construyendo

### Producto

Medio local **Hola Vallarta**. Categorías públicas: último minuto, Jalisco y nacional. Autor publicado siempre **Hola Vallarta**. Primer hito: ~20 notas diarias; después simular 50 y 100 para costos.

Cadena de procedencia (obligatoria):

```text
Reporter → Report → Contribution → NewsEvent → PublishedArticle
```

Un reporte no se borra al publicar, actualizar o despublicar una noticia. `report_contributions` es el libro de atribución y pago.

Pipeline previsto:

```text
Cron → descubrir → guardar fuente → clasificar (noticia / publicidad / irrelevante)
     → resolver evento/duplicado → redactar (IA, prompt por aprobar)
     → publicar en CMS/sitio → Facebook vía Zernio (enlace en el primer comentario)
```

Hoy el flujo se detiene después de **guardar fuente**.

### Stack

| Pieza | Decisión |
| --- | --- |
| Sitio y CMS | Next.js 16 + React 19, App Router |
| Hosting | Vercel, proyecto `hola-vallarta` |
| URL actual | https://hola-vallarta.vercel.app |
| CMS | Nativo en `/admin` (no Strapi) |
| Base | PostgreSQL (`pg`), esquemas `cms` y `pipeline` |
| Producción | Neon vía Vercel Marketplace (pool para la app, conexión directa para migraciones) |
| Local | Docker PostgreSQL (`npm run db:up`) |
| Migraciones | `npm run db:migrate` / `db:migrate:production` |
| Colas / cron | HTTP `POST /api/cron/discover` + cron-job.org |
| Telegram | Segundo MVP; columnas reservadas, sin bot |

### Sitio público

- Portada, categorías y ficha de noticia (`/noticias/[slug]`).
- SEO: metadata, canonical según `NEXT_PUBLIC_SITE_URL`, sitemap, robots, JSON-LD `NewsArticle`.
- `/admin` y `/api` fuera de indexación.
- El dominio `holavallarta.mx` **no está conectado** todavía.

### CMS

Panel en `/admin`: login, crear, editar, previsualizar, publicar y despublicar. Campos editoriales, imagen, SEO, texto para Facebook y trazabilidad de fuente. Revisiones en `cms.article_revisions`. Publicar invalida portada, categorías, sitemap y la URL de la nota.

### Ingestión (lo último que sí se cerró)

`POST /api/cron/discover` con `Authorization: Bearer <CRON_SECRET>`.

- Sin `source`: fuentes habilitadas.
- `?source=noticias_pv` \| `tribuna_bahia` \| `el_universal` \| `record`.
- `?dryRun=1`: no escribe; muestra hasta tres ejemplos por fuente.

Cada corrida deja un `pipeline.ingestion_runs`. Los documentos van a `pipeline.source_documents` por `(source_key, external_id)` y `fingerprint`. La cuota de El Universal cuenta **solo documentos nuevos del día**.

| Fuente | Adaptador | Estado | Notas |
| --- | --- | --- | --- |
| Noticias PV | WordPress REST | Activa | Primera corrida: 50 documentos |
| El Universal | Sitemap Google News | Activa | Prefiltro temático; máximo 10 nuevas/día; primera corrida: 10 |
| Tribuna de la Bahía | `news-sitemap.xml` | Pausada | HTTP 403 desde Vercel; no se evasará el bloqueo |
| Récord | `sitemap-news-latest.xml` + HTML público | Activa; **tope 5/día** | Solo deporte. dryRun en Vercel sin 403 |

Cola (`004_processing_queue.sql`): estados `discovered` → `processing` → `classified` / `rejected` / `resolved` / `failed`. `POST /api/cron/classify` reclama lotes con `SKIP LOCKED`. Publicidad e irrelevante van a `rejected`; las noticias quedan en `classified` a la espera del event resolver.

Lista de jobs: [cron-job.org.md](./cron-job.org.md).

Regla de contenido: no reutilizar fotos de terceros; sí usar hechos/redacción ajena como insumo para **nota propia**. El Universal: política, deporte, seguridad/narco, temas de controversia; tope 10/día.

---

## Lista de lo que falta

Marca `[x]` = hecho en código o producción. `[ ]` = pendiente.

### Ahora (siguiente sprint)

- [x] Cerrar la evaluación de una fuente deportiva **pública**: Récord vía sitemap (no `/api`). Tope **5/día**. dryRun en producción OK.
- [ ] Decidir qué hacer con Tribuna: dejarla pausada, pedir whitelist, importar a mano en el CMS, o cubrir los mismos hechos desde fuentes oficiales. **No** proxies, User-Agent de navegador ni evasión del 403.
- [x] Cron de clasificación: `POST /api/cron/classify` (reglas; LLM si existe `OPENAI_API_KEY`).
- [x] Clasificador: noticia real / publicidad / irrelevante (JSON en `classification`).
- [x] Event resolver: evento nuevo, duplicado o complemento (`POST /api/cron/resolve`).
- [x] **Prompt editorial:** [editorial-prompt.md](./editorial-prompt.md) y `POST /api/cron/editorial`. Publica solo si pasa calidad; si no, queda en el CMS como no publicada. Requiere `OPENAI_API_KEY`.

### Publicación y redes

- [x] Redacción IA a partir del prompt aprobado (`/api/cron/editorial`).
- [x] Publicar o dejar en revisión en el CMS nativo (autor siempre Hola Vallarta).
- [ ] Texto corto para Facebook invitando a leer en el sitio.
- [ ] Zernio: publicar en Facebook **después** de comprobar que la URL pública responde; el enlace de la nota va en el **primer comentario**.
- [ ] Importador manual en el CMS (“pegar URL + hechos”) para fuentes bloqueadas.

### Infra y producto

- [ ] Conectar `holavallarta.mx` y `www` a Vercel; actualizar `NEXT_PUBLIC_SITE_URL`.
- [ ] Cambiar la contraseña temporal del CMS.
- [x] Crear en cron-job.org los 4 jobs de [cron-job.org.md](./cron-job.org.md) (pruebas de ejecución OK).
- [ ] GA4 y Search Console para anunciantes.
- [ ] Almacenamiento de imágenes propias o generadas (no fotos de terceros).
- [ ] Alertas de fallos de ingestión y registro de costos de IA.
- [ ] Simular 20, 50 y 100 notas/día.

### Segundo MVP (no bloquea el sitio)

- [ ] Bot de Telegram: cada mensaje → `Report` con llave `(channel, external_message_id)`.
- [ ] Validación, vínculo a evento y filas en `report_contributions`.
- [ ] Cálculo de pagos a reporteros.

---

## Decisiones ya cerradas

- No Strapi ni Supabase.
- CMS nativo + PostgreSQL (Neon en prod, Docker en local).
- Todo el cómputo periódico sale de cron-job.org hacia rutas de Next.
- Telegram después del pipeline editorial.
- Dominio definitivo más adelante.
- No eludir WAF/CAPTCHA/403 de Tribuna.
- Récord entra por sitemap y páginas públicas; no se usa su `/api` (robots.txt la prohíbe).

## Dónde está el código

| Área | Ruta |
| --- | --- |
| Sitio | `app/page.tsx`, `app/[category]`, `app/noticias/[slug]` |
| CMS | `app/admin`, `lib/cms` |
| Cron descubrimiento | `app/api/cron/discover/route.ts` |
| Fuentes | `lib/pipeline/sources.ts` |
| Cola / documentos | `lib/pipeline/repository.ts` |
| Contratos de dominio | `lib/domain.ts` |
| SQL | `database/migrations/` |
