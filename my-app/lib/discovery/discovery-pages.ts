import { discoveryEvidenceRegistry } from "./evidence-registry.ts";
import { discoverySampleManifests } from "./sample-manifests.ts";
import type { DiscoveryPageDefinition, DiscoveryPageId } from "./types.ts";
import { validateDiscoveryRegistry } from "./validate-discovery.ts";

export const discoveryPages = [
  {
    id: "D-AI-SIM",
    slug: "ai-hairstyle-simulation",
    status: "published",
    pageType: "core",
    intentId: "ai-hairstyle-simulation",
    audience: "b2c",
    locale: "ko-KR",
    updatedAt: "2026-08-14",
    seo: {
      title: "AI 헤어스타일 시뮬레이션, 9가지 후보 비교 | HairFit",
      description: "사진 한 장을 기준으로 BALANCE·IMAGE·LIFESTYLE 세 방향과 9가지 헤어 후보를 비교하고 상담에 활용할 스타일을 골라보세요.",
      canonicalPath: "/discover/ai-hairstyle-simulation",
      index: true,
    },
    message: {
      eyebrow: "HAIRFIT DISCOVERY · 01",
      h1: "AI 헤어스타일 시뮬레이션, 한 장에서 9가지 후보 비교",
      support: "세 가지 스타일 방향을 같은 기준에서 비교하고, 마음에 드는 후보를 골라 미용실 상담 자료까지 이어갑니다.",
      primaryCta: { id: "hero-primary", label: "프라이빗 AI 컨설팅 시작", href: "/consulting/new" },
      finalCta: { id: "final-primary", label: "내 사진으로 9가지 후보 만들기", href: "/consulting/new" },
      forbiddenClaims: ["실제 시술과 동일", "100% 어울림", "실패 없음", "정확도 보장"],
    },
    sections: [
      {
        type: "workflow",
        eyebrow: "HOW IT WORKS",
        title: "생성보다 먼저, 비교 기준을 세웁니다",
        description: "서로 다른 사진을 늘어놓지 않고 같은 인물과 구도에서 방향을 나눠 봅니다.",
        steps: [
          { title: "01 · 기준 확인", body: "얼굴선, 현재 모발, 원하는 인상을 상담 기준으로 정리합니다." },
          { title: "02 · 3전략 × 3후보", body: "BALANCE, IMAGE, LIFESTYLE마다 세 후보를 한 보드에서 비교합니다." },
          { title: "03 · 결정 자료 연결", body: "최대 세 후보를 좁히고 두 개 이상을 비교해 Salon Brief로 이어갑니다." },
        ],
      },
      {
        type: "proof",
        eyebrow: "DECISION ARTIFACTS",
        title: "결정에 필요한 결과물을 한 흐름으로",
        description: "현재 HairFit V2 화면과 계약으로 확인된 범위만 설명합니다.",
        items: [
          { label: "전략 방향", value: "3", evidenceId: "EVD-STRATEGY-3" },
          { label: "헤어 후보", value: "9", evidenceId: "EVD-PREVIEW-9" },
          { label: "Shortlist", value: "최대 3", evidenceId: "EVD-SHORTLIST-3" },
          { label: "후보 비교", value: "최소 2", evidenceId: "EVD-COMPARE-2" },
          { label: "살롱 전달", value: "Salon Brief", evidenceId: "EVD-SALON-BRIEF" },
        ],
      },
      {
        type: "trust",
        eyebrow: "TRUST BOUNDARY",
        title: "예시는 결정 자료이지, 시술 보장이 아닙니다",
        description: "모질, 현재 손상도, 시술 방식과 손질 환경에 따라 실제 결과는 달라질 수 있습니다.",
        notes: [
          { title: "같은 기준에서 비교", body: "이 페이지는 synthetic model로 구성된 고정 예시이며 사용자의 사진을 업로드하거나 분석하지 않습니다.", evidenceId: "EVD-PREVIEW-9" },
          { title: "결과 한계 표시", body: "AI 후보는 상담을 돕는 시각 자료입니다. 실제 시술 결과나 적합도를 보장하지 않습니다.", evidenceId: "EVD-RESULT-LIMIT" },
          { title: "상담에서 재확인", body: "선택한 방향은 현재 모발 상태와 관리 가능성을 확인한 뒤 Salon Brief에 정리합니다.", evidenceId: "EVD-SALON-BRIEF" },
        ],
      },
      { type: "related", title: "다른 HairFit 가이드" },
      { type: "faq", title: "AI 헤어스타일 시뮬레이션 FAQ" },
    ],
    faq: [
      { question: "사진을 올리지 않고도 이 페이지를 볼 수 있나요?", answer: "네. 이 페이지의 9개 이미지는 기능을 설명하기 위한 고정 synthetic sample입니다. 실제 사진 업로드와 분석은 컨설팅을 시작한 뒤 진행됩니다." },
      { question: "9가지 후보는 어떻게 나뉘나요?", answer: "얼굴선과 길이 균형을 보는 BALANCE, 원하는 인상을 조정하는 IMAGE, 손질과 일상 활용을 고려하는 LIFESTYLE 세 방향에 각각 세 후보를 배치합니다." },
      { question: "화면의 결과가 실제 시술과 같나요?", answer: "아닙니다. AI 후보는 비교와 상담을 돕는 시각 자료이며 모질, 손상도, 시술 방식에 따라 실제 결과가 달라질 수 있습니다." },
      { question: "후보를 고른 다음에는 무엇을 하나요?", answer: "컨설팅에서 최대 세 후보를 좁히고 최소 두 후보를 비교한 뒤, 선택 이유와 현장 확인 사항을 Salon Brief로 정리합니다." },
    ],
    sampleManifestId: "SAMPLE-D-AI-SIM-FEMALE-V2",
    evidenceIds: ["EVD-STRATEGY-3", "EVD-PREVIEW-9", "EVD-SHORTLIST-3", "EVD-COMPARE-2", "EVD-SALON-BRIEF", "EVD-RESULT-LIMIT"],
    relatedPageIds: [],
    trustPolicyVersion: "discovery-trust-v1",
    reviewer: "HairFit product design",
  },
] satisfies readonly DiscoveryPageDefinition[];

const registryFindings = validateDiscoveryRegistry({
  pages: discoveryPages,
  sampleManifests: discoverySampleManifests,
  evidence: discoveryEvidenceRegistry,
});

if (registryFindings.some((finding) => finding.priority === "P0" || finding.priority === "P1")) {
  throw new Error(`Invalid discovery registry: ${registryFindings.map((finding) => finding.id).join(", ")}`);
}

export function getDiscoveryPageById(id: DiscoveryPageId) {
  return discoveryPages.find((page) => page.id === id);
}

export function getDiscoveryPageBySlug(slug: string) {
  return discoveryPages.find((page) => page.slug === slug);
}

export function getPublishedDiscoveryPages() {
  return discoveryPages.filter((page) => page.status === "published");
}

export function getRelatedDiscoveryPages(page: DiscoveryPageDefinition) {
  const relatedIds = new Set(page.relatedPageIds);
  return getPublishedDiscoveryPages().filter((candidate) => relatedIds.has(candidate.id));
}
