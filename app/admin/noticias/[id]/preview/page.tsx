/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/cms/auth';
import { getCmsArticle } from '@/lib/cms/repository';
import { SiteFooter, SiteHeader } from '@/app/components/site-chrome';

export const dynamic = 'force-dynamic';

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(); const { id } = await params; const article = await getCmsArticle(id); if (!article) notFound();
  return <><div className="preview-bar"><strong>Vista previa · {article.status === 'published' ? 'Publicada' : 'No publicada'}</strong><Link href={`/admin/noticias/${id}`}>Volver a editar</Link></div><SiteHeader /><main className="page-shell article-page"><article>
    <div className="story-meta"><span>{article.category}</span><time>{new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(new Date(article.publishedAt ?? article.createdAt))}</time></div>
    <h1>{article.title}</h1><p className="article-deck">{article.summary}</p><div className="byline"><strong>{article.authorName}</strong><span>{article.authorRole}</span></div>
    {article.heroImageUrl && <figure><img src={article.heroImageUrl} alt={article.imageAlt ?? article.title} /></figure>}
    <div className="article-body">{article.bodyText.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
  </article></main><SiteFooter /></>;
}
