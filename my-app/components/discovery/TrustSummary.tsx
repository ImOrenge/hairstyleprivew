import { CheckCircle2, Info } from "lucide-react";
import { getDiscoveryEvidence } from "@/lib/discovery/evidence-registry";
import type { DiscoverySection } from "@/lib/discovery/types";
import styles from "./DiscoveryPage.module.css";

type TrustSection = Extract<DiscoverySection, { type: "trust" }>;

export function TrustSummary({ section }: { section: TrustSection }) {
  return (
    <div className={styles.trustGrid}>
      {section.notes.map((note) => {
        const evidence = getDiscoveryEvidence(note.evidenceId);
        return (
          <article key={note.title} className={styles.trustItem}>
            {evidence?.status === "verified" ? <CheckCircle2 aria-hidden="true" /> : <Info aria-hidden="true" />}
            <div>
              <h3>{note.title}</h3>
              <p>{note.body}</p>
              <span>근거 확인 · {evidence?.verifiedAt ?? "확인 필요"}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
