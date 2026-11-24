/**
 * The canonical origin. NEXT_PUBLIC_SITE_URL once the custom domain exists
 * (PBI 27); until then the Vercel deployment URL, then localhost.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
  ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
).replace(/\/+$/, '');
