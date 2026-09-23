import { articles as fallbackArticles, type Article, type CategorySlug } from './content';
import { getPublishedCmsArticleBySlug, listPublishedCmsArticles, listPublishedCmsArticlesByAuthorSlug } from './cms/repository';
import type { CmsArticle } from './cms/types';

function mapArticle(item: CmsArticle): Article {
  return {
    slug: item.slug,
    category: item.category,
    categoryLabel: item.category === 'jalisco' ? 'Jalisco' : item.category === 'nacional' ? 'Nacional' : 'Último minuto',
    title: item.title,
    summary: item.summary,
    publishedAt: item.publishedAt ?? item.createdAt,
    updatedAt: item.updatedAt,
    image: item.heroImageUrl,
    imageAlt: item.imageAlt,
    seoTitle: item.seoTitle,
    seoDescription: item.seoDescription,
    paragraphs: item.bodyText.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean),
    authorName: item.authorName, authorSlug: item.authorSlug, authorRole: item.authorRole,
  };
}

export async function getAllArticles(): Promise<Article[]> {
  if (!process.env.DATABASE_URL) return fallbackArticles;
  try {
    const articles = await listPublishedCmsArticles();
    if (articles.length || process.env.NODE_ENV !== 'development') return articles.map(mapArticle);
    return fallbackArticles;
  } catch {
    if (process.env.NODE_ENV === 'development') return fallbackArticles;
    throw new Error('CMS_DATABASE_UNAVAILABLE');
  }
}

export async function getArticlesByCategory(category: CategorySlug) {
  const all = await getAllArticles();
  return all.filter((article) => article.category === category);
}

export async function getArticlesByAuthorSlug(slug: string) {
  if (!process.env.DATABASE_URL) return fallbackArticles.filter((article) => article.authorSlug === slug);
  try {
    return (await listPublishedCmsArticlesByAuthorSlug(slug)).map(mapArticle);
  } catch {
    if (process.env.NODE_ENV === 'development') return fallbackArticles.filter((article) => article.authorSlug === slug);
    throw new Error('CMS_DATABASE_UNAVAILABLE');
  }
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  if (!process.env.DATABASE_URL) return fallbackArticles.find((article) => article.slug === slug) ?? null;
  try {
    const article = await getPublishedCmsArticleBySlug(slug);
    if (article) return mapArticle(article);
    if (process.env.NODE_ENV === 'development') return fallbackArticles.find((item) => item.slug === slug) ?? null;
  } catch {
    if (process.env.NODE_ENV === 'development') return fallbackArticles.find((item) => item.slug === slug) ?? null;
  }
  return null;
}
