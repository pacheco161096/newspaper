import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/cms/auth';
import { getCmsArticle, listCmsAuthors } from '@/lib/cms/repository';
import { changeArticleStatusAction, updateArticleAction } from '../../actions';
import { AdminShell } from '../../components/admin-shell';
import { ArticleForm } from '../../components/article-form';

export const dynamic = 'force-dynamic';

export default async function EditArticlePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin(); const { id } = await params; const article = await getCmsArticle(id); if (!article) notFound();
  const authors = await listCmsAuthors();
  const { saved } = await searchParams; const update = updateArticleAction.bind(null, id);
  const toggle = changeArticleStatusAction.bind(null, id, article.status === 'published' ? 'unpublished' : 'published');
  return <AdminShell><div className="admin-heading"><h1>Editar noticia</h1><Link className="admin-button secondary" href="/admin">Volver</Link><p>{article.status === 'published' ? 'Visible actualmente en el sitio.' : 'Esta noticia no es visible para el público.'}</p></div>
    {saved && <p className="admin-success">Cambios guardados correctamente.</p>}
    <ArticleForm article={article} authors={authors} action={update} />
    <form action={toggle} style={{ marginTop: 18 }}><button className={`admin-button ${article.status === 'published' ? 'danger' : ''}`}>{article.status === 'published' ? 'Despublicar noticia' : 'Publicar noticia'}</button></form>
  </AdminShell>;
}
