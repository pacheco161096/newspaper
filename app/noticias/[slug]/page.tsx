/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteFooter, SiteHeader } from '../../components/site-chrome';
import { getArticleBySlug } from '../../../lib/content-provider';
import { SITE_URL } from '../../../lib/site';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; const article = await getArticleBySlug(slug);
  if (!article) return {};
  const title = article.seoTitle ?? article.title; const description = article.seoDescription ?? article.summary;
  return { title, description, alternates: { canonical: `/noticias/${article.slug}` },
    openGraph: { type: 'article', title, description, publishedTime: article.publishedAt, modifiedTime: article.updatedAt, images: article.image ? [{ url: article.image, alt: article.imageAlt ?? article.title }] : [] },
    twitter: { card: article.image ? 'summary_large_image' : 'summary', title, description, images: article.image ? [article.image] : [] } };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const article = await getArticleBySlug(slug); if (!article) notFound();
  const jsonLd = { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: article.title, description: article.summary, datePublished: article.publishedAt, dateModified: article.updatedAt ?? article.publishedAt, author: { '@type': 'Person', name: article.authorName, url: `${SITE_URL}/autores/${article.authorSlug}` }, publisher: { '@type': 'Organization', name: 'Hola Vallarta', url: SITE_URL }, mainEntityOfPage: `${SITE_URL}/noticias/${article.slug}`, ...(article.image ? { image: [article.image] } : {}) };
  return <><SiteHeader /><main className="page-shell article-page"><article>
    <div className="story-meta"><span>{article.categoryLabel}</span><time dateTime={article.publishedAt}>{new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'America/Mexico_City' }).format(new Date(article.publishedAt))}</time></div>
    <h1>{article.title}</h1><p className="article-deck">{article.summary}</p>
    <div className="byline"><strong><Link href={`/autores/${article.authorSlug}`}>{article.authorName}</Link></strong><span>{article.authorRole}</span>{article.updatedAt && <span>Actualizada a las {new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' }).format(new Date(article.updatedAt))}</span>}</div>
    {article.image && <figure><img src={article.image} alt={article.imageAlt ?? article.title} /><figcaption>Imagen de la noticia.</figcaption></figure>}
    <div className="article-body">{article.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
  </article><aside className="article-aside"><span>ÚLTIMO MINUTO</span><p>Información en desarrollo. Esta nota puede actualizarse conforme se confirmen nuevos datos.</p></aside>
  <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
  </main><SiteFooter /></>;
}
