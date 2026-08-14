import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getPublishedDiscoveryPages } from "@/lib/discovery/discovery-pages";
import styles from "@/components/discovery/DiscoveryPage.module.css";

export const metadata: Metadata = {
  title: { absolute: "HairFit AI 헤어 가이드 | 9가지 후보 비교" },
  description: "HairFit의 AI 헤어스타일 시뮬레이션과 비교 기준을 사진 업로드 전에 확인하세요.",
  alternates: { canonical: "/discover" },
};

export default function DiscoveryHubPage() {
  const pages = getPublishedDiscoveryPages();
  return (
    <article className={`f-landing ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="discovery-hub-title">
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>HAIRFIT DISCOVERY</p>
            <h1 id="discovery-hub-title" className={styles.heroTitle}>검색에서 찾은 질문을, 상담 가능한 기준으로</h1>
            <p className={styles.heroSupport}>AI 헤어 후보가 어떻게 나뉘고 어떤 자료로 이어지는지 업로드 전에 확인하세요.</p>
          </div>
          <div className={styles.relatedLinks}>
            {pages.map((page) => (
              <Link key={page.id} href={page.seo.canonicalPath}>
                <span>{page.message.eyebrow}</span>
                <strong>{page.message.h1}</strong>
                <ArrowRight aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </article>
  );
}
