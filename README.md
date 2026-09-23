# Hola Vallarta

Portal de noticias mobile-first con Next.js 16, React 19, PostgreSQL y CMS editorial integrado.

## Desarrollo local

```bash
npm install
npm run db:up
npm run db:migrate
npm run dev
```

- Sitio: `http://localhost:3000`
- CMS: `http://localhost:3000/admin`
- Usuario local: `admin@holavallarta.mx`
- Contraseña local: `hola-vallarta-local`

Las credenciales anteriores sólo funcionan en desarrollo. PostgreSQL se ejecuta en Docker; Next.js se ejecuta directamente para conservar recarga rápida.

## CMS

El panel permite:

- crear y editar noticias;
- publicar y despublicar;
- previsualizar contenido no publicado;
- editar titular, resumen, cuerpo, categoría e imagen;
- controlar título y descripción SEO;
- preparar el texto que Zernio enviará a Facebook;
- conservar la fuente original para trazabilidad;
- registrar revisiones editoriales en PostgreSQL.

El autor público siempre es **Hola Vallarta**. Los documentos fuente, reportes, eventos y noticias permanecen como entidades separadas.

## Configuración de Vercel

Crear PostgreSQL desde Vercel Marketplace y configurar estas variables en Production y Preview:

```text
DATABASE_URL
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
CMS_ADMIN_EMAIL
CMS_ADMIN_PASSWORD_HASH
CMS_SESSION_SECRET
CRON_SECRET
NEXT_PUBLIC_SITE_URL=https://holavallarta.mx
```

Generar el hash de contraseña con:

```bash
npm run cms:hash-password -- "una contraseña segura de al menos 12 caracteres"
```

`CMS_SESSION_SECRET` debe ser una cadena aleatoria larga. Antes del primer despliegue se ejecuta `npm run db:migrate` apuntando a la base de producción.

Vercel despliega la aplicación Next.js. Docker no se usa en producción; `docker-compose.yml` existe únicamente para PostgreSQL local.
