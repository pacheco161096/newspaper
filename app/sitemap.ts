import type { MetadataRoute } from 'next';
import { getAllArticles } from '../lib/content-provider';
import { SITE_URL } from '../lib/site';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await getAllArticles();
  const base = SITE_URL;
  return [
    { url: base, changeFrequency: 'hourly', priority: 1 },
    { url: `${base}/autores/hola-vallarta`, changeFrequency: 'monthly', priority: .5 },
    ...['ultimo-minuto', 'jalisco', 'nacional'].map((category) => ({ url: `${base}/${category}`, changeFrequency: 'hourly' as const, priority: .8 })),
    ...articles.map((article) => ({ url: `${base}/noticias/${article.slug}`, lastModified: article.updatedAt ?? article.publishedAt, changeFrequency: 'daily' as const, priority: .7 })),
  ];
}
