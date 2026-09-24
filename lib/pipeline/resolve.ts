import type { QueuedSourceDocument } from './repository';
import type { SourceKey } from './types';
import { LOCAL_SOURCE_KEYS } from './sources';

export type ResolutionKind = 'new' | 'duplicate' | 'update';

export type EventCandidate = {
  eventId: string;
  canonicalTitle: string;
  originSourceKey: SourceKey | null;
  titleSimilarity: number;
};

export type ResolutionResult = {
  kind: ResolutionKind;
  eventId: string | null;
  score: number;
  reasons: string[];
  method: 'rules';
};

const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'y', 'o', 'en', 'con',
  'por', 'para', 'que', 'se', 'su', 'sus', 'es', 'son', 'fue', 'ser', 'como', 'mas', 'más', 'ya',
  'lo', 'le', 'les', 'the', 'a', 'ante', 'bajo', 'tras', 'sobre', 'entre',
]);

export function normalizeHeadline(value: string) {
  return value
    .toLocaleLowerCase('es-MX')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9ñ\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function headlineTokens(value: string) {
  return new Set(normalizeHeadline(value).split(' ').filter((token) => token.length > 2 && !STOPWORDS.has(token)));
}

export function jaccard(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / (left.size + right.size - overlap);
}

const LOCAL_SOURCE_SET = new Set<SourceKey>(LOCAL_SOURCE_KEYS);

function isLocalCover(left: SourceKey | null, right: SourceKey) {
  return Boolean(left && LOCAL_SOURCE_SET.has(left) && LOCAL_SOURCE_SET.has(right));
}

export function decideResolution(document: QueuedSourceDocument, candidates: EventCandidate[]): ResolutionResult {
  const incomingTokens = headlineTokens(document.rawTitle);
  const ranked = candidates.map((candidate) => {
    const tokenScore = jaccard(incomingTokens, headlineTokens(candidate.canonicalTitle));
    const score = Math.max(candidate.titleSimilarity, tokenScore);
    return { ...candidate, tokenScore, score };
  }).sort((left, right) => right.score - left.score);
  const best = ranked[0];

  if (!best || best.score < 0.38) {
    return {
      kind: 'new', eventId: null, score: best?.score ?? 0, method: 'rules',
      reasons: best
        ? [`Ningún evento abierto supera el umbral (mejor ${best.score.toFixed(2)} frente a “${best.canonicalTitle}”).`]
        : ['No hay eventos abiertos recientes para comparar.'],
    };
  }

  const sameSource = best.originSourceKey === document.sourceKey;
  const sameLocalStory = isLocalCover(best.originSourceKey, document.sourceKey);
  if (best.score >= 0.78 || (sameSource && best.score >= 0.55) || (sameLocalStory && best.score >= 0.62)) {
    return {
      kind: 'duplicate', eventId: best.eventId, score: best.score, method: 'rules',
      reasons: [`Muy similar a “${best.canonicalTitle}” (score ${best.score.toFixed(2)}); se trata como el mismo recuento del hecho.`],
    };
  }

  return {
    kind: 'update', eventId: best.eventId, score: best.score, method: 'rules',
    reasons: [`Complementa “${best.canonicalTitle}” (score ${best.score.toFixed(2)}); misma historia con información adicional o de otra fuente.`],
  };
}
