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

  if (manifest.sampleKind === "makeup-direction") {
    const source = getDiscoverySampleAsset(manifest, manifest.sourceAssetId);
    return (
      <section
        id="sample-comparison"
        className={styles.sampleSection}
        aria-labelledby="sample-title"
        data-sample-layout={sampleLayouts[definition.id]}
        data-sample-kind={manifest.sampleKind}
      >
        <header className={styles.sectionHeader}>
          <p className={styles.eyebrow}>{definition.sample.eyebrow}</p>
          <h2 id="sample-title">{definition.sample.title}</h2>
          <p>{definition.sample.description}</p>
        </header>
        <div className={styles.makeupSample}>
          {source ? (
            <figure className={styles.makeupSampleVisual}>
              <Image src={source.path} alt={source.alt} width={source.width} height={source.height} sizes="(max-width: 760px) 78vw, 34vw" />
              <figcaption>제품 작성 예시 · 실제 고객 전후 사진 아님</figcaption>
            </figure>
          ) : null}
          <div className={styles.makeupSampleBoard}>
            <div className={styles.makeupPaletteGroups}>
              {manifest.direction.palettes.map((palette) => (
                <section key={palette.group} aria-labelledby={`makeup-palette-${palette.group}`}>
                  <h3 id={`makeup-palette-${palette.group}`}>{palette.label}</h3>
                  <ul className={styles.makeupPalette}>
                    {palette.colors.map((color) => <li key={color.token}><span data-makeup-swatch={color.token} aria-hidden="true" /><strong>{color.label}</strong><small>{color.note}</small></li>)}
                  </ul>
                </section>
              ))}
            </div>
            <dl className={styles.makeupZones}>
              {manifest.direction.zones.map((zone) => <div key={zone.area}><dt>{zone.area}</dt><dd><strong>{zone.direction}</strong><span>{zone.reason}</span></dd></div>)}
            </dl>
            <ol className={styles.makeupRoutine} aria-label="셀프 메이크업 적용 순서">
              {manifest.direction.routine.map((item) => <li key={item.step}><span>{item.step}</span><div><strong>{item.title}</strong><p>{item.body}</p></div></li>)}
            </ol>
            <article className={styles.makeupReport}>
              <span>AI 메이크업 디렉터 리포트 · 예시</span>
              <h3>{manifest.direction.report.headline}</h3>
              <p>{manifest.direction.report.summary}</p>
              <footer><strong>ARTIST BRIEF</strong>{manifest.direction.report.artistBrief}</footer>
            </article>
          </div>
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

  return (
    <section
      id="sample-comparison"
      className={styles.sampleSection}
      aria-labelledby="sample-title"
      data-sample-layout={sampleLayouts[definition.id]}
      data-sample-kind={manifest.sampleKind}
    >
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
                    <figcaption data-catalog-style={asset.catalogStyleSlug}>
                      <span>{strategy.id.slice(0, 1)}-{index + 1} · CATALOG V4</span>
                      <strong>{asset.catalogNameKo ?? asset.alt}</strong>
                    </figcaption>
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

export const sampleLayouts = {
  "D-AI-SIM": "direction-matrix",
  "D-FACE": "observation-rails",
  "D-MEN": "grooming-schedule",
  "D-WOMEN": "length-chapters",
  "D-BANGS": "fringe-baseline",
  "D-MAKEUP": "makeup-direction-report",
  "D-SALON": "salon-shortlist",
} as const satisfies Record<DiscoveryPageDefinition["id"], string>;
