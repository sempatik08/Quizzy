import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * Index the content pages; keep crawlers out of live rooms (PBI 29). A room
 * URL is a private, short-lived game — indexed, it would be a dead link.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/lobby/', '/game/', '/join/'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
