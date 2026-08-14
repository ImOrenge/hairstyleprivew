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
              9가지 예시 먼저 보기
              <ArrowDown aria-hidden="true" />
            </a>
          </div>
          <p className={styles.heroNote}>이 페이지의 이미지는 기능 설명용 고정 synthetic sample이며, 사진 업로드는 컨설팅 시작 후 진행됩니다.</p>
        </div>

        {source ? (
          <figure className={styles.heroMedia}>
            <Image
              src={source.path}
              alt={source.alt}
              width={source.width}
              height={source.height}
              sizes="(max-width: 760px) 78vw, 34vw"
              priority
            />
            <figcaption>
              <span>ORIGIN REFERENCE</span>
              <strong>같은 인물과 구도에서 9개 후보를 비교합니다.</strong>
            </figcaption>
          </figure>
        ) : null}
      </div>
      <a className={styles.nextSectionHint} href="#sample-comparison" aria-label="9가지 헤어 후보 비교로 이동">
        <span>3 STRATEGIES · 9 PREVIEWS</span>
        <ArrowDown aria-hidden="true" />
      </a>
    </section>
  );
}
