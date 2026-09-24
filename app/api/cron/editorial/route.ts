import { revalidatePath } from 'next/cache';
import { draftEditorial, persistEditorial } from '../../../../lib/pipeline/editorial';
import { claimDocumentsForEditorial, failEditorial, finishEditorial, skipStalePipelineDocuments } from '../../../../lib/pipeline/repository';
import { isAuthorizedCron } from '../../../../lib/server/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ ok: false, error: 'OPENAI_API_KEY_MISSING' }, { status: 503 });
  }
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 4);
  const workerId = `editorial:${crypto.randomUUID()}`;
  const skippedStale = await skipStalePipelineDocuments();
  const claimed = await claimDocumentsForEditorial(workerId, limit);
  const drafted = await Promise.all(claimed.map(async (document) => {
    try {
      return { document, draft: await draftEditorial(document) };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      await failEditorial(document.id, message, !message.includes('JSON_INCOMPLETE') && !message.includes('INSUFFICIENT'));
      return { document, error: message };
    }
  }));
  const results = [];

  for (const item of drafted) {
    if (!('draft' in item) || !item.draft) {
      results.push({ id: item.document.id, eventId: item.document.eventId, error: 'error' in item ? item.error : 'UNKNOWN_ERROR' });
      continue;
    }
    const { document, draft } = item;
    try {
      const saved = await persistEditorial(document, draft);
      await finishEditorial(document.id, saved.articleId, { ...draft, heroImageUrl: null }, saved.published);
      if (saved.published) {
        revalidatePath('/');
        revalidatePath('/sitemap.xml');
        revalidatePath(`/noticias/${saved.slug}`);
        revalidatePath(`/${draft.category ?? 'jalisco'}`);
      }
      results.push({
        id: document.id, eventId: document.eventId, title: draft.title,
        articleId: saved.articleId, slug: saved.slug, published: saved.published, action: saved.action,
        needsReview: !saved.published, reliability: draft.scores?.reliability ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      await failEditorial(document.id, message, !message.includes('JSON_INCOMPLETE') && !message.includes('INSUFFICIENT'));
      results.push({ id: document.id, eventId: document.eventId, error: message });
    }
  }

  const ok = results.every((item) => !('error' in item));
  return Response.json({
    ok, executedAt: new Date().toISOString(), workerId, claimed: claimed.length, skippedStale,
    published: results.filter((item) => 'published' in item && item.published).length,
    review: results.filter((item) => 'needsReview' in item && item.needsReview).length,
    failed: results.filter((item) => 'error' in item).length,
    results,
  }, { status: ok ? 200 : 207 });
}
