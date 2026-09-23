import type { CmsArticle, CmsAuthor } from '@/lib/cms/types';

export function ArticleForm({
  article, authors, action,
}: {
  article?: CmsArticle;
  authors: CmsAuthor[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const defaultAuthor = authors.find((author) => author.isDefault)?.id ?? authors[0]?.id;
  return <form className="admin-form" action={action}>
    <section className="admin-form-card"><h2>Contenido editorial</h2><div className="admin-grid two">
      <div className="admin-field full"><label htmlFor="title">Titular *</label><input id="title" name="title" defaultValue={article?.title} required maxLength={180} /></div>
      <div className="admin-field"><label htmlFor="slug">Slug *</label><input id="slug" name="slug" defaultValue={article?.slug} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="titulo-de-la-noticia" /></div>
      <div className="admin-field"><label htmlFor="category">Categoría *</label><select id="category" name="category" defaultValue={article?.category ?? 'ultimo-minuto'}><option value="ultimo-minuto">Último minuto</option><option value="jalisco">Jalisco</option><option value="nacional">Nacional</option></select></div>
      <div className="admin-field"><label htmlFor="authorId">Autor *</label><select id="authorId" name="authorId" defaultValue={article?.authorId ?? defaultAuthor} required>{authors.map((author) => <option key={author.id} value={author.id}>{author.name}{author.isDefault ? ' (predeterminado)' : ''}</option>)}</select></div>
      <div className="admin-field full"><label htmlFor="summary">Resumen *</label><textarea id="summary" name="summary" defaultValue={article?.summary} required maxLength={320} /></div>
      <div className="admin-field full"><label htmlFor="bodyText">Cuerpo de la noticia *</label><textarea className="article-editor" id="bodyText" name="bodyText" defaultValue={article?.bodyText} required /><small>Separa cada párrafo con una línea vacía.</small></div>
    </div></section>
    <section className="admin-form-card"><h2>Imagen</h2><div className="admin-grid two">
      <div className="admin-field"><label htmlFor="heroImageUrl">URL de imagen</label><input id="heroImageUrl" name="heroImageUrl" type="url" defaultValue={article?.heroImageUrl} placeholder="https://…" /></div>
      <div className="admin-field"><label htmlFor="imageAlt">Descripción accesible</label><input id="imageAlt" name="imageAlt" defaultValue={article?.imageAlt} /></div>
    </div></section>
    <section className="admin-form-card"><h2>SEO y Facebook</h2><div className="admin-grid two">
      <div className="admin-field"><label htmlFor="seoTitle">Título SEO</label><input id="seoTitle" name="seoTitle" defaultValue={article?.seoTitle} maxLength={70} /><small>Si queda vacío se usa el titular.</small></div>
      <div className="admin-field"><label htmlFor="seoDescription">Descripción SEO</label><textarea id="seoDescription" name="seoDescription" defaultValue={article?.seoDescription} maxLength={170} /></div>
      <div className="admin-field full"><label htmlFor="facebookExcerpt">Texto para Facebook</label><textarea id="facebookExcerpt" name="facebookExcerpt" defaultValue={article?.facebookExcerpt} maxLength={500} /><small>Zernio usará este texto; el enlace se publicará después como primer comentario.</small></div>
    </div></section>
    <section className="admin-form-card"><h2>Trazabilidad de fuente</h2><div className="admin-grid two">
      <div className="admin-field"><label htmlFor="sourceName">Nombre de la fuente</label><input id="sourceName" name="sourceName" defaultValue={article?.sourceName} /></div>
      <div className="admin-field"><label htmlFor="sourceUrl">URL original</label><input id="sourceUrl" name="sourceUrl" type="url" defaultValue={article?.sourceUrl} /></div>
    </div></section>
    <div className="admin-actions"><label htmlFor="status">Al guardar:</label><select id="status" name="status" defaultValue={article?.status ?? 'published'}><option value="published">Publicar</option><option value="unpublished">No publicar</option></select><span className="spacer" />{article && <a className="admin-button secondary" href={`/admin/noticias/${article.id}/preview`} target="_blank">Vista previa</a>}<button className="admin-button" type="submit">Guardar noticia</button></div>
  </form>;
}
