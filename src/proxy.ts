import { NextResponse, type NextRequest } from 'next/server';

/**
 * Old address → custom domain, permanently (PBI 27).
 *
 * Off until both are set:
 *   NEXT_PUBLIC_SITE_URL  the new canonical origin, e.g. https://quizzy.com.tr
 *   LEGACY_HOSTS          comma-separated hosts to move away from,
 *                         e.g. quizzy-two-jade.vercel.app
 *
 * Only the listed hosts redirect. Preview deployments (other *.vercel.app
 * hosts) keep working, and the custom domain itself is never in the list, so
 * there is no redirect loop. Path and query string are kept, so old invite
 * links (/join/ABC123) and UTM-tagged posts still land where they should.
 *
 * Vercel's domain settings can do the same; this exists so the move is one
 * env change and is reviewable in code.
 */
const LEGACY_HOSTS = new Set(
  (process.env.LEGACY_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);
const TARGET = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? '';

export function proxy(request: NextRequest) {
  if (!TARGET || LEGACY_HOSTS.size === 0) return NextResponse.next();
  const host = (request.headers.get('host') ?? '').toLowerCase();
  if (!LEGACY_HOSTS.has(host)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  return NextResponse.redirect(`${TARGET}${pathname}${search}`, 301);
}

export const config = {
  // Static assets do not need to move; everything a person or crawler opens does.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/).*)'],
};
