# Hola Vallarta — arquitectura del MVP

Estado de avance, backlog y última sesión: [estado.md](./estado.md).

## MVP actual

- Sitio público mobile-first con portada, categorías y página de noticia.
- SEO técnico: metadata, canonical, sitemap, robots y `NewsArticle` JSON-LD.
- CMS editorial nativo dentro de Next.js, conectado a PostgreSQL.

## Límite de dominio obligatorio

Un **reporte** es una aportación original y conserva siempre su autor, texto, adjuntos y momento de recepción. Una **noticia** es el producto editorial publicado en el CMS. Varios reportes y documentos de fuentes pueden alimentar un mismo evento; un evento puede actualizar una noticia existente.

`Reporter → Report → Contribution → NewsEvent → PublishedArticle`

La tabla `report_contributions` es el libro de atribución y pago. Publicar, actualizar o despublicar una noticia no elimina ni modifica el aporte original.

## Segundo MVP: Telegram

El adaptador de Telegram deberá convertir cada mensaje en un `Report`, usando `(channel, external_message_id)` como llave idempotente. Después se validará y se vinculará al evento correspondiente. El token, secreto de webhook y `telegram_user_id` ya tienen lugar reservado; todavía no existe lógica del bot ni se requiere para ejecutar el sitio.

## Integraciones pendientes

PostgreSQL, CMS, descubrimiento, clasificación, resolución, redacción IA y publicación a Facebook (Zernio) ya están en código. Pendiente: credenciales Zernio en Vercel, dominio, imágenes propias y Telegram.

## Descubrimiento por cron-job.org

`POST /api/cron/discover` recibe `Authorization: Bearer <CRON_SECRET>`. Sin parámetro procesa las fuentes habilitadas; con `?source=noticias_pv`, `?source=tribuna_bahia`, `?source=el_universal`, `?source=record` o `?source=notiespacio_pv` ejecuta únicamente una.

`POST /api/cron/classify` toma documentos `discovered` (lotes de 8), los marca noticia, publicidad o irrelevante y no redacta.

`POST /api/cron/resolve` toma noticias `classified` y las agrupa en un `NewsEvent`: nuevo, duplicado o complemento.

`POST /api/cron/editorial` redacta un evento `resolved` (new/update), guarda en el CMS y publica solo si pasa calidad y confiabilidad ≥ 60. Requiere `OPENAI_API_KEY`. Duplicados no se redactan. Lista: [cron-job.org.md](./cron-job.org.md).

`?dryRun=1` permite comprobar el descubrimiento sin escribir en PostgreSQL. Conserva la autenticación y devuelve sólo tres ejemplos por fuente.

Cada ejecución crea un registro en `ingestion_runs`. Los documentos se guardan por huella única en `source_documents`; repetir el cron no duplica el contenido. Noticias PV y Notiespacio PV usan WordPress REST. Notiespacio se limita a categorías locales (Puerto Vallarta, Bahía de Banderas, Cabo Corrientes, Nayarit, turismo). El resolver agrupa el mismo hecho entre fuentes locales para no publicar duplicados. El Universal usa el sitemap de Google News, pasa por un prefiltro temático y se limita a diez documentos **nuevos** por día. Récord usa `sitemap-news-latest.xml`, hidrata el HTML público de cada nota (tope 15 nuevas/día, solo deporte) y no consulta `/api`. Tribuna está configurada con su `news-sitemap.xml` pero **pausada** (HTTP 403 desde Vercel).

La redacción usa el prompt de [editorial-prompt.md](./editorial-prompt.md). Duplicados no se redactan. Imágenes de IA quedan pendientes.

## CMS nativo

El panel vive en `/admin` dentro de Next.js. Permite crear, editar, previsualizar, publicar y despublicar noticias. Incluye campos editoriales, imagen, SEO, texto para Facebook y trazabilidad de la fuente. La firma pública es el autor CMS; la editora es **Hola Vallarta**. El medio de origen no se muestra en el sitio. Cada cambio importante guarda una revisión en `cms.article_revisions`. El CMS incluye cola del pipeline e importador de hechos.

La aplicación usa PostgreSQL directamente mediante `pg`, con los esquemas `cms` y `pipeline`. No existe dependencia de Strapi ni Supabase. En producción, Next.js se despliega en Vercel y PostgreSQL se conecta desde Vercel Marketplace. Docker se usa únicamente para el PostgreSQL local.

Las migraciones SQL se aplican con `npm run db:migrate`. El ejecutor registra nombre y checksum en `pipeline.schema_migrations`, usa una transacción por archivo y se detiene si una migración ya aplicada fue modificada.

Las Server Actions del panel invalidan portada, categorías, sitemap y la URL pública cuando se guarda o cambia el estado de una noticia.
