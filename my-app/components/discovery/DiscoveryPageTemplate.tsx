import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LandingScene, SceneHeader } from "@/components/home/LandingScene";
import { createDiscoveryJsonLd, serializeDiscoveryJsonLd } from "@/lib/discovery/json-ld";
import type { DiscoveryPageDefinition, DiscoverySection } from "@/lib/discovery/types";
import { DiscoveryHero } from "./DiscoveryHero";
import { DiscoveryDecisionArtifact } from "./DiscoveryDecisionArtifact";
import { DiscoveryIntentExperience } from "./DiscoveryIntentExperience";
import { RelatedDiscoveryPages } from "./RelatedDiscoveryPages";
import { SampleComparison } from "./SampleComparison";
import { TrustSummary } from "./TrustSummary";
import styles from "./DiscoveryPage.module.css";

export function DiscoveryPageTemplate({ definition }: { definition: DiscoveryPageDefinition }) {
  const jsonLd = createDiscoveryJsonLd(definition);
  return (
    <article className={`f-landing ${styles.page}`} data-discovery-page={definition.id}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeDiscoveryJsonLd(jsonLd) }} />
      <DiscoveryHero definition={definition} />
      {discoveryLayouts[definition.id].map((slot, index) => renderSlot(slot, definition, index))}
      <section className={styles.finalCta} aria-labelledby="discovery-final-title">
        <p className={styles.eyebrow}>PRIVATE AI STYLE DIRECTION</p>
        <h2 id="discovery-final-title">{definition.message.finalTitle}</h2>
        <p>{definition.message.finalSupport}</p>
        <Link className={styles.primaryCta} href={definition.message.finalCta.href}>
          {definition.message.finalCta.label}
          <ArrowRight aria-hidden="true" />
        </Link>
      </section>
    </article>
  );
}

type DiscoverySlot = "sample" | "artifact" | "intent" | DiscoverySection["type"];

export const discoveryLayouts = {
  "D-AI-SIM": ["sample", "artifact", "intent", "workflow", "proof", "trust", "related", "faq"],
  "D-FACE": ["intent", "artifact", "sample", "workflow", "trust", "faq", "related"],
  "D-MEN": ["intent", "sample", "artifact", "workflow", "trust", "related", "faq"],
  "D-WOMEN": ["sample", "intent", "artifact", "workflow", "trust", "faq", "related"],
  "D-BANGS": ["intent", "artifact", "workflow", "sample", "trust", "faq", "related"],
  "D-BOB": ["artifact", "intent", "sample", "trust", "workflow", "faq", "related"],
  "D-SALON": ["intent", "artifact", "workflow", "sample", "proof", "trust", "faq", "related"],
} as const satisfies Record<DiscoveryPageDefinition["id"], readonly DiscoverySlot[]>;

function renderSlot(slot: DiscoverySlot, definition: DiscoveryPageDefinition, index: number) {
  if (slot === "sample") return <SampleComparison key={slot} definition={definition} />;
  if (slot === "artifact") return <DiscoveryDecisionArtifact key={slot} artifact={definition.artifact} />;
  if (slot === "intent") return <DiscoveryIntentExperience key={slot} definition={definition} />;
  const section = definition.sections.find((candidate) => candidate.type === slot);
  return section ? renderSection(section, definition, index) : null;
}

function renderSection(section: DiscoverySection, definition: DiscoveryPageDefinition, index: number) {
  if (section.type === "workflow") {
    return (
      <LandingScene key={section.type} id="discovery-workflow" number="03" layout="editorial-split" motion="none">
        <SceneHeader eyebrow={section.eyebrow} title={section.title} description={section.description} />
        <div className={styles.workflowGrid}>
          {section.steps.map((step) => <article key={step.title}><h3>{step.title}</h3><p>{step.body}</p></article>)}
        </div>
      </LandingScene>
    );
  }
  if (section.type === "proof") {
    return (
      <LandingScene key={section.type} id="discovery-proof" number="04" layout="typographic-index" tone="quiet" motion="none">
        <SceneHeader eyebrow={section.eyebrow} title={section.title} description={section.description} />
        <dl className={styles.proofGrid}>
          {section.items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
        </dl>
      </LandingScene>
    );
  }
  if (section.type === "trust") {
    return (
      <LandingScene key={section.type} id="discovery-trust" number="05" layout="editorial-split" motion="none">
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
