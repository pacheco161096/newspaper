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
    dailyLimit: 10, prefilter: 'national-relevant', discoveryLimit: 100,
  },
  record: {
    key: 'record', label: 'Récord', adapter: 'news-sitemap',
    feeds: ['https://www.record.com.mx/sitemap-news-latest.xml'],
    dailyLimit: 15, prefilter: 'all', hydrateArticlePages: true, discoveryLimit: 18,
  },
};

export function isSourceKey(value: string): value is SourceKey { return value in sources; }
