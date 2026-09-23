import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { load } from 'cheerio';
import type { DiscoveredDocument, DiscoveryResult } from './types';
import type { RssSource, SourceDefinition, WordPressSource } from './sources';

const NATIONAL_RELEVANCE = [
  'president', 'gobierno', 'congreso', 'senado', 'diputad', 'elecci', 'reforma',
  'seguridad', 'detien', 'captur', 'arrest', 'narco', 'cártel', 'cartel', 'delincuen',
  'fiscalía', 'fiscalia', 'ejército', 'ejercito', 'guardia nacional', 'futbol', 'fútbol',
  'selección', 'seleccion', 'mundial', 'liga mx', 'olímpic', 'olimpic',
];

type WpPost = {
  id: number;
  date?: string;
  modified?: string;
  link: string;
  slug?: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  content?: { rendered?: string };
  categories?: number[];
};

type WpCategory = { id: number; slug: string };

type RawRssItem = {
  guid?: string | { '#text'?: string };
  link?: string;
  title?: string;
  description?: string;
  pubDate?: string;
  category?: string | string[];
  'content:encoded'?: string;
  'dc:creator'?: string;
  'media:content'?: { '@_url'?: string } | Array<{ '@_url'?: string }>;
};

type RawNewsSitemapItem = {
  loc?: string;
  lastmod?: string;
  'news:news'?: {
    'news:publication_date'?: string;
    'news:title'?: string;
    'news:keywords'?: string;
  };
};

const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

export function plainText(value = '') {
  return decodeEntities(value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

function canonicalUrl(value: string) {
  const url = new URL(value);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('utm_') || ['fbclid', 'gclid'].includes(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

function fingerprint(sourceKey: string, externalId: string, url: string) {
  return createHash('sha256').update(`${sourceKey}:${externalId}:${url}`).digest('hex');
}

function relevantNational(title: string, excerpt: string) {
  const haystack = `${title} ${excerpt}`.toLocaleLowerCase('es-MX');
  return NATIONAL_RELEVANCE.some((term) => haystack.includes(term));
}

function accept(source: SourceDefinition, title: string, excerpt: string) {
  return source.prefilter === 'all' || relevantNational(title, excerpt);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { 'User-Agent': 'HolaVallartaBot/1.0 (+https://holavallarta.mx)' }, signal: AbortSignal.timeout(15_000), cache: 'no-store' });
  if (!response.ok) throw new Error(`SOURCE_HTTP_${response.status}`);
  return response.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'User-Agent': 'HolaVallartaBot/1.0 (+https://holavallarta.mx)' }, signal: AbortSignal.timeout(15_000), cache: 'no-store' });
  if (!response.ok) throw new Error(`SOURCE_HTTP_${response.status}`);
  return response.text();
}

async function discoverWordPress(source: WordPressSource): Promise<DiscoveredDocument[]> {
  const url = new URL(source.endpoint);
  url.searchParams.set('per_page', '50');
  url.searchParams.set('orderby', 'date');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('_fields', 'id,date,modified,link,slug,title,excerpt,content,categories');
  if (source.allowedCategorySlugs?.length) {
    const categoryUrl = new URL(source.endpoint.replace(/\/posts\/?$/, '/categories'));
    categoryUrl.searchParams.set('per_page', '100');
    categoryUrl.searchParams.set('_fields', 'id,slug');
    const categories = await fetchJson<WpCategory[]>(categoryUrl.toString());
    const allowedIds = categories.filter((category) => source.allowedCategorySlugs?.includes(category.slug)).map((category) => category.id);
    if (!allowedIds.length) throw new Error('SOURCE_CATEGORIES_NOT_FOUND');
    url.searchParams.set('categories', allowedIds.join(','));
  }
  const posts = await fetchJson<WpPost[]>(url.toString());
  return posts.map((post) => {
    const sourceUrl = canonicalUrl(post.link);
    const externalId = String(post.id);
    return {
      sourceKey: source.key, externalId, sourceUrl,
      sourcePublishedAt: post.date ?? null, sourceModifiedAt: post.modified ?? null,
      rawTitle: plainText(post.title?.rendered), rawExcerpt: plainText(post.excerpt?.rendered),
      rawContent: plainText(post.content?.rendered), fingerprint: fingerprint(source.key, externalId, sourceUrl),
      metadata: { slug: post.slug ?? null, categoryIds: post.categories ?? [] },
    };
  });
}

function rssItems(parsed: unknown): RawRssItem[] {
  const document = parsed as { rss?: { channel?: { item?: RawRssItem | RawRssItem[] } } };
  const value = document.rss?.channel?.item;
  return value ? (Array.isArray(value) ? value : [value]) : [];
}

function guidValue(guid: RawRssItem['guid']) {
  return typeof guid === 'string' ? guid : guid?.['#text'];
}

function rssCategories(category: RawRssItem['category']) {
  return (Array.isArray(category) ? category : category ? [category] : []).map((value) => plainText(value));
}

function allowedRssItem(source: RssSource, item: RawRssItem) {
  if (!source.allowedCategories?.length) return true;
  const categories = rssCategories(item.category).map((value) => value.toLocaleLowerCase('es-MX'));
  return categories.some((category) => source.allowedCategories?.includes(category));
}

function rssImage(item: RawRssItem) {
  const media = Array.isArray(item['media:content']) ? item['media:content'][0] : item['media:content'];
  return media?.['@_url'] ?? null;
}

function cleanSyndicationText(value: string) {
  return value.replace(/\s+[^.]{0,220}\sapareció primero en\s+Tribuna de la Bahia\.?\s*$/i, '').trim();
}

async function discoverRss(source: RssSource): Promise<DiscoveredDocument[]> {
  const results = await Promise.all(source.feeds.map(async (feed) => {
    const xml = await fetchText(feed);
    return rssItems(parser.parse(xml)).filter((item) => allowedRssItem(source, item)).map((item) => {
      const sourceUrl = canonicalUrl(item.link ?? guidValue(item.guid) ?? feed);
      const externalId = guidValue(item.guid) ?? sourceUrl;
      const categories = rssCategories(item.category);
      return {
        sourceKey: source.key, externalId, sourceUrl,
        sourcePublishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : null,
        sourceModifiedAt: null, rawTitle: plainText(item.title),
        rawExcerpt: cleanSyndicationText(plainText(item.description)),
        rawContent: cleanSyndicationText(plainText(item['content:encoded'] ?? item.description)),
        fingerprint: fingerprint(source.key, externalId, sourceUrl),
        metadata: { feed, categories, sourceAuthor: plainText(item['dc:creator']), sourceImageUrl: rssImage(item) },
      } satisfies DiscoveredDocument;
    });
  }));
  return [...new Map(results.flat().map((item) => [item.fingerprint, item])).values()];
}

function newsSitemapItems(parsed: unknown): RawNewsSitemapItem[] {
  const document = parsed as { urlset?: { url?: RawNewsSitemapItem | RawNewsSitemapItem[] } };
  const value = document.urlset?.url;
  return value ? (Array.isArray(value) ? value : [value]) : [];
}

async function discoverNewsSitemap(source: RssSource): Promise<DiscoveredDocument[]> {
  const results = await Promise.all(source.feeds.map(async (feed) => {
    const xml = await fetchText(feed);
    return newsSitemapItems(parser.parse(xml)).flatMap((item) => {
      if (!item.loc) return [];
      const sourceUrl = canonicalUrl(item.loc);
      const news = item['news:news'];
      const keywords = plainText(news?.['news:keywords']);
      return [{
        sourceKey: source.key, externalId: sourceUrl, sourceUrl,
        sourcePublishedAt: news?.['news:publication_date'] ? new Date(news['news:publication_date']).toISOString() : item.lastmod ?? null,
        sourceModifiedAt: item.lastmod ?? null, rawTitle: plainText(news?.['news:title']), rawExcerpt: keywords, rawContent: '',
        fingerprint: fingerprint(source.key, sourceUrl, sourceUrl), metadata: { feed, keywords },
      } satisfies DiscoveredDocument];
    });
  }));
  const documents = [...new Map(results.flat().map((item) => [item.fingerprint, item])).values()]
    .slice(0, source.discoveryLimit ?? 100);
  if (!source.hydrateArticlePages) return documents;

  const hydrated: DiscoveredDocument[] = [];
  for (let index = 0; index < documents.length; index += 5) {
    const batch = documents.slice(index, index + 5);
    const results = await Promise.all(batch.map(async (document) => {
      try { return await hydrateArticlePage(source, document); }
      catch { return null; }
    }));
    hydrated.push(...results.filter((document): document is DiscoveredDocument => document !== null));
  }
  return hydrated;
}

type JsonLdNode = {
  '@type'?: string | string[];
  '@graph'?: JsonLdNode[];
  articleSection?: string | string[];
  description?: string;
  author?: { name?: string } | Array<{ name?: string }>;
};

function findArticleNode(value: unknown): JsonLdNode | null {
  if (!value || typeof value !== 'object') return null;
  const node = value as JsonLdNode;
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  if (types.some((type) => type === 'NewsArticle' || type === 'Article')) return node;
  for (const child of node['@graph'] ?? []) {
    const found = findArticleNode(child);
    if (found) return found;
  }
  return null;
}

function normalizedCategories(value: JsonLdNode['articleSection']) {
  return (Array.isArray(value) ? value : value ? [value] : []).map((category) => plainText(category));
}

function sourceAuthor(value: JsonLdNode['author']) {
  const author = Array.isArray(value) ? value[0] : value;
  return plainText(author?.name);
}

async function hydrateArticlePage(source: RssSource, document: DiscoveredDocument): Promise<DiscoveredDocument | null> {
  const html = await fetchText(document.sourceUrl);
  const $ = load(html);
  let articleNode: JsonLdNode | null = null;
  $('script[type="application/ld+json"]').each((_, element) => {
    if (articleNode) return;
    try { articleNode = findArticleNode(JSON.parse($(element).text())); } catch { /* Ignora JSON-LD inválido de terceros. */ }
  });
  const resolvedNode = articleNode as JsonLdNode | null;
  const categories = normalizedCategories(resolvedNode?.articleSection);
  const normalized = categories.map((category) => category.toLocaleLowerCase('es-MX'));
  if (source.allowedCategories?.length && !normalized.some((category) => source.allowedCategories?.includes(category))) return null;

  const body = $('.article-content[itemprop="articleBody"], .article-body, article .prose').first().clone();
  body.find('script, style, iframe, noscript, .sharedaddy, .jp-relatedposts, aside, nav, form').remove();
  const rawContent = cleanSyndicationText(plainText(body.html() ?? ''));
  const description = plainText($('meta[property="og:description"]').attr('content') ?? resolvedNode?.description ?? '');
  if (!rawContent) return null;
  return {
    ...document,
    rawExcerpt: description,
    rawContent,
    metadata: { ...document.metadata, categories, sourceAuthor: sourceAuthor(resolvedNode?.author) },
  };
}

export async function discoverSource(source: SourceDefinition): Promise<DiscoveryResult> {
  const found = source.adapter === 'wordpress'
    ? await discoverWordPress(source)
    : source.adapter === 'news-sitemap'
      ? await discoverNewsSitemap(source)
      : await discoverRss(source);
  const accepted = found.filter((item) => accept(source, item.rawTitle, item.rawExcerpt));
  return { sourceKey: source.key, fetched: found.length, accepted: accepted.length, rejectedByPrefilter: found.length - accepted.length, documents: accepted };
}
