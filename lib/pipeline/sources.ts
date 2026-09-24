import type { SourceKey } from './types';

export type WordPressSource = {
  key: SourceKey;
  label: string;
  adapter: 'wordpress';
  endpoint: string;
  dailyLimit: number | null;
  prefilter: 'all' | 'national-relevant';
  allowedCategorySlugs?: string[];
  enabled?: boolean;
  disabledReason?: string;
};

export type RssSource = {
  key: SourceKey;
  label: string;
  adapter: 'rss' | 'news-sitemap';
  feeds: string[];
  dailyLimit: number | null;
  prefilter: 'all' | 'national-relevant';
  allowedCategories?: string[];
  hydrateArticlePages?: boolean;
  discoveryLimit?: number;
  enabled?: boolean;
  disabledReason?: string;
};

export type SourceDefinition = WordPressSource | RssSource;

export const sources: Record<SourceKey, SourceDefinition> = {
  noticias_pv: {
    key: 'noticias_pv', label: 'Noticias PV', adapter: 'wordpress',
    endpoint: 'https://noticiaspv.com.mx/wp-json/wp/v2/posts', dailyLimit: null, prefilter: 'all',
  },
  tribuna_bahia: {
    key: 'tribuna_bahia', label: 'Tribuna de la Bahía', adapter: 'news-sitemap',
    feeds: ['https://tribunadelabahia.com.mx/news-sitemap.xml'], dailyLimit: null, prefilter: 'all',
    allowedCategories: ['puerto vallarta', 'bahía de banderas', 'bahia de banderas', 'seguridad', 'jalisco', 'nayarit', 'turismo'],
    hydrateArticlePages: true, discoveryLimit: 20,
    enabled: false, disabledReason: 'Tribuna responde HTTP 403 a solicitudes originadas desde Vercel.',
  },
  el_universal: {
    key: 'el_universal', label: 'El Universal', adapter: 'news-sitemap',
    feeds: [
      'https://www.eluniversal.com.mx/arc/outboundfeeds/news/?outputType=xml',
    ],
    dailyLimit: 5, prefilter: 'national-relevant', discoveryLimit: 40,
  },
  record: {
    key: 'record', label: 'Récord', adapter: 'news-sitemap',
    feeds: ['https://www.record.com.mx/sitemap-news-latest.xml'],
    dailyLimit: 5, prefilter: 'all', hydrateArticlePages: true, discoveryLimit: 8,
  },
  notiespacio_pv: {
    key: 'notiespacio_pv', label: 'Notiespacio PV', adapter: 'wordpress',
    endpoint: 'https://notiespaciopv.com/wp-json/wp/v2/posts', dailyLimit: null, prefilter: 'all',
    allowedCategorySlugs: ['puerto-vallarta', 'bahia-de-banderas', 'cabo-corrientes', 'nayarit', 'turismo'],
  },
};

export const LOCAL_SOURCE_KEYS = ['noticias_pv', 'notiespacio_pv', 'tribuna_bahia'] as const satisfies readonly SourceKey[];

export const LOCAL_SOURCE_PRIORITY_SQL = `case when source_key in ('noticias_pv', 'notiespacio_pv', 'tribuna_bahia') then 0 else 1 end`;
export const CURRENT_MEXICO_DAY_SQL = `(now() at time zone 'America/Mexico_City')::date`;
export const SOURCE_NEWS_DAY_SQL = `(coalesce(source_published_at, discovered_at) at time zone 'America/Mexico_City')::date`;
export const CURRENT_NEWS_SQL = `${SOURCE_NEWS_DAY_SQL} = ${CURRENT_MEXICO_DAY_SQL}`;
export const CRON_SOURCE_ORDER_SQL = `case when ${CURRENT_NEWS_SQL} then 0 else 1 end, coalesce(source_published_at, discovered_at) desc nulls last, ${LOCAL_SOURCE_PRIORITY_SQL}`;

export const LOCAL_ARTICLE_PRIORITY_SQL = `case when a.source_name in ('Noticias PV', 'Notiespacio PV', 'Tribuna de la Bahía') or a.category = 'jalisco' then 0 else 1 end`;
export const LOCAL_FACEBOOK_PRIORITY_SQL = `case when source_name in ('Noticias PV', 'Notiespacio PV', 'Tribuna de la Bahía') or category = 'jalisco' then 0 else 1 end`;
export const FACEBOOK_CURRENT_DAY_SQL = `(published_at at time zone 'America/Mexico_City')::date = ${CURRENT_MEXICO_DAY_SQL}`;
export const CRON_FACEBOOK_ORDER_SQL = `case when ${FACEBOOK_CURRENT_DAY_SQL} then 0 else 1 end, published_at desc nulls last, ${LOCAL_FACEBOOK_PRIORITY_SQL}`;

export function mexicoCityDay(value: Date | string | null | undefined) {
  if (!value) return '';
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(time)) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
}

export function isCurrentMexicoNewsDay(value: Date | string | null | undefined) {
  if (!value) return true;
  return mexicoCityDay(value) === mexicoCityDay(new Date());
}

export function isSourceKey(value: string): value is SourceKey { return value in sources; }
