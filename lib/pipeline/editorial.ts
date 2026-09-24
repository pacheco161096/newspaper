import { createCmsArticle, getCmsArticleByEventId, slugExists, updateCmsArticle, getDefaultCmsAuthor } from '../cms/repository';
import type { ArticleInput } from '../cms/types';
import type { CategorySlug } from '../content';
import { openaiJsonCompletion, pipelineModel } from './openai';
import type { EditorialDocument } from './repository';
import { listEventSourceDocuments } from './repository';
import { sources } from './sources';

const SYSTEM_PROMPT = `Eres la mesa de redacción de Hola Vallarta.

Tarea: REESCRIBIR los hechos del insumo como una nota propia. No eres reportero de campo: no investigas ni completas huecos.

Hechos (obligatorio):
- No inventes personas, cargos, cifras, lugares, fechas, causas, declaraciones ni desenlaces.
- No cambies ni redondees datos. Si el insumo dice “dos”, no pongas “varios”.
- Si un dato no está en el insumo, no lo escribas. En facts.missing lista lo que falta; en el cuerpo omítelo.
- Diferencia confirmado vs presunto. Denuncias y detenciones: lenguaje de presunción.
- No agregues contexto de tu conocimiento general (leyes, historial, clima, “qué sigue”) si no viene en el insumo.

Estilo:
- Titular y cuerpo originales: no copies frases, estructura ni el titular ajeno.
- Autor público: Hola Vallarta.
- Titular con tensión periodística real, nunca clickbait ni afirmación que el insumo no sostiene.
- 5 titulares candidatos; elige el más fiel a los hechos.
- Bajada 1-2 frases. Cuerpo: introducción, desarrollo, datos clave. Solo lo que esté en el insumo.
- NUNCA nombres medios de origen ni URLs. No sección Fuentes. No “según reportó”.
- facebookExcerpt: resumen de la nota (1-2 frases, solo hechos), sin URL y sin nombrar otros medios. No pongas el enlace; otro sistema lo pone en el primer comentario.
- heroImageUrl siempre null.
Responde SOLO el JSON del contrato editorial.`;

export type EditorialDraft = {
  publish?: boolean;
  needsReview?: boolean;
  category?: string;
  title?: string;
  summary?: string;
  bodyText?: string;
  seoTitle?: string;
  seoDescription?: string;
  facebookExcerpt?: string;
  sourceName?: string;
  sourceUrl?: string;
  scores?: { reliability?: number };
  quality?: Record<string, boolean>;
};

export function slugifyTitle(title: string) {
  const base = title.toLocaleLowerCase('es-MX').normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72);
  return base || 'noticia';
}

export async function uniqueSlug(title: string, exceptId?: string) {
  const base = slugifyTitle(title);
  if (!(await slugExists(base, exceptId))) return base;
  for (let index = 2; index < 50; index += 1) {
    const candidate = `${base}-${index}`;
    if (!(await slugExists(candidate, exceptId))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

const STUB_TITLE = /sin informaci[oó]n suficiente|no hay (?:datos|hechos|informaci[oó]n)|no contiene texto|faltan datos|material (?:disponible|proporcionado) no contiene/i;

export function hasEnoughSourceText(title: string, excerpt: string, content: string) {
  return content.trim().length >= 180 || excerpt.trim().length >= 220;
}

export function isStubDraft(draft: EditorialDraft) {
  const blob = `${draft.title ?? ''}\n${draft.summary ?? ''}\n${draft.bodyText ?? ''}`;
  if (STUB_TITLE.test(blob)) return true;
  if ((draft.bodyText ?? '').trim().length < 400) return true;
  return false;
}

export function shouldAutoPublish(draft: EditorialDraft) {
  if (isStubDraft(draft)) return false;
  return Boolean(draft.title?.trim() && draft.summary?.trim() && draft.bodyText?.trim());
}

export const FACEBOOK_COMMENT_CTA = 'Más información: continúa leyendo en el primer comentario.';

export function facebookPostText(excerpt: string | undefined, summary: string) {
  const raw = stripOutletMentions(excerpt || summary || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s*(más información|continua leyendo|continúa leyendo|lee la nota completa)[\s\S]*$/i, '')
    .trim();
  const lead = raw.replace(/[.!?]?$/, '.');
  const body = lead || 'Hay una nota nueva en Hola Vallarta.';
  return `${body}\n\n${FACEBOOK_COMMENT_CTA}`.slice(0, 2000);
}

export function facebookFirstComment(articleUrl: string) {
  return `Continúa leyendo la nota completa aquí:\n${articleUrl}`;
}

export function facebookInvite(excerpt: string | undefined, summary: string) {
  return facebookPostText(excerpt, summary);
}

const OUTLET_NAMES = [
  'Noticias PV', 'Noticiaspv', 'El Universal', 'Tribuna de la Bahía', 'Tribuna de la Bahia',
  'Notiespacio PV', 'NotiEspacio PV', 'Notiespacio', 'NotiEspacio',
];

export function stripOutletMentions(text: string) {
  let result = text.replace(/\n+fuentes\s*[:.]?[\s\S]*$/i, '').trim();
  result = result.replace(/https?:\/\/\S*(noticiaspv|eluniversal|record\.com\.mx|tribunadelabahia|notiespaciopv)\S*/gi, '');
  result = result.replace(/\b(?:de\s+acuerdo\s+con\s+el\s+medio|según\s+el\s+(?:medio|reporte\s+citado)|el\s+reporte\s+citado|información\s+publicada\s+por)\b[,:]?/gi, '');
  const names = [...OUTLET_NAMES, 'Récord', 'Record'];
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    result = result.replace(
      new RegExp(
        `(?:de\\s+acuerdo\\s+con(?:\\s+información(?:\\s+publicada)?\\s+por)?|según(?:\\s+lo)?(?:\\s+reportó|\\s+publicado\\s+por|\\s+informó)?|publicad[oa]\\s+por)\\s+${escaped}[,.]?`,
        'gi',
      ),
      '',
    );
    if (name !== 'Record' && name !== 'Récord') {
      result = result.replace(new RegExp(escaped, 'gi'), '');
    }
  }
  return result.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/[ ,;:]+\./g, '.').trim();
}

function scrubDraft(draft: EditorialDraft): EditorialDraft {
  return {
    ...draft,
    title: stripOutletMentions(draft.title ?? ''),
    summary: stripOutletMentions(draft.summary ?? ''),
    bodyText: stripOutletMentions(draft.bodyText ?? ''),
    seoTitle: draft.seoTitle ? stripOutletMentions(draft.seoTitle) : draft.seoTitle,
    seoDescription: draft.seoDescription ? stripOutletMentions(draft.seoDescription) : draft.seoDescription,
    facebookExcerpt: draft.facebookExcerpt ? stripOutletMentions(draft.facebookExcerpt) : draft.facebookExcerpt,
    sourceName: undefined,
    sourceUrl: undefined,
  };
}

function parseDraft(raw: string): EditorialDraft {
  const parsed = JSON.parse(raw) as EditorialDraft;
  if (!parsed.title || !parsed.summary || !parsed.bodyText) throw new Error('EDITORIAL_JSON_INCOMPLETE');
  const draft = scrubDraft(parsed);
  if (isStubDraft(draft)) throw new Error('EDITORIAL_INSUFFICIENT_FACTS');
  return draft;
}

export async function draftEditorial(document: EditorialDocument): Promise<EditorialDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY_MISSING');
  const related = await listEventSourceDocuments(document.eventId);
  if (!related.some((item) => hasEnoughSourceText(item.raw_title, item.raw_excerpt, item.raw_content))) {
    throw new Error('EDITORIAL_INSUFFICIENT_FACTS');
  }
  const raw = await openaiJsonCompletion({
    apiKey,
    model: pipelineModel(process.env.OPENAI_EDITORIAL_MODEL, 'gpt-5.6-luna'),
    timeoutMs: 25_000,
    temperature: 0.2,
    reasoningEffort: 'none',
    purpose: 'editorial',
    system: SYSTEM_PROMPT,
    user: JSON.stringify({
      instruction: 'Reescribe solo con hechos presentes en documents. Prohibido inventar o alterar. Si falta un dato, no lo suplas.',
      resolutionKind: document.resolutionKind,
      documents: related.map((item) => ({
        title: item.raw_title,
        excerpt: item.raw_excerpt,
        text: stripOutletMentions(item.raw_content.slice(0, 2800)),
      })),
      jsonContract: {
              publish: true, needsReview: false, category: 'jalisco', title: '',
              headlineCandidates: { informative: '', consequence: '', curiosity: '', tension: '', local: '', selected: 'local', selectionReason: '' },
              summary: '', bodyText: '', seoTitle: '', seoDescription: '', facebookExcerpt: '',
              sourceName: null, sourceUrl: null, heroImageUrl: null,
              facts: { what: '', who: [], where: '', when: '', confirmed: [], unconfirmed: [], missing: [], sensitive: [] },
              scores: { relevance: 70, localInterest: 70, novelty: 70, readerInterest: 70, reliability: 70, originality: 70 },
        quality: { headlineTrue: true, headlineNotMisleading: true, writtenFromScratch: true, noCopiedParagraphs: true, quotesAttributed: true, dataMatchesSources: true, factsVsClaims: true, noUnprovenAccusations: true, noUnnecessaryPersonalData: true, figuresChecked: true, placeIdentified: true, dateIdentified: true, sourceIndicated: true, imageRightsOk: true, addsValue: true, duplicateHandled: true },
      },
    }),
  });
  return parseDraft(raw);
}

export async function persistEditorial(document: EditorialDocument, draft: EditorialDraft) {
  const category: CategorySlug = draft.category === 'ultimo-minuto' || draft.category === 'nacional' || draft.category === 'jalisco'
    ? draft.category
    : document.sourceKey === 'record' || document.sourceKey === 'el_universal' ? 'nacional' : 'jalisco';
  const published = shouldAutoPublish(draft);
  const existing = await getCmsArticleByEventId(document.eventId);
  const slug = existing?.slug ?? await uniqueSlug(draft.title ?? 'noticia');
  const authorId = existing?.authorId ?? (await getDefaultCmsAuthor()).id;
  const title = stripOutletMentions(draft.title ?? '');
  const summary = stripOutletMentions(draft.summary ?? '');
  const facebookExcerpt = facebookInvite(draft.facebookExcerpt, summary);
  const input: ArticleInput = {
    slug, category,
    title,
    summary,
    bodyText: stripOutletMentions(draft.bodyText ?? ''),
    heroImageUrl: undefined, imageAlt: undefined,
    seoTitle: draft.seoTitle ? stripOutletMentions(draft.seoTitle) : draft.seoTitle,
    seoDescription: draft.seoDescription ? stripOutletMentions(draft.seoDescription) : draft.seoDescription,
    facebookExcerpt,
    sourceName: sources[document.sourceKey].label,
    sourceUrl: document.sourceUrl,
    authorId,
    status: published ? 'published' : 'unpublished',
    eventId: document.eventId, sourceDocumentId: document.id,
  };
  if (existing) {
    await updateCmsArticle(existing.id, { ...input, slug: existing.slug });
    return { articleId: existing.id, slug: existing.slug, published, action: 'updated' as const };
  }
  const articleId = await createCmsArticle(input);
  return { articleId, slug, published, action: 'created' as const };
}
