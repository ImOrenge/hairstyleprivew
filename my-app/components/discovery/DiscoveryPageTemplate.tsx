import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LandingScene, SceneHeader } from "@/components/home/LandingScene";
import { createDiscoveryJsonLd, serializeDiscoveryJsonLd } from "@/lib/discovery/json-ld";
import type { DiscoveryPageDefinition, DiscoverySection } from "@/lib/discovery/types";
import { DiscoveryHero } from "./DiscoveryHero";
import { RelatedDiscoveryPages } from "./RelatedDiscoveryPages";
import { SampleComparison } from "./SampleComparison";
import { TrustSummary } from "./TrustSummary";
import styles from "./DiscoveryPage.module.css";

export function DiscoveryPageTemplate({ definition }: { definition: DiscoveryPageDefinition }) {
  const jsonLd = createDiscoveryJsonLd(definition);
  return (
    <article className={`f-landing ${styles.page}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeDiscoveryJsonLd(jsonLd) }} />
      <DiscoveryHero definition={definition} />
      <SampleComparison definition={definition} />
      {definition.sections.map((section, index) => renderSection(section, definition, index))}
      <section className={styles.finalCta} aria-labelledby="discovery-final-title">
        <p className={styles.eyebrow}>PRIVATE AI STYLE DIRECTION</p>
        <h2 id="discovery-final-title">이제 예시가 아니라, 내 기준으로 비교하세요</h2>
        <p>사진 확인부터 3전략·9개 후보, 비교와 Salon Brief까지 하나의 상담 흐름으로 이어집니다.</p>
        <Link className={styles.primaryCta} href={definition.message.finalCta.href}>
          {definition.message.finalCta.label}
          <ArrowRight aria-hidden="true" />
        </Link>
      </section>
    </article>
  );
}

function renderSection(section: DiscoverySection, definition: DiscoveryPageDefinition, index: number) {
  if (section.type === "workflow") {
    return (
      <LandingScene key={section.type} id="discovery-workflow" number="02" layout="editorial-split" motion="none">
        <SceneHeader eyebrow={section.eyebrow} title={section.title} description={section.description} />
        <div className={styles.workflowGrid}>
          {section.steps.map((step) => <article key={step.title}><h3>{step.title}</h3><p>{step.body}</p></article>)}
        </div>
      </LandingScene>
    );
  }
  if (section.type === "proof") {
    return (
      <LandingScene key={section.type} id="discovery-proof" number="03" layout="typographic-index" tone="quiet" motion="none">
        <SceneHeader eyebrow={section.eyebrow} title={section.title} description={section.description} />
        <dl className={styles.proofGrid}>
          {section.items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
        </dl>
      </LandingScene>
    );
  }
  if (section.type === "trust") {
    return (
      <LandingScene key={section.type} id="discovery-trust" number="04" layout="editorial-split" motion="none">
        <SceneHeader eyebrow={section.eyebrow} title={section.title} description={section.description} />
        <TrustSummary section={section} />
      </LandingScene>
    );
  }
  if (section.type === "related") {
    return (
      <LandingScene key={section.type} id="discovery-related" layout="editorial-split" tone="quiet" motion="none">
        <SceneHeader eyebrow="KEEP EXPLORING" title={section.title} />
        <RelatedDiscoveryPages definition={definition} />
      </LandingScene>
    );
  }
  if (section.type === "faq") {
    return (
      <LandingScene key={section.type} id="discovery-faq" number={String(index + 1).padStart(2, "0")} layout="typographic-index" motion="none">
        <SceneHeader eyebrow="FAQ" title={section.title} />
        <div className={styles.faqList}>
          {definition.faq.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}
        </div>
      </LandingScene>
    );
  }
  return null;
}
