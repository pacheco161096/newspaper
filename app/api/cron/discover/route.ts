import { discoverSource, newestFirst } from '../../../../lib/pipeline/discovery';
import { countDocumentsToday, findExistingExternalIds, finishIngestionRun, startIngestionRun, storeDocuments } from '../../../../lib/pipeline/repository';
import { isSourceKey, sources } from '../../../../lib/pipeline/sources';
import { isAuthorizedCron } from '../../../../lib/server/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const requestUrl = new URL(request.url);
  const requestedSource = requestUrl.searchParams.get('source');
  const dryRun = requestUrl.searchParams.get('dryRun') === '1';
  let selected = Object.values(sources).filter((source) => source.enabled !== false);
  if (requestedSource) {
    if (!isSourceKey(requestedSource)) return Response.json({ ok: false, error: 'unknown_source' }, { status: 400 });
    if (sources[requestedSource].enabled === false) return Response.json({ ok: false, error: 'source_disabled', reason: sources[requestedSource].disabledReason }, { status: 409 });
    selected = [sources[requestedSource]];
  }
  const output = [];

  for (const source of selected) {
    let runId: string | null = null;
    try {
      if (dryRun) {
        const result = await discoverSource(source);
        const selectedDocuments = source.dailyLimit ? newestFirst(result.documents).slice(0, source.dailyLimit) : newestFirst(result.documents);
        output.push({ source: source.key, dryRun: true, fetched: result.fetched, eligible: result.accepted, accepted: selectedDocuments.length, rejectedByPrefilter: result.rejectedByPrefilter, sample: selectedDocuments.slice(0, 3).map(({ rawTitle, sourceUrl, sourcePublishedAt }) => ({ rawTitle, sourceUrl, sourcePublishedAt })) });
        continue;
      }
      runId = await startIngestionRun(source.key);
      const result = await discoverSource(source);
      const existingIds = await findExistingExternalIds(source.key, result.documents.map((document) => document.externalId));
      const existingDocuments = result.documents.filter((document) => existingIds.has(document.externalId));
      const newDocuments = newestFirst(result.documents.filter((document) => !existingIds.has(document.externalId)));
      const alreadyStoredToday = source.dailyLimit ? await countDocumentsToday(source.key) : 0;
      const remainingToday = source.dailyLimit ? Math.max(0, source.dailyLimit - alreadyStoredToday) : newDocuments.length;
      const acceptedNewDocuments = source.dailyLimit ? newDocuments.slice(0, remainingToday) : newDocuments;
      const selectedDocuments = [...existingDocuments, ...acceptedNewDocuments];
      const stored = await storeDocuments(selectedDocuments);
      await finishIngestionRun(runId, { status: 'completed', fetched: result.fetched, accepted: acceptedNewDocuments.length, stored: stored.stored });
      output.push({ source: source.key, fetched: result.fetched, eligible: result.accepted, new: newDocuments.length, accepted: acceptedNewDocuments.length, inserted: stored.inserted, updated: stored.updated, unchanged: selectedDocuments.length - stored.stored, rejectedByPrefilter: result.rejectedByPrefilter, remainingDailyCapacity: source.dailyLimit ? Math.max(0, remainingToday - acceptedNewDocuments.length) : null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      if (runId) await finishIngestionRun(runId, { status: 'failed', fetched: 0, accepted: 0, stored: 0, error: message }).catch(() => undefined);
      output.push({ source: source.key, error: message });
    }
  }

  const ok = output.every((item) => !('error' in item));
  return Response.json({ ok, executedAt: new Date().toISOString(), results: output }, { status: ok ? 200 : 207 });
}
