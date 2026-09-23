export type SourceKey = 'noticias_pv' | 'tribuna_bahia' | 'el_universal' | 'record';

export type DiscoveredDocument = {
  sourceKey: SourceKey;
  externalId: string;
  sourceUrl: string;
  sourcePublishedAt: string | null;
  sourceModifiedAt: string | null;
  rawTitle: string;
  rawExcerpt: string;
  rawContent: string;
  fingerprint: string;
  metadata: Record<string, unknown>;
};

export type DiscoveryResult = {
  sourceKey: SourceKey;
  fetched: number;
  accepted: number;
  rejectedByPrefilter: number;
  documents: DiscoveredDocument[];
};
