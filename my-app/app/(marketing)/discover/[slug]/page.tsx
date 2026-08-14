import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DiscoveryPageTemplate } from "@/components/discovery/DiscoveryPageTemplate";
import { getDiscoveryPageBySlug, getPublishedDiscoveryPages } from "@/lib/discovery/discovery-pages";
import { createDiscoveryMetadata } from "@/lib/discovery/metadata";

export const dynamicParams = false;

export function generateStaticParams() {
  return getPublishedDiscoveryPages().map(({ slug }) => ({ slug }));
}

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
