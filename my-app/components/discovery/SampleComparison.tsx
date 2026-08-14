import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getDiscoverySampleAsset, getDiscoverySampleManifest } from "@/lib/discovery/sample-manifests";
import type { DiscoveryPageDefinition } from "@/lib/discovery/types";
import styles from "./DiscoveryPage.module.css";

export function SampleComparison({ definition }: { definition: DiscoveryPageDefinition }) {
  const manifest = definition.sampleManifestId
    ? getDiscoverySampleManifest(definition.sampleManifestId)
    : undefined;
  if (!manifest) return null;

  return (
    <section id="sample-comparison" className={styles.sampleSection} aria-labelledby="sample-title">
      <header className={styles.sectionHeader}>
        <p className={styles.eyebrow}>{definition.sample.eyebrow}</p>
        <h2 id="sample-title">{definition.sample.title}</h2>
        <p>{definition.sample.description}</p>
      </header>

      <div className={styles.strategyList}>
        {manifest.strategies.map((strategy) => (
          <section key={strategy.id} className={styles.strategy} aria-labelledby={`strategy-${strategy.id}`}>
            <header className={styles.strategyHeader}>
              <span>{strategy.id}</span>
              <div>
                <h3 id={`strategy-${strategy.id}`}>{strategy.label}</h3>
                <p>{strategy.description}</p>
              </div>
            </header>
            <div className={styles.previewGrid}>
              {strategy.assetIds.map((assetId, index) => {
                const asset = getDiscoverySampleAsset(manifest, assetId);
                if (!asset) return null;
                return (
                  <figure key={asset.id} className={styles.preview}>
                    <Image
                      src={asset.path}
                      alt={asset.alt}
                      width={asset.width}
                      height={asset.height}
                      sizes="(max-width: 560px) 30vw, (max-width: 980px) 28vw, 20vw"
                    />
                    <figcaption>{strategy.id.slice(0, 1)}-{index + 1}</figcaption>
                  </figure>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className={styles.sampleCta}>
        <p>{definition.sample.note}</p>
        <Link className={styles.primaryCta} href={definition.message.sampleCta.href}>
          {definition.message.sampleCta.label}
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
