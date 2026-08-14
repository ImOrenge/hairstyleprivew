import type { Metadata } from "next";
import { getSiteUrl } from "../site-url.ts";
import { getDiscoverySampleAsset, getDiscoverySampleManifest } from "./sample-manifests.ts";
import type { DiscoveryPageDefinition } from "./types.ts";

export function createDiscoveryMetadata(definition: DiscoveryPageDefinition): Metadata {
  const manifest = definition.sampleManifestId
    ? getDiscoverySampleManifest(definition.sampleManifestId)
    : undefined;
  const ogAsset = manifest ? getDiscoverySampleAsset(manifest, manifest.ogAssetId) : undefined;

  return {
    metadataBase: new URL(getSiteUrl()),
    title: { absolute: definition.seo.title },
    description: definition.seo.description,
    alternates: { canonical: definition.seo.canonicalPath },
    robots: {
      index: definition.status === "published" && definition.seo.index,
      follow: definition.status === "published" && definition.seo.index,
      googleBot: {
        index: definition.status === "published" && definition.seo.index,
        follow: definition.status === "published" && definition.seo.index,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      title: definition.seo.title,
      description: definition.seo.description,
      url: definition.seo.canonicalPath,
      siteName: "HairFit",
      locale: "ko_KR",
      type: "website",
      images: ogAsset
        ? [{ url: ogAsset.path, width: ogAsset.width, height: ogAsset.height, alt: ogAsset.alt }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: definition.seo.title,
      description: definition.seo.description,
      images: ogAsset ? [ogAsset.path] : undefined,
    },
  };
}
