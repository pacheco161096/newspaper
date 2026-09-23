import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteFooter, SiteHeader } from '../../components/site-chrome';
import { getCmsAuthorBySlug } from '../../../lib/cms/repository';
import { getArticlesByAuthorSlug } from '../../../lib/content-provider';
import { SITE_URL } from '../../../lib/site';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const author = await getCmsAuthorBySlug(slug);
  if (!author) return {};
  return { title: `${author.name} | Hola Vallarta`, description: author.bio ?? `Notas de ${author.name} en Hola Vallarta.`, alternates: { canonical: `/autores/${author.slug}` } };
}

export default async function AuthorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const author = await getCmsAuthorBySlug(slug);
  if (!author) notFound();
  const articles = await getArticlesByAuthorSlug(slug);
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Person', name: author.name, jobTitle: author.role, url: `${SITE_URL}/autores/${author.slug}`, worksFor: { '@type': 'NewsMediaOrganization', name: 'Hola Vallarta' } };
  return <><SiteHeader /><main className="page-shell author-page">
    <span className="eyebrow">{author.role}</span><h1>{author.name}</h1>
    {author.bio && <p className="author-lead">{author.bio}</p>}
    <p>Reportero de Hola Vallarta. Las notas se publican bajo su firma y el medio es el editor.</p>
    {articles.length ? <ul className="author-stories">{articles.map((article) => <li key={article.slug}><Link href={`/noticias/${article.slug}`}>{article.title}</Link></li>)}</ul> : null}
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
  </main><SiteFooter /></>;
}
