# Hola Vallarta — estado de construcción

Documento vivo: qué ya existe, cómo está armado y qué falta. Actualizado el 23 de septiembre de 2026.

La arquitectura de dominio está en [architecture.md](./architecture.md).

## Dónde se quedó el trabajo

Pipeline completo en producción: descubrir → clasificar → resolver → redactar y publicar. Autores, gasto OpenAI, fuente local Notiespacio y cola/importador en `/admin`.

Imágenes generadas: **pendientes** (no se copian fotos ajenas). Zernio, dominio, GA4 y Telegram: no bloquean el sitio.

---

## Cómo se está construyendo

### Producto

Medio local **Hola Vallarta**. Categorías públicas: último minuto, Jalisco y nacional. Firma pública: autor CMS (p. ej. reportero) + editora Hola Vallarta. Meta: ~20 notas diarias.

Cadena de procedencia (obligatoria):

```text
Reporter → Report → Contribution → NewsEvent → PublishedArticle
```

Pipeline:

```text
Cron → descubrir → guardar fuente → clasificar → resolver evento/duplicado
     → redactar (IA, solo hechos) → publicar en CMS/sitio → Facebook vía Zernio (después)
```

### Stack

| Pieza | Decisión |
| --- | --- |
| Sitio y CMS | Next.js 16 + React 19, App Router |
| Hosting | Vercel, proyecto `hola-vallarta` |
| URL actual | https://hola-vallarta.vercel.app |
| CMS | Nativo en `/admin` |
| Base | PostgreSQL (`pg`), esquemas `cms` y `pipeline` |
| Producción | Neon (pool para la app, directo para migraciones) |
| Colas / cron | cron-job.org → `POST /api/cron/*` |

### Sitio público

- Portada, categorías, ficha, autores.
- SEO: metadata, canonical, sitemap, robots, JSON-LD.
- Nunca se nombra el medio de origen en lo público.
- Sin imágenes por noticia (og genérico). Dominio `holavallarta.mx` aún no conectado.

### CMS

`/admin`: noticias, autores, **cola**, **importar hechos**, gasto OpenAI. Importador: pegar titular + hechos (no scrapea la URL).

### Ingestión

`POST /api/cron/discover` con `Authorization: Bearer <CRON_SECRET>`.

| Fuente | Adaptador | Estado | Notas |
| --- | --- | --- | --- |
| Noticias PV | WordPress REST | Activa | Local |
| Notiespacio PV | WordPress REST | Activa | Solo categorías de bahía; duplicados vs otras locales |
| El Universal | Sitemap Google News | Activa | Máx. 5 nuevas/día (las más nuevas); cuerpo a menudo vacío (sin hidratar) |
| Tribuna de la Bahía | `news-sitemap.xml` | Pausada | HTTP 403; no se evasará |
| Récord | sitemap + HTML público | Activa | Tope 5/día deporte, las más nuevas primero |

Duplicados: `(source_key, external_id)` + resolver por titular (más estricto entre fuentes locales). Duplicado no se redacta.

---

## Lista de lo que falta

### Hecho

- [x] Descubrir, clasificar, resolver, redactar.
- [x] Publicación automática si hay hechos suficientes (no stubs).
- [x] Autores CMS.
- [x] Gasto OpenAI en el tablero.
- [x] Fuente local Notiespacio PV.
- [x] Cola visible en `/admin/cola`.
- [x] Importador de hechos en `/admin/importar`.
- [x] Texto Facebook: resumen de la nota + CTA al primer comentario; el enlace va en ese comentario.
- [x] Zernio: `POST /api/cron/facebook` (texto en el post, URL en el primer comentario, solo si la nota pública responde).

### Pendiente (no ahora)

- [ ] Imágenes de referencia con IA.
- [ ] Cron `discover?source=notiespacio_pv` y `facebook` en cron-job.org.
- [ ] Poner `ZERNIO_API_KEY` (y si aplica `ZERNIO_FACEBOOK_ACCOUNT_ID`) en Vercel.
- [ ] Decidir Tribuna (sigue pausada).
- [ ] Conectar `holavallarta.mx`.
- [ ] Cambiar contraseña temporal del CMS.
- [ ] GA4 y Search Console.
- [ ] Telegram / reportes / pagos (segundo MVP).

## Decisiones ya cerradas

- No fotos de terceros ni quitar marcas de agua.
- No eludir 403/WAF de Tribuna.
- No mencionar medios de origen en lo publicado.
- No inventar ni alterar hechos; solo reescribir.
