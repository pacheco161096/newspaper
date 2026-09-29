import { revalidatePath } from 'next/cache';
import { claimReporterSubmissions, processReporterSubmission, releaseReporterSubmission, reporterErrorCode } from '../../../../lib/pipeline/report-processing';
import { isAuthorizedCron } from '../../../../lib/server/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 1);
  const workerId = `reports:${crypto.randomUUID()}`;
  const claimed = await claimReporterSubmissions(workerId, limit);
  const results = [];
  for (const submission of claimed) {
    try {
      const result = await processReporterSubmission(submission);
      if ('slug' in result && result.heroSet && result.published) {
        revalidatePath('/');
        revalidatePath('/sitemap.xml');
        revalidatePath(`/noticias/${result.slug}`);
        revalidatePath(`/${result.category}`);
      }
      results.push(result);
    } catch (error) {
      const code = reporterErrorCode(error);
      await releaseReporterSubmission(submission.id, code);
      results.push({ id: submission.id, error: code });
    }
  }
  const ok = results.every((item) => !('error' in item) && !('assetErrors' in item && item.assetErrors.length > 0));
  return Response.json({
    ok,
    executedAt: new Date().toISOString(),
    workerId,
    claimed: claimed.length,
    rewritten: results.filter((item) => 'rewritten' in item && item.rewritten).length,
    failed: results.filter((item) => 'error' in item).length,
    results,
  }, { status: ok ? 200 : 207 });
}
