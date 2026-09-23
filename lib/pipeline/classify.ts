import { openaiJsonCompletion, pipelineModel } from './openai';
import type { SourceKey } from './types';
import type { QueuedSourceDocument } from './repository';

export type ClassificationLabel = 'news' | 'advertisement' | 'irrelevant';

export type SuggestedCategory = 'ultimo-minuto' | 'jalisco' | 'nacional';

export type ClassificationResult = {
  label: ClassificationLabel;
  confidence: number;
  reasons: string[];
  suggestedCategory: SuggestedCategory;
  method: 'rules' | 'llm';
};

const AD_PATTERNS = [
  'contenido patrocinado', 'publirreportaje', 'publireportaje', 'branded content',
  'en colaboración con', 'en colaboracion con', 'presentado por', 'patrocinado por',
  'en alianza con', 'cortesía de', 'cortesia de', 'infomercial', 'anuncio pagado',
  'espacio publicitario', 'promoción comercial', 'promocion comercial',
];

const IRRELEVANT_PATTERNS = [
  'horóscopo', 'horoscopo', 'signos zodiacales', 'tu signo',
  'resultados de la lotería', 'resultados de la loteria', 'melate',
  'cómo ganar seguidores', 'como ganar seguidores',
];

function haystack(document: QueuedSourceDocument) {
  return `${document.rawTitle}\n${document.rawExcerpt}\n${document.rawContent}`.toLocaleLowerCase('es-MX');
}

function suggestedCategoryFor(sourceKey: SourceKey): SuggestedCategory {
  if (sourceKey === 'el_universal' || sourceKey === 'record') return 'nacional';
  return 'jalisco';
}

export function classifyWithRules(document: QueuedSourceDocument): ClassificationResult {
  const text = haystack(document);
  const suggestedCategory = suggestedCategoryFor(document.sourceKey);
  const adHit = AD_PATTERNS.find((pattern) => text.includes(pattern));
  if (adHit) {
    return { label: 'advertisement', confidence: 0.9, reasons: [`Coincide con pauta publicitaria: “${adHit}”.`], suggestedCategory, method: 'rules' };
  }
  const junkHit = IRRELEVANT_PATTERNS.find((pattern) => text.includes(pattern));
  if (junkHit) {
    return { label: 'irrelevant', confidence: 0.8, reasons: [`Contenido no noticioso: “${junkHit}”.`], suggestedCategory, method: 'rules' };
  }
  if (!document.rawTitle.trim() || (document.rawContent.trim().length < 180 && document.rawExcerpt.trim().length < 80)) {
    return { label: 'irrelevant', confidence: 0.7, reasons: ['Texto demasiado corto para tratarlo como noticia.'], suggestedCategory, method: 'rules' };
  }
  return {
    label: 'news',
    confidence: 0.75,
    reasons: ['No parece publicidad ni contenido irrelevante; se acepta como noticia para resolver eventos.'],
    suggestedCategory,
    method: 'rules',
  };
}

function parseLlmJson(raw: string): Partial<ClassificationResult> | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ClassificationResult>;
    if (parsed.label !== 'news' && parsed.label !== 'advertisement' && parsed.label !== 'irrelevant') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function classifyDocument(document: QueuedSourceDocument): Promise<ClassificationResult> {
  const fallback = classifyWithRules(document);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;

  const excerpt = `${document.rawExcerpt}\n${document.rawContent}`.replace(/\s+/g, ' ').trim().slice(0, 2500);
  let raw: string;
  try {
    raw = await openaiJsonCompletion({
      apiKey,
      model: pipelineModel(process.env.OPENAI_CLASSIFY_MODEL, 'gpt-5.6-luna'),
      timeoutMs: 8_000,
      temperature: 0,
      reasoningEffort: 'none',
      purpose: 'classify',
      system: 'Clasifica insumos periodísticos para Hola Vallarta. Responde solo JSON con keys label (news|advertisement|irrelevant), confidence (0-1), reasons (string[]), suggestedCategory (ultimo-minuto|jalisco|nacional). Publicidad, branded content y publirreportajes son advertisement. Horóscopos, sorteos y relleno sin hecho noticioso son irrelevant. No redactes la noticia.',
      user: JSON.stringify({
        source: document.sourceKey,
        title: document.rawTitle,
        url: document.sourceUrl,
        text: excerpt,
        ruleGuess: fallback,
      }),
    });
  } catch {
    return fallback;
  }
  const parsed = parseLlmJson(raw);
  if (!parsed?.label) return fallback;
  return {
    label: parsed.label,
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? fallback.confidence))),
    reasons: parsed.reasons?.length ? parsed.reasons.slice(0, 6) : fallback.reasons,
    suggestedCategory: parsed.suggestedCategory === 'ultimo-minuto' || parsed.suggestedCategory === 'jalisco' || parsed.suggestedCategory === 'nacional'
      ? parsed.suggestedCategory
      : fallback.suggestedCategory,
    method: 'llm',
  };
}

export function pipelineStatusFor(label: ClassificationLabel) {
  return label === 'news' ? 'classified' : 'rejected';
}
