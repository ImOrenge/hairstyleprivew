import { LandingScene, SceneHeader } from "@/components/home/LandingScene";
import type { DiscoveryDecisionArtifact as Artifact } from "@/lib/discovery/types";
import styles from "./DiscoveryPage.module.css";

export function DiscoveryDecisionArtifact({ artifact }: { artifact: Artifact }) {
  return (
    <LandingScene id="discovery-artifact" number="02" layout="editorial-split" tone="quiet" motion="none">
      <SceneHeader eyebrow={artifact.eyebrow} title={artifact.title} description={artifact.description} />
      <div className={styles.artifactGrid} data-artifact-kind={artifact.kind}>
        {artifact.items.map((item, index) => (
          <article className={styles.artifactItem} key={item.label}>
            <span className={styles.artifactIndex}>{String(index + 1).padStart(2, "0")}</span>
            <p className={styles.artifactLabel}>{item.label}</p>
            <h3>{item.value}</h3>
            <p>{item.body}</p>
            <small>{item.note}</small>
          </article>
        ))}
      </div>
    </LandingScene>
  );
}
