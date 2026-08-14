import { getSiteUrl } from "../site-url.ts";
import type { DiscoveryPageDefinition } from "./types.ts";

export function createDiscoveryJsonLd(definition: DiscoveryPageDefinition) {
  const siteUrl = getSiteUrl();
  const url = `${siteUrl}${definition.seo.canonicalPath}`;

  return [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: definition.seo.title,
      description: definition.seo.description,
      url,
      inLanguage: definition.locale,
      dateModified: definition.updatedAt,
      isPartOf: {
        "@type": "WebSite",
        name: "HairFit",
        url: siteUrl,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: definition.faq.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    },
  ];
}

export function serializeDiscoveryJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
