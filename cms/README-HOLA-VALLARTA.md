# CMS de Hola Vallarta

Este Strapi administra el producto editorial publicado. No almacena los reportes de periodistas ni calcula pagos; esas responsabilidades pertenecen al esquema `pipeline` de PostgreSQL.

## Tipos de contenido

- **Noticia**: titular, resumen, cuerpo por bloques, evento externo, estado, imagen, categoría, autor, SEO, referencias internas y publicación de Facebook.
- **Categoría**: inicialmente Último minuto, Jalisco y Nacional.
- **Autor**: no es editable. Todas las noticias se firman y marcan como obra editorial de **Hola Vallarta**.

`draftAndPublish` está desactivado. Una noticia creada por el pipeline queda disponible inmediatamente. El acceso REST permanece cerrado por defecto y debe realizarse mediante tokens de API con el mínimo permiso necesario.

## Desarrollo local

Strapi usa SQLite en `.tmp/data.db`. El panel está en `http://localhost:1337/admin`.

## Producción

Configurar `DATABASE_CLIENT=postgres`, `DATABASE_URL`, `DATABASE_SCHEMA=strapi` y SSL cuando corresponda. Crear dos tokens separados:

1. Lectura para Next.js.
2. Escritura para el pipeline editorial.

Guardar el primero como `STRAPI_API_TOKEN` y el segundo como `STRAPI_WRITE_API_TOKEN` en el entorno de Next.js. Nunca deben exponerse con el prefijo `NEXT_PUBLIC_`.

Configurar un webhook de creación, actualización y eliminación hacia `POST https://holavallarta.mx/api/strapi/revalidate` con el encabezado `x-strapi-webhook-secret`.
