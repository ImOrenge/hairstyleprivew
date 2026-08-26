import type { MetadataRoute } from "next";
import { getSiteUrl } from "../lib/site-url";
import { getPublishedDiscoveryPages } from "../lib/discovery/discovery-pages";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const discoveryEntries: MetadataRoute.Sitemap = getPublishedDiscoveryPages().map((page) => ({
    url: `${siteUrl}${page.seo.canonicalPath}`,
    lastModified: new Date(page.updatedAt),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [
    {
      url: siteUrl,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/support`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/discover`,
      lastModified: new Date("2026-08-22"),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/partnerships`,
      lastModified: new Date("2026-08-26"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${siteUrl}/privacy-policy`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/terms-of-service`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    ...discoveryEntries,
  ];
}
