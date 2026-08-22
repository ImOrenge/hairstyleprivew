import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { getDiscoverySampleAsset, getDiscoverySampleManifest } from "@/lib/discovery/sample-manifests";
import type { DiscoveryPageDefinition } from "@/lib/discovery/types";
import styles from "./DiscoveryPage.module.css";

export function DiscoveryHero({ definition }: { definition: DiscoveryPageDefinition }) {
  const manifest = definition.sampleManifestId
    ? getDiscoverySampleManifest(definition.sampleManifestId)
    : undefined;
  const source = manifest ? getDiscoverySampleAsset(manifest, manifest.sourceAssetId) : undefined;

  return (
    <section className={styles.hero} aria-labelledby="discovery-title">
      <div className={styles.heroGrid}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{definition.message.eyebrow}</p>
          <h1 id="discovery-title" className={styles.heroTitle}>{definition.message.h1}</h1>
          <p className={styles.heroSupport}>{definition.message.support}</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryCta} href={definition.message.primaryCta.href}>
              {definition.message.primaryCta.label}
              <ArrowRight aria-hidden="true" />
            </Link>
            <a className={styles.textLink} href="#sample-comparison">
              {definition.sample.heroLinkLabel}
              <ArrowDown aria-hidden="true" />
            </a>
          </div>
          <p className={styles.heroNote}>{definition.message.heroNote}</p>
        </div>

        {source ? (
          <figure className={styles.heroMedia} data-source-person-id={source.personId}>
            <Image
              src={source.path}
              alt={source.alt}
              width={source.width}
              height={source.height}
              sizes="(max-width: 760px) 78vw, 34vw"
              priority
            />
            <figcaption>
              <span>{definition.sampleKind === "hair-grid" ? "ORIGIN REFERENCE" : "PRODUCT-AUTHORED SAMPLE"}</span>
              <strong>{definition.sample.heroCaption}</strong>
            </figcaption>
          </figure>
        ) : null}
      </div>
      <a className={styles.nextSectionHint} href="#sample-comparison" aria-label={`${definition.sample.title}로 이동`}>
        <span>{definition.sampleKind === "hair-grid" ? "3 STRATEGIES · 9 PREVIEWS" : "PALETTE · ZONES · PROFESSIONAL REPORT"}</span>
        <ArrowDown aria-hidden="true" />
      </a>
    </section>
  );
}
