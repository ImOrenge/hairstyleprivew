import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getPublishedDiscoveryPages } from "@/lib/discovery/discovery-pages";
import styles from "@/components/discovery/DiscoveryPage.module.css";

export const metadata: Metadata = {
  title: { absolute: "AI 헤어스타일 가이드 | 얼굴형·남자·여자·앞머리·단발 | HairFit" },
  description: "AI 헤어스타일 시뮬레이션부터 얼굴형, 남자·여자 헤어, 앞머리, 단발과 미용실 상담 이미지까지 7개 비교 가이드를 확인하세요.",
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
            <p className={styles.heroSupport}>얼굴형, 남자·여자 헤어, 앞머리, 단발과 미용실 상담 이미지까지. 궁금한 기준부터 고르고 업로드 전에 실제 비교 방식을 확인하세요.</p>
          </div>
          <div className={styles.relatedLinks}>
            {pages.map((page) => (
              <Link key={page.id} href={page.seo.canonicalPath}>
                <span>{page.pageType.toUpperCase()} · {page.message.eyebrow}</span>
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
