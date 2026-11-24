import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { CATEGORY_PAGES } from '@/lib/seo/categories';
import { pastDailyDays } from '@/lib/seo/bank';

// Re-generated hourly so each finished Günün Quizi day shows up (PBI 29).
export const revalidate = 3600;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/gunun-quizi`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/nasil-oynanir`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/kategori`, changeFrequency: 'monthly', priority: 0.8 },
    ...CATEGORY_PAGES.map((c) => ({
      url: `${SITE_URL}/kategori/${c.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/gunun-quizi/arsiv`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    ...pastDailyDays().map((n) => ({
      url: `${SITE_URL}/gunun-quizi/${n}`,
      changeFrequency: 'never' as const,
      priority: 0.4,
    })),
  ];
}
