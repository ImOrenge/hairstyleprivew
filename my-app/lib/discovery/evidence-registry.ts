import type { DiscoveryEvidenceEntry } from "./types.ts";

export const discoveryEvidenceRegistry = [
  {
    id: "EVD-STRATEGY-3",
    status: "verified",
    statement: "HairFit의 현재 프리미엄 컨설팅은 BALANCE, IMAGE, LIFESTYLE 세 전략 방향을 사용한다.",
    sourceRef: "my-app/components/home/PremiumConsultingShowcases.tsx#StrategicPreviewShowcase",
    verifiedAt: "2026-08-13",
    expiresAt: "2027-08-13",
    owner: "HairFit product",
  },
  {
    id: "EVD-PREVIEW-9",
    status: "verified",
    statement: "현재 V2 컨설팅과 랜딩은 아홉 개의 헤어 후보 보드를 제품 증거로 사용한다.",
    sourceRef: "my-app/lib/landing-premium-contract.test.ts#proof-artifacts",
    verifiedAt: "2026-08-13",
    expiresAt: "2027-08-13",
    owner: "HairFit frontend",
  },
  {
    id: "EVD-SHORTLIST-3",
    status: "verified",
    statement: "사용자는 아홉 후보에서 최대 세 개의 shortlist를 구성할 수 있다.",
    sourceRef: "packages/shared/src/v2/preview-board/contract.ts",
    verifiedAt: "2026-08-12",
    expiresAt: "2027-08-12",
    owner: "HairFit V2",
  },
  {
    id: "EVD-COMPARE-2",
    status: "verified",
    statement: "결정 단계는 최소 두 개의 후보 비교를 지원한다.",
    sourceRef: "my-app/components/consulting/workbenches/CompareWorkbench.tsx",
    verifiedAt: "2026-08-12",
    expiresAt: "2027-08-12",
    owner: "HairFit V2",
  },
  {
    id: "EVD-SALON-BRIEF",
    status: "verified",
    statement: "선택한 방향과 상담 정보는 Salon Brief 화면으로 연결된다.",
    sourceRef: "my-app/components/consulting/workbenches/BriefWorkbench.tsx",
    verifiedAt: "2026-08-12",
    expiresAt: "2027-08-12",
    owner: "HairFit V2",
  },
  {
    id: "EVD-RESULT-LIMIT",
    status: "verified",
    statement: "AI 후보는 의사결정을 돕는 시각 자료이며 실제 시술 결과를 보장하지 않는다.",
    sourceRef: "docs/hairfit-v2-premium-landing-baseline-2026-08-12.md",
    verifiedAt: "2026-08-12",
    expiresAt: "2027-08-12",
    owner: "HairFit product",
  },
] satisfies readonly DiscoveryEvidenceEntry[];

export function getDiscoveryEvidence(id: string) {
  return discoveryEvidenceRegistry.find((entry) => entry.id === id);
}
