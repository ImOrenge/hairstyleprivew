import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getRelatedDiscoveryPages } from "@/lib/discovery/discovery-pages";
import type { DiscoveryPageDefinition } from "@/lib/discovery/types";
import styles from "./DiscoveryPage.module.css";

export function RelatedDiscoveryPages({ definition }: { definition: DiscoveryPageDefinition }) {
  const related = getRelatedDiscoveryPages(definition);
  return (
    <div className={styles.relatedLinks}>
      {related.map((page) => (
        <Link key={page.id} href={page.seo.canonicalPath}>
          <span>{page.message.eyebrow}</span>
          <strong>{page.message.h1}</strong>
          <ArrowRight aria-hidden="true" />
        </Link>
      ))}
      <Link href="/discover">
        <span>DISCOVERY HUB</span>
        <strong>HairFit 검색 가이드 전체 보기</strong>
        <ArrowRight aria-hidden="true" />
      </Link>
    </div>
  );
}
