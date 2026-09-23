import Link from 'next/link';
import { requireAdmin } from '@/lib/cms/auth';
import { createArticleAction } from '../../actions';
import { listCmsAuthors } from '@/lib/cms/repository';
import { AdminShell } from '../../components/admin-shell';
import { ArticleForm } from '../../components/article-form';

export const dynamic = 'force-dynamic';

export default async function NewArticlePage() {
  await requireAdmin();
  const authors = await listCmsAuthors();
  return <AdminShell><div className="admin-heading"><h1>Nueva noticia</h1><Link className="admin-button secondary" href="/admin">Volver</Link><p>Asigna el autor que firmará la nota.</p></div><ArticleForm authors={authors} action={createArticleAction} /></AdminShell>;
}
