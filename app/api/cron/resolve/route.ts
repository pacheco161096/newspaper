import { decideResolution } from '../../../../lib/pipeline/resolve';
import { applyResolution, claimDocumentsForResolution, failResolution, findOpenEventCandidates } from '../../../../lib/pipeline/repository';
import { isAuthorizedCron } from '../../../../lib/server/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 8);
  const workerId = `resolve:${crypto.randomUUID()}`;
  const claimed = await claimDocumentsForResolution(workerId, limit);
  const results = [];

  for (const document of claimed) {
    try {
      const candidates = await findOpenEventCandidates(document.rawTitle);
      const resolution = decideResolution(document, candidates);
      const applied = await applyResolution(document.id, document.rawTitle, resolution);
      results.push({
        id: document.id, source: document.sourceKey, title: document.rawTitle,
        ...resolution, eventId: applied.eventId, relation: applied.relation,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      await failResolution(document.id, message, true);
      results.push({ id: document.id, source: document.sourceKey, title: document.rawTitle, error: message });
    }
  }

  const ok = results.every((item) => !('error' in item));
  return Response.json({
    ok, executedAt: new Date().toISOString(), workerId, claimed: claimed.length,
    created: results.filter((item) => 'kind' in item && item.kind === 'new').length,
    duplicates: results.filter((item) => 'kind' in item && item.kind === 'duplicate').length,
    updates: results.filter((item) => 'kind' in item && item.kind === 'update').length,
    failed: results.filter((item) => 'error' in item).length,
    results,
  }, { status: ok ? 200 : 207 });
}
