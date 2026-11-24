import { ADSENSE_CLIENT, isValidClientId } from '@/lib/ads';

export const dynamic = 'force-static';

/**
 * /ads.txt, generated from NEXT_PUBLIC_ADSENSE_CLIENT so the publisher id lives
 * in one place (PBI 32). Google flags a site without it and buyers may skip it.
 * 404 when ads are not configured.
 */
export function GET() {
  if (!isValidClientId(ADSENSE_CLIENT)) {
    return new Response('Not found', { status: 404 });
  }
  const pub = ADSENSE_CLIENT.replace(/^ca-/, '');
  return new Response(`google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
