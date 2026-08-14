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
        <p className={styles.eyebrow}>STATIC SAMPLE BOARD</p>
        <h2 id="sample-title">세 가지 방향에서 아홉 후보를 비교하세요</h2>
        <p>서로 다른 사람의 완성 사진을 섞지 않고, 하나의 continuity set을 세 기준으로 나눠 보여줍니다.</p>
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
        <p>예시는 방향을 이해하기 위한 자료입니다. 내 사진에 맞는 후보는 컨설팅에서 별도로 만듭니다.</p>
        <Link className={styles.primaryCta} href="/consulting/new">
          내 기준으로 컨설팅 시작
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
