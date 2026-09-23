/** Domain contracts kept independent from Telegram, Strapi and the scrapers. */
export type UUID = string;

export type Reporter = {
  id: UUID;
  displayName: string;
  status: 'active' | 'suspended';
  telegramUserId?: string;
  createdAt: string;
};

export type Report = {
  id: UUID;
  reporterId: UUID;
  channel: 'telegram' | 'web' | 'manual';
  externalMessageId?: string;
  rawText: string;
  occurredAt?: string;
  receivedAt: string;
  status: 'received' | 'validated' | 'rejected' | 'merged';
};

export type SourceDocument = {
  id: UUID;
  sourceKey: string;
  sourceUrl: string;
  sourcePublishedAt?: string;
  rawTitle: string;
  rawText: string;
  fingerprint: string;
  receivedAt: string;
};

export type NewsEvent = {
  id: UUID;
  status: 'developing' | 'closed';
  canonicalTitle: string;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type Contribution = {
  id: UUID;
  eventId: UUID;
  reportId: UUID;
  reporterId: UUID;
  kind: 'tip' | 'lead' | 'update' | 'photo' | 'video';
  weight: number;
  paymentStatus: 'pending' | 'approved' | 'paid' | 'void';
  amountMinor?: number;
};

export type PublishedArticle = {
  id: UUID;
  eventId: UUID;
  cmsArticleId: UUID;
  slug: string;
  publishedAt: string;
  updatedAt: string;
};
