import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DiscoveryPageTemplate } from "@/components/discovery/DiscoveryPageTemplate";
import { getDiscoveryPageBySlug } from "@/lib/discovery/discovery-pages";
import { createDiscoveryMetadata } from "@/lib/discovery/metadata";

// Cloudflare Workers does not ship Next's generated fallback cache alongside
// version-only uploads. Render the closed registry at request time so every
// published SEO document remains available without a fallback cache lookup.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const definition = getDiscoveryPageBySlug(slug);
  if (!definition || definition.status !== "published") return {};
  return createDiscoveryMetadata(definition);
}

export default async function DiscoveryDetailPage({ params }: Props) {
  const { slug } = await params;
  const definition = getDiscoveryPageBySlug(slug);
  if (!definition || definition.status !== "published") notFound();
  return <DiscoveryPageTemplate definition={definition} />;
}
