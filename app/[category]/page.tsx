import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteFooter, SiteHeader } from '../components/site-chrome';
import { categoryNames, type CategorySlug } from '../../lib/content';
import { getArticlesByCategory } from '../../lib/content-provider';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  if (!(category in categoryNames)) return {};
  const name = categoryNames[category as CategorySlug];
  return { title: name, description: `Noticias de ${name} en Hola Vallarta.`, alternates: { canonical: `/${category}` } };
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  if (!(category in categoryNames)) notFound();
  const slug = category as CategorySlug;
  const items = await getArticlesByCategory(slug);
  return <><SiteHeader /><main className="page-shell listing-page">
    <header className="listing-title"><span className="eyebrow">Hola Vallarta</span><h1>{categoryNames[slug]}</h1><p>Las noticias más recientes, claras y en contexto.</p></header>
    <div className="article-list">{items.map((article, index) => <article className="article-row" key={article.slug}>
      <span className="story-index">0{index + 1}</span><div><div className="story-meta"><span>{article.categoryLabel}</span><time dateTime={article.publishedAt}>Hoy</time></div>
      <h2><a href={`/noticias/${article.slug}`}>{article.title}</a></h2><p>{article.summary}</p><a className="read-link" href={`/noticias/${article.slug}`}>Leer noticia <b>→</b></a></div>
    </article>)}</div>
  </main><SiteFooter /></>;
}
