import { claimArticlesForFacebook, countFacebookSentToday, listFacebookQueue, markFacebookFailed, markFacebookRateLimited, markFacebookSent, skipStaleFacebookArticles } from '../../../../lib/cms/repository';
import { facebookFirstComment, facebookPostText } from '../../../../lib/pipeline/editorial';
import { publishToFacebook, waitForPublicArticle } from '../../../../lib/cms/zernio';
import { isAuthorizedCron } from '../../../../lib/server/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!process.env.ZERNIO_API_KEY) {
    return Response.json({ ok: false, error: 'ZERNIO_API_KEY_MISSING' }, { status: 503 });
  }
  const requestUrl = new URL(request.url);
  const dryRun = requestUrl.searchParams.get('dryRun') === '1';
  const skippedStale = dryRun ? 0 : await skipStaleFacebookArticles();
  const dailyLimit = Math.max(1, Number(process.env.FACEBOOK_DAILY_LIMIT ?? 80));
  const sentToday = await countFacebookSentToday();
  const remaining = Math.max(0, dailyLimit - sentToday);
  if (!remaining) {
    return Response.json({
      ok: true, executedAt: new Date().toISOString(), claimed: 0, sent: 0, failed: 0,
      skipped: 'daily_limit', sentToday, dailyLimit, results: [],
    });
  }
  const limit = Math.min(remaining, Number(requestUrl.searchParams.get('limit') ?? 4));
  const claimed = dryRun ? await listFacebookQueue(limit) : await claimArticlesForFacebook(limit);
  if (dryRun) {
    return Response.json({
      ok: true, dryRun: true, claimed: claimed.length,
      sample: claimed.slice(0, 3).map((article) => ({ slug: article.slug, title: article.title })),
    });
  }
  const results = [];
  for (const article of claimed) {
    try {
      const publicUrl = await waitForPublicArticle(article.slug);
      const message = facebookPostText(article.facebookExcerpt, article.summary);
      const published = await publishToFacebook({
        articleId: article.id,
        message,
        firstComment: facebookFirstComment(publicUrl),
      });
      await markFacebookSent(article.id, published.postId);
      results.push({ id: article.id, slug: article.slug, status: 'sent', zernioPostId: published.postId, url: publicUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      if (message.includes('429') || /daily post limit/i.test(message)) {
        await markFacebookRateLimited(article.id, message);
        results.push({ id: article.id, slug: article.slug, error: message, retry: true, delayed: 'next_day' });
        continue;
      }
      const retry = !message.includes('ZERNIO_FACEBOOK_ACCOUNT') && article.attempts < 6;
      await markFacebookFailed(article.id, message, retry);
      results.push({ id: article.id, slug: article.slug, error: message, retry });
    }
  }
  const ok = results.every((item) => !('error' in item));
  return Response.json({
    ok, executedAt: new Date().toISOString(), claimed: claimed.length,
    sent: results.filter((item) => 'status' in item && item.status === 'sent').length,
    failed: results.filter((item) => 'error' in item).length,
    skippedStale,
    results,
  }, { status: ok ? 200 : 207 });
}
