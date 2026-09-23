import { classifyDocument, pipelineStatusFor } from '../../../../lib/pipeline/classify';
import { claimDocumentsForClassification, failClassification, finishClassification } from '../../../../lib/pipeline/repository';
import { isAuthorizedCron } from '../../../../lib/server/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const requestUrl = new URL(request.url);
  const dryRun = requestUrl.searchParams.get('dryRun') === '1';
  const limit = Number(requestUrl.searchParams.get('limit') ?? 12);
  const workerId = `classify:${crypto.randomUUID()}`;

  if (dryRun) {
    return Response.json({
      ok: true,
      dryRun: true,
      hint: 'El dryRun no clasifica documentos reales. Quita dryRun=1 para procesar la cola discovered.',
    });
  }

  const claimed = await claimDocumentsForClassification(workerId, limit);
  const results = await Promise.all(claimed.map(async (document) => {
    try {
      const classification = await classifyDocument(document);
      await finishClassification(document.id, classification);
      return {
        id: document.id, source: document.sourceKey, title: document.rawTitle,
        status: pipelineStatusFor(classification.label), ...classification,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      const retry = !message.includes('INVALID_JSON');
      await failClassification(document.id, message, retry);
      return { id: document.id, source: document.sourceKey, title: document.rawTitle, error: message, retry };
    }
  }));

  const ok = results.every((item) => !('error' in item));
  return Response.json({
    ok, executedAt: new Date().toISOString(), workerId, claimed: claimed.length,
    news: results.filter((item) => 'label' in item && item.label === 'news').length,
    rejected: results.filter((item) => 'label' in item && item.label !== 'news').length,
    failed: results.filter((item) => 'error' in item).length,
    results,
  }, { status: ok ? 200 : 207 });
}
