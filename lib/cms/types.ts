import type { CategorySlug } from '../content';

export type ArticleStatus = 'published' | 'unpublished';

export type CmsAuthor = {
  id: string;
  slug: string;
  name: string;
  role: string;
  bio?: string;
  isDefault: boolean;
};

export type CmsArticle = {
  id: string;
  slug: string;
  category: CategorySlug;
  title: string;
  summary: string;
  bodyText: string;
  heroImageUrl?: string;
  imageAlt?: string;
  seoTitle?: string;
  seoDescription?: string;
  facebookExcerpt?: string;
  sourceName?: string;
  sourceUrl?: string;
  authorId: string;
  authorSlug: string;
  authorName: string;
  authorRole: string;
  status: ArticleStatus;
  facebookStatus?: 'skipped' | 'pending' | 'sent' | 'failed';
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ArticleInput = Omit<CmsArticle, 'id' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'status' | 'authorSlug' | 'authorName' | 'authorRole' | 'authorId'> & {
  status: ArticleStatus;
  eventId?: string;
  sourceDocumentId?: string;
  authorId?: string;
};
