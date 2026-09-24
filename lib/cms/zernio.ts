import { SITE_URL } from '../site';

const ZERNIO_API = 'https://zernio.com/api/v1';

export type ZernioPublishResult = {
  postId: string;
  platformPostUrl?: string;
};

function zernioKey() {
  const key = process.env.ZERNIO_API_KEY?.trim();
  if (!key) throw new Error('ZERNIO_API_KEY_MISSING');
  return key;
}

async function zernioJson<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const response = await fetch(`${ZERNIO_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${zernioKey()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response.json().catch(() => ({})) as T;
  return { status: response.status, body };
}

export async function resolveFacebookAccountId() {
  const configured = process.env.ZERNIO_FACEBOOK_ACCOUNT_ID?.trim();
  if (configured) return configured;
  const { status, body } = await zernioJson<{ accounts?: Array<{ _id: string; platform: string; isActive?: boolean }> }>('/accounts');
  if (status >= 400) throw new Error(`ZERNIO_ACCOUNTS_${status}`);
  const pages = (body.accounts ?? []).filter((account) => account.platform === 'facebook' && account.isActive !== false);
  if (pages.length === 1) return pages[0]._id;
  if (!pages.length) throw new Error('ZERNIO_FACEBOOK_ACCOUNT_MISSING');
  throw new Error('ZERNIO_FACEBOOK_ACCOUNT_AMBIGUOUS');
}

export async function waitForPublicArticle(slug: string) {
  const hosts = [...new Set([SITE_URL, 'https://hola-vallarta.vercel.app'])];
  for (const host of hosts) {
    const url = `${host}/noticias/${slug}`;
    try {
      const response = await fetch(url, { cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(10_000) });
      if (response.ok) return url;
    } catch {
      /* Prueba el siguiente host público. */
    }
  }
  throw new Error('PUBLIC_URL_NOT_LIVE');
}

export async function publishToFacebook(input: {
  articleId: string;
  message: string;
  firstComment: string;
}): Promise<ZernioPublishResult> {
  const accountId = await resolveFacebookAccountId();
  const { status, body } = await zernioJson<{
    post?: { _id?: string; platforms?: Array<{ platformPostUrl?: string; status?: string }> };
    existingPost?: { _id?: string };
    details?: { existingPostId?: string };
    error?: string;
  }>('/posts', {
    method: 'POST',
    headers: { 'x-request-id': `hola-vallarta-fb-${input.articleId}` },
    body: JSON.stringify({
      content: input.message,
      publishNow: true,
      timezone: 'America/Mexico_City',
      platforms: [{
        platform: 'facebook',
        accountId,
        platformSpecificData: { firstComment: input.firstComment },
      }],
    }),
  });
  if (status === 409 && body.details?.existingPostId) {
    return { postId: body.details.existingPostId };
  }
  const postId = body.post?._id ?? body.existingPost?._id;
  if ((status === 200 || status === 201 || status === 207) && postId) {
    return { postId, platformPostUrl: body.post?.platforms?.[0]?.platformPostUrl };
  }
  throw new Error(`ZERNIO_PUBLISH_${status}${body.error ? `:${body.error}` : ''}`);
}
