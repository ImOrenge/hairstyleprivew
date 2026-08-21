import { discoveryEvidenceRegistry } from "./evidence-registry.ts";
import { discoverySampleManifests } from "./sample-manifests.ts";
import type { DiscoveryPageDefinition, DiscoveryPageId, DiscoverySection } from "./types.ts";
import { validateDiscoveryRegistry } from "./validate-discovery.ts";

const forbiddenClaims = ["실제 시술과 동일", "100% 어울림", "실패 없음", "정확도 보장"] as const;
const commonEvidence = ["EVD-STRATEGY-3", "EVD-PREVIEW-9", "EVD-SHORTLIST-3", "EVD-COMPARE-2", "EVD-SALON-BRIEF", "EVD-RESULT-LIMIT"] as const;

interface PageSeed {
  id: DiscoveryPageId;
  slug: string;
  pageType: DiscoveryPageDefinition["pageType"];
  audience: DiscoveryPageDefinition["audience"];
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  support: string;
  heroNote: string;
  primaryLabel: string;
  sampleLabel: string;
  finalLabel: string;
  finalTitle: string;
  finalSupport: string;
  sample: DiscoveryPageDefinition["sample"];
  artifact: DiscoveryPageDefinition["artifact"];
  workflowTitle: string;
  workflowDescription: string;
  workflowSteps: readonly { title: string; body: string }[];
  proofTitle: string;
  uniqueProofLabel: string;
  uniqueProofValue: string;
  trustTitle: string;
  trustDescription: string;
  trustNote: { title: string; body: string };
  faq: DiscoveryPageDefinition["faq"];
  manifestId: string;
  uniqueEvidenceId: string;
  relatedPageIds: readonly DiscoveryPageId[];
}

function page(seed: PageSeed): DiscoveryPageDefinition {
  const sections: readonly DiscoverySection[] = [
    {
      type: "workflow",
      eyebrow: "HOW TO COMPARE",
      title: seed.workflowTitle,
      description: seed.workflowDescription,
      steps: seed.workflowSteps,
    },
    {
      type: "proof",
      eyebrow: "PRODUCT CONTRACT",
      title: seed.proofTitle,
      description: "현재 HairFit V2 화면과 코드 계약에서 확인할 수 있는 범위만 표시합니다.",
      items: [
        { label: seed.uniqueProofLabel, value: seed.uniqueProofValue, evidenceId: seed.uniqueEvidenceId },
        { label: "스타일 방향", value: "3", evidenceId: "EVD-STRATEGY-3" },
        { label: "헤어 후보", value: "9", evidenceId: "EVD-PREVIEW-9" },
        { label: "Shortlist", value: "최대 3", evidenceId: "EVD-SHORTLIST-3" },
        { label: "후보 비교", value: "최소 2", evidenceId: "EVD-COMPARE-2" },
      ],
    },
    {
      type: "trust",
      eyebrow: "TRUST BOUNDARY",
      title: seed.trustTitle,
      description: seed.trustDescription,
      notes: [
        { ...seed.trustNote, evidenceId: seed.uniqueEvidenceId },
        { title: "고정 합성 예시", body: "이 페이지는 기능 설명용 synthetic model을 사용하며 방문자의 사진을 자동으로 수집하거나 분석하지 않습니다.", evidenceId: "EVD-PREVIEW-9" },
        { title: "시술 결과는 별도", body: "후보 이미지는 비교와 상담을 돕는 시각 자료입니다. 모질, 손상도와 시술 방식에 따라 실제 결과는 달라집니다.", evidenceId: "EVD-RESULT-LIMIT" },
      ],
    },
    { type: "related", title: "다음 비교 기준도 확인하세요" },
    { type: "faq", title: `${seed.h1.replace(/,.+$/, "")} FAQ` },
  ];

  return {
    id: seed.id,
    slug: seed.slug,
    status: "published",
    pageType: seed.pageType,
    intentId: seed.slug,
    audience: seed.audience,
    locale: "ko-KR",
    updatedAt: "2026-08-14",
    seo: {
      title: seed.title,
      description: seed.description,
      canonicalPath: `/discover/${seed.slug}`,
      index: true,
    },
    message: {
      eyebrow: seed.eyebrow,
      h1: seed.h1,
      support: seed.support,
      heroNote: seed.heroNote,
      primaryCta: { id: "hero-primary", label: seed.primaryLabel, href: "/consulting/new" },
      sampleCta: { id: "sample-primary", label: seed.sampleLabel, href: "/consulting/new" },
      finalCta: { id: "final-primary", label: seed.finalLabel, href: "/consulting/new" },
      finalTitle: seed.finalTitle,
      finalSupport: `${seed.finalSupport} 사진 분석에서 시작해 퍼스널 컬러·메이크업·패션 방향까지 같은 상담 맥락으로 이어갈 수 있습니다.`,
      forbiddenClaims,
    },
    sample: seed.sample,
    artifact: seed.artifact,
    sections,
    faq: seed.faq,
    sampleManifestId: seed.manifestId,
    evidenceIds: [...commonEvidence, seed.uniqueEvidenceId],
    relatedPageIds: seed.relatedPageIds,
    trustPolicyVersion: "discovery-trust-v1",
    reviewer: "HairFit product design",
  };
}

export const discoveryPages = [
  page({
    id: "D-AI-SIM",
    slug: "ai-hairstyle-simulation",
    pageType: "core",
    audience: "b2c",
    title: "AI 헤어스타일 시뮬레이션, 9가지 후보 비교 | HairFit",
    description: "사진 한 장을 기준으로 세 방향과 9가지 AI 헤어 후보를 비교하고 상담에 활용할 스타일을 골라보세요.",
    eyebrow: "HAIRFIT DISCOVERY · 01",
    h1: "AI 헤어스타일 시뮬레이션, 한 장에서 9가지 후보 비교",
    support: "같은 기준 인물에서 BALANCE·IMAGE·LIFESTYLE 세 방향을 비교하고, 마음에 드는 후보를 상담 자료로 이어갑니다.",
    heroNote: "아래 이미지는 업로드 없이 볼 수 있는 고정 합성 예시입니다.",
    primaryLabel: "프라이빗 AI 컨설팅 시작",
    sampleLabel: "내 사진 분석부터 시작",
    finalLabel: "분석 후 9가지 후보 비교",
    finalTitle: "검색에서 본 후보를, 내 상담 기준으로 바꿔보세요",
    finalSupport: "사진과 원하는 인상을 확인한 뒤 세 방향의 후보 보드를 만듭니다.",
    sample: {
      eyebrow: "STATIC PRODUCT SAMPLE",
      title: "같은 얼굴, 세 방향, 아홉 후보",
      description: "길이와 앞머리, 볼륨을 한 번에 바꾸지 않고 세 전략으로 나눠 비교합니다.",
      heroLinkLabel: "9가지 샘플 먼저 보기",
      heroCaption: "같은 synthetic model을 유지한 3×3 후보 보드",
      note: "샘플은 기능 설명용이며 개인 적합도나 실제 시술 결과를 뜻하지 않습니다.",
    },
    artifact: {
      kind: "simulation-map",
      eyebrow: "3 DIRECTION MAP",
      title: "아홉 장을 무작위로 보지 않는 비교 지도",
      description: "각 줄은 답을 고르는 방식이 다릅니다. 먼저 무엇을 바꿀지 정한 뒤 같은 줄 안에서 세 후보를 비교합니다.",
      items: [
        { label: "BALANCE", value: "얼굴선 × 길이", body: "턱선과 어깨선 주변에서 끝나는 위치를 바꿔 전체 비율을 봅니다.", note: "먼저 볼 것: 끝선 위치" },
        { label: "IMAGE", value: "앞머리 × 볼륨", body: "이마 노출과 정수리·옆 볼륨이 인상에 주는 차이를 비교합니다.", note: "먼저 볼 것: 원하는 인상" },
        { label: "LIFESTYLE", value: "질감 × 관리", body: "레이어와 컬의 강도를 아침 손질 시간, 유지 주기와 함께 판단합니다.", note: "먼저 볼 것: 매일 가능한 관리" },
      ],
    },
    workflowTitle: "생성보다 먼저, 비교 기준을 세웁니다",
    workflowDescription: "서로 다른 사진을 늘어놓지 않고 같은 인물과 구도에서 방향을 나눕니다.",
    workflowSteps: [
      { title: "01 · 기준 확인", body: "얼굴선, 현재 모발과 원하는 인상을 상담 기준으로 정리합니다." },
      { title: "02 · 3전략 × 3후보", body: "세 방향마다 세 후보를 만들어 한 보드에서 비교합니다." },
      { title: "03 · 결정 자료 연결", body: "최대 세 후보를 좁히고 Salon Brief로 이어갑니다." },
    ],
    proofTitle: "검색용 설명과 실제 제품 계약을 연결했습니다",
    uniqueProofLabel: "공개 페이지 계약",
    uniqueProofValue: "정적 SEO",
    trustTitle: "시뮬레이션은 결정 자료이지 시술 보장이 아닙니다",
    trustDescription: "실제 결과는 현재 모발 상태, 시술 방식과 손질 환경에 따라 달라집니다.",
    trustNote: { title: "정적 공개 범위", body: "페이지 자체는 canonical과 구조화 데이터가 있는 공개 설명 화면이며 사진 분석은 상담 진입 후에 시작됩니다." },
    faq: [
      { question: "사진을 올리지 않고도 샘플을 볼 수 있나요?", answer: "네. 이 페이지의 9개 이미지는 기능 설명을 위한 고정 synthetic sample입니다." },
      { question: "9가지 후보는 어떻게 나뉘나요?", answer: "BALANCE, IMAGE, LIFESTYLE 세 방향에 각각 세 후보를 배치합니다." },
      { question: "화면 결과가 실제 시술과 같나요?", answer: "아닙니다. 비교와 상담을 돕는 시각 자료이며 실제 결과는 달라질 수 있습니다." },
      { question: "후보를 고른 뒤에는 무엇을 하나요?", answer: "최대 세 후보를 좁히고 두 개 이상을 비교한 뒤 Salon Brief로 정리합니다." },
    ],
    manifestId: "SAMPLE-D-AI-SIM-CATALOG-V4",
    uniqueEvidenceId: "EVD-AI-SIM-CANARY",
    relatedPageIds: ["D-FACE", "D-MEN", "D-WOMEN"],
  }),
  page({
    id: "D-FACE",
    slug: "face-shape-hairstyle",
    pageType: "core",
    audience: "b2c",
    title: "얼굴형에 맞는 헤어스타일, 얼굴선으로 비교하기 | HairFit",
    description: "얼굴형 이름 하나로 단정하지 않고 이마·광대·턱선과 길이, 옆 볼륨을 함께 비교하는 방법을 확인하세요.",
    eyebrow: "HAIRFIT DISCOVERY · 02",
    h1: "얼굴형 헤어스타일, 이름보다 얼굴선과 길이로 비교",
    support: "둥근형·긴형 같은 라벨 대신 이마, 광대, 턱선의 관찰 근거와 헤어 실루엣의 관계를 살펴봅니다.",
    heroNote: "측정값은 사진 안의 정규화 비율이며 실제 cm나 미용 진단이 아닙니다.",
    primaryLabel: "내 얼굴선 기준 상담 시작",
    sampleLabel: "내 얼굴선 분석부터 시작",
    finalLabel: "분석 후 얼굴선 후보 비교",
    finalTitle: "얼굴형 정답 대신, 설명 가능한 비교 기준을 만드세요",
    finalSupport: "얼굴선 근거와 원하는 인상을 함께 확인해 길이·가르마·볼륨 후보를 구성합니다.",
    sample: {
      eyebrow: "FACE LINE COMPARISON",
      title: "턱선, 이마 노출, 질감을 나눠 보는 9가지",
      description: "짧고 긴 헤어를 단순 추천하지 않고 어느 선과 볼륨이 달라지는지 비교합니다.",
      heroLinkLabel: "얼굴선 샘플 보기",
      heroCaption: "턱선·이마 노출·질감 축으로 재배열한 동일 인물 샘플",
      note: "얼굴 관찰 근거는 후보 설명을 위한 보조 정보이며 외모 평가나 진단에 사용하지 않습니다.",
    },
    artifact: {
      kind: "face-observation",
      eyebrow: "OBSERVATION MAP",
      title: "얼굴형 이름 대신 기록하는 네 가지 관찰",
      description: "하나의 얼굴형 라벨로 추천을 끝내지 않고, 후보마다 어떤 선을 열고 감쌌는지 설명합니다.",
      items: [
        { label: "FOREHEAD", value: "이마 노출", body: "앞머리 유무와 가르마로 위쪽 얼굴선이 얼마나 드러나는지 봅니다.", note: "촬영 각도 영향 확인" },
        { label: "CHEEKBONE", value: "광대 주변", body: "옆머리의 시작점과 볼륨이 가장 넓은 지점에 닿는 방식을 봅니다.", note: "폭은 사진 내 비율" },
        { label: "JAW", value: "턱선 끝점", body: "끝선이 턱 위, 턱 아래, 어깨로 이동할 때 윤곽 변화를 비교합니다.", note: "진단이 아닌 후보 설명" },
        { label: "VERTICAL", value: "세로 흐름", body: "정수리 볼륨과 긴 레이어가 얼굴 길이 인상에 주는 차이를 봅니다.", note: "표정·렌즈 왜곡 고려" },
      ],
    },
    workflowTitle: "얼굴형 라벨을 세부 관찰로 풀어냅니다",
    workflowDescription: "사진 속 비율과 실제 모발 조건을 분리해 후보 선택 이유를 남깁니다.",
    workflowSteps: [
      { title: "01 · 선 관찰", body: "이마, 광대, 턱과 얼굴 길이를 사진 내 비율로 확인합니다." },
      { title: "02 · 실루엣 대조", body: "턱선 주변 길이와 옆 볼륨, 가르마 노출을 바꿔 봅니다." },
      { title: "03 · 조건 재확인", body: "선호 후보를 현재 모발과 관리 가능성에 맞춰 다시 확인합니다." },
    ],
    proofTitle: "얼굴형 단정 대신 관찰 가능한 근거를 씁니다",
    uniqueProofLabel: "관찰 축",
    uniqueProofValue: "길이·폭·비율",
    trustTitle: "사진 비율은 참고 근거이지 얼굴형 판정이 아닙니다",
    trustDescription: "촬영 각도와 표정, 렌즈에 따라 관찰값이 달라질 수 있습니다.",
    trustNote: { title: "정규화 측정", body: "분석 계약은 얼굴 길이와 이마·광대·턱 폭을 사진 안의 정규화 값으로 다룹니다." },
    faq: [
      { question: "얼굴형을 자동으로 확정하나요?", answer: "아니요. 얼굴형 이름을 정답처럼 확정하지 않고 여러 관찰 근거를 후보 설명에 사용합니다." },
      { question: "사진의 측정값은 실제 cm인가요?", answer: "아닙니다. 사진 안에서 비교하는 정규화 거리와 비율입니다." },
      { question: "얼굴선만 보고 스타일을 고르나요?", answer: "현재 모발, 원하는 인상, 손질 가능 시간도 함께 봅니다." },
      { question: "결과가 잘 어울린다는 보장인가요?", answer: "아닙니다. 후보를 비교하고 미용실에서 대화하기 위한 자료입니다." },
    ],
    manifestId: "SAMPLE-D-FACE-CATALOG-V4",
    uniqueEvidenceId: "EVD-FACE-MEASUREMENT",
    relatedPageIds: ["D-AI-SIM", "D-BANGS", "D-BOB"],
  }),
  page({
    id: "D-MEN",
    slug: "men-hairstyle-simulation",
    pageType: "audience",
    audience: "b2c",
    title: "남자 헤어스타일 시뮬레이션, 가르마·길이 비교 | HairFit",
    description: "남자 짧은 머리부터 중간 길이까지 가르마, 앞머리, 텍스처를 같은 얼굴의 9가지 후보로 비교하세요.",
    eyebrow: "HAIRFIT DISCOVERY · 03",
    h1: "남자 헤어스타일 시뮬레이션, 가르마와 길이를 한눈에",
    support: "크롭, 센터 파트, 사이드 파트를 이름만 나열하지 않고 이마 노출과 옆 볼륨, 손질 조건으로 비교합니다.",
    heroNote: "남성 전용 동일 인물 샘플로 길이와 가르마 차이를 보여줍니다.",
    primaryLabel: "남자 헤어 컨설팅 시작",
    sampleLabel: "내 사진 분석부터 시작",
    finalLabel: "분석 후 남자 헤어 비교",
    finalTitle: "이름이 비슷한 남자 머리도, 기준을 나누면 선택이 쉬워집니다",
    finalSupport: "이마 노출, 옆 볼륨과 아침 손질 시간을 기준으로 아홉 후보를 비교해 보세요.",
    sample: {
      eyebrow: "MEN'S STYLE BOARD",
      title: "크롭부터 센터 파트까지, 같은 인물의 9가지",
      description: "짧은 길이, 가르마 인상, 중간 길이 관리 부담을 세 줄로 나눴습니다.",
      heroLinkLabel: "남자 헤어 샘플 보기",
      heroCaption: "남성 synthetic model을 유지한 3×3 전용 후보 보드",
      note: "모발 밀도, 뜨는 방향과 다운펌 가능 여부는 실제 상담에서 별도로 확인해야 합니다.",
    },
    artifact: {
      kind: "men-grooming",
      eyebrow: "MEN'S GROOMING MATRIX",
      title: "가르마 선택을 아침 손질 루틴까지 연결",
      description: "남자 헤어는 같은 커트 이름이어도 이마 노출, 옆 모류와 제품 사용 여부에 따라 유지 난이도가 달라집니다.",
      items: [
        { label: "CROP / FRINGE", value: "앞머리 내림", body: "짧은 텍스처로 이마를 덮고 빠른 건조를 우선합니다.", note: "확인: 앞머리 뜨는 방향" },
        { label: "CENTER PART", value: "중앙 가르마", body: "양쪽으로 흐르는 길이와 뿌리 볼륨을 만들 수 있는지 봅니다.", note: "확인: 드라이·제품 사용" },
        { label: "SIDE PART", value: "측면 가르마", body: "이마를 열고 옆선을 정리하되 뜨는 모발과 커트 주기를 고려합니다.", note: "확인: 다운펌 가능성" },
      ],
    },
    workflowTitle: "스타일 이름보다 이마와 옆선을 먼저 봅니다",
    workflowDescription: "비슷해 보이는 남자 헤어를 길이, 가르마와 관리 조건으로 구분합니다.",
    workflowSteps: [
      { title: "01 · 이마 노출", body: "앞머리를 내릴지, 센터나 사이드로 열지 비교합니다." },
      { title: "02 · 옆 볼륨", body: "귀 주변 길이와 뜨는 모발을 고려해 실루엣을 나눕니다." },
      { title: "03 · 손질 조건", body: "드라이, 제품 사용과 커트 주기를 후보 메모에 남깁니다." },
    ],
    proofTitle: "남성 전용 기준 인물로 변화만 비교합니다",
    uniqueProofLabel: "남성 샘플",
    uniqueProofValue: "동일 인물 9컷",
    trustTitle: "사진에서 보이는 스타일과 실제 모발 거동은 다를 수 있습니다",
    trustDescription: "모류, 밀도, 두상과 시술 선택은 현장에서 확인해야 합니다.",
    trustNote: { title: "전용 continuity", body: "남성 샘플 보드는 한 기준 인물에서 아홉 후보를 만들어 얼굴 차이가 아닌 헤어 변화에 집중합니다." },
    faq: [
      { question: "남자 헤어만 따로 비교할 수 있나요?", answer: "네. 이 페이지는 남성 기준 인물의 짧은 길이, 가르마와 텍스처 후보를 보여줍니다." },
      { question: "다운펌 여부도 알 수 있나요?", answer: "이미지만으로 확정할 수 없습니다. 옆 모발의 뜨는 방향과 시술 가능성은 현장에서 확인하세요." },
      { question: "센터 파트와 사이드 파트를 함께 볼 수 있나요?", answer: "네. 이마 노출과 가르마 위치가 다른 후보를 같은 보드에서 비교합니다." },
      { question: "긴 남자 머리도 포함되나요?", answer: "짧은 크롭부터 귀와 목선을 덮는 중간·긴 후보까지 포함합니다." },
    ],
    manifestId: "SAMPLE-D-MEN-CATALOG-V4",
    uniqueEvidenceId: "EVD-MEN-CONTINUITY",
    relatedPageIds: ["D-AI-SIM", "D-SALON", "D-FACE"],
  }),
  page({
    id: "D-WOMEN",
    slug: "women-hairstyle-simulation",
    pageType: "audience",
    audience: "b2c",
    title: "여자 헤어스타일 시뮬레이션, 단발·미디엄·롱 비교 | HairFit",
    description: "여자 단발, 미디엄, 롱 헤어의 길이·레이어·앞머리를 같은 얼굴의 9가지 후보로 비교해 보세요.",
    eyebrow: "HAIRFIT DISCOVERY · 04",
    h1: "여자 헤어스타일 시뮬레이션, 단발부터 롱까지 비교",
    support: "길이만 바꾸는 추천이 아니라 끝선, 레이어, 앞머리와 컬이 인상과 관리에 주는 차이를 함께 봅니다.",
    heroNote: "여성 전용 동일 인물 샘플로 길이 구간별 차이를 확인할 수 있습니다.",
    primaryLabel: "여자 헤어 컨설팅 시작",
    sampleLabel: "내 사진 분석부터 시작",
    finalLabel: "분석 후 여자 헤어 비교",
    finalTitle: "자를지 기를지 고민이라면, 길이 구간을 같은 화면에서 비교하세요",
    finalSupport: "단발·미디엄·롱 후보를 레이어와 관리 조건까지 포함해 좁혀갑니다.",
    sample: {
      eyebrow: "WOMEN'S LENGTH BOARD",
      title: "단발, 미디엄, 롱을 나눈 9가지 실루엣",
      description: "끝선과 레이어, 앞머리, 웨이브가 다른 후보를 길이 구간별로 비교합니다.",
      heroLinkLabel: "여자 헤어 샘플 보기",
      heroCaption: "여성 synthetic model을 유지한 길이별 3×3 후보 보드",
      note: "현재 길이에서 가능한 커트·펌 범위와 손상도는 실제 상담에서 다시 확인합니다.",
    },
    artifact: {
      kind: "women-length",
      eyebrow: "LENGTH ZONES",
      title: "자를 길이를 세 구간의 생활 변화로 비교",
      description: "길이 선택은 인상뿐 아니라 묶임 가능 여부, 건조 시간과 유지 주기를 함께 바꿉니다.",
      items: [
        { label: "BOB", value: "턱선 전후", body: "목선이 드러나고 끝선이 선명해지는 대신 자주 다듬어야 합니다.", note: "묶임: 제한적 · 유지: 짧음" },
        { label: "MEDIUM", value: "어깨선 전후", body: "묶을 수 있는 여지를 남기면서 끝선과 레이어 변화를 만들 수 있습니다.", note: "묶임: 가능 · 유지: 중간" },
        { label: "LONG", value: "쇄골 아래", body: "길이를 유지하며 얼굴선 레이어와 웨이브로 변화 폭을 조절합니다.", note: "묶임: 쉬움 · 건조: 오래 걸림" },
      ],
    },
    workflowTitle: "길이 선택을 끝선과 관리 조건으로 구체화합니다",
    workflowDescription: "단발·미디엄·롱이라는 큰 범주 안에서도 실제 결정 포인트를 나눕니다.",
    workflowSteps: [
      { title: "01 · 기준 길이", body: "턱선, 어깨선, 쇄골 아래처럼 끝선 위치를 비교합니다." },
      { title: "02 · 표면 변화", body: "레이어와 컬, 앞머리가 만드는 움직임을 확인합니다." },
      { title: "03 · 유지 계획", body: "드라이 시간과 커트·펌 주기를 후보 선택에 반영합니다." },
    ],
    proofTitle: "여성 전용 동일 인물 보드로 길이 차이를 분리합니다",
    uniqueProofLabel: "여성 샘플",
    uniqueProofValue: "3개 길이 구간",
    trustTitle: "보이는 길이와 실제로 가능한 시술 범위는 다를 수 있습니다",
    trustDescription: "현재 층, 손상도와 모발 수축에 따라 완성 길이가 달라질 수 있습니다.",
    trustNote: { title: "길이별 continuity", body: "여성 샘플은 한 기준 인물에서 단발, 미디엄과 롱 후보를 비교하도록 구성했습니다." },
    faq: [
      { question: "단발과 긴 머리를 한 번에 비교할 수 있나요?", answer: "네. 같은 기준 인물의 단발, 미디엄과 롱 후보를 한 보드에서 볼 수 있습니다." },
      { question: "앞머리도 함께 바뀌나요?", answer: "일부 후보는 앞머리 유무가 다릅니다. 앞머리만 집중해서 보고 싶다면 앞머리 미리보기 페이지를 이용하세요." },
      { question: "펌 결과를 보장하나요?", answer: "아닙니다. 컬 표현은 비교용이며 실제 결과는 모질과 시술 방식에 따라 달라집니다." },
      { question: "후보를 미용실에 보여줄 수 있나요?", answer: "선택 후보와 조건은 컨설팅의 Salon Brief로 정리할 수 있습니다." },
    ],
    manifestId: "SAMPLE-D-WOMEN-CATALOG-V4",
    uniqueEvidenceId: "EVD-WOMEN-CONTINUITY",
    relatedPageIds: ["D-AI-SIM", "D-BANGS", "D-BOB"],
  }),
  page({
    id: "D-BANGS",
    slug: "bangs-preview",
    pageType: "style",
    audience: "b2c",
    title: "앞머리 미리보기, 시스루·오픈·컬 프린지 비교 | HairFit",
    description: "앞머리 없는 스타일과 시스루, 사이드, 컬 프린지를 같은 얼굴에서 비교하고 이마 노출과 손질 부담을 확인하세요.",
    eyebrow: "HAIRFIT DISCOVERY · 05",
    h1: "앞머리 미리보기, 자르기 전에 이마 노출부터 비교",
    support: "앞머리 유무를 단순 합성하지 않고 오픈, 소프트 프린지와 질감 후보를 나눠 얼굴선과 관리 차이를 봅니다.",
    heroNote: "앞머리는 짧게 자르면 되돌리기 어려워 길이·모류·손질 조건을 함께 확인해야 합니다.",
    primaryLabel: "앞머리 컨설팅 시작",
    sampleLabel: "내 사진 분석부터 시작",
    finalLabel: "분석 후 앞머리 후보 비교",
    finalTitle: "앞머리는 한 장보다, 없는 기준과 함께 봐야 합니다",
    finalSupport: "오픈·사이드·풀 프린지 축과 현재 모류를 확인해 비교 가능한 후보를 만듭니다.",
    sample: {
      eyebrow: "FRINGE DECISION BOARD",
      title: "이마를 연 기준부터 소프트·컬 프린지까지",
      description: "앞머리가 없는 대조군을 함께 두어 얼굴선과 인상 변화가 어디서 생기는지 봅니다.",
      heroLinkLabel: "앞머리 샘플 보기",
      heroCaption: "오픈·소프트·텍스처 프린지로 나눈 동일 인물 샘플",
      note: "짧은 앞머리의 회복 기간, 가마와 곱슬 정도는 이미지에서 확정할 수 없습니다.",
    },
    artifact: {
      kind: "bangs-risk",
      eyebrow: "BEFORE YOU CUT",
      title: "앞머리 선택 전 반드시 확인할 되돌림 리스크",
      description: "이미지상 인상보다 실제로 되돌리기 어렵거나 매일 손질에 영향을 주는 조건을 먼저 점검합니다.",
      items: [
        { label: "ROOT", value: "가마·모류", body: "뿌리가 갈라지거나 위로 뜨면 원하는 방향으로 내려오지 않을 수 있습니다.", note: "현장에서 젖은 모발 확인" },
        { label: "SHRINK", value: "건조 수축", body: "곱슬과 컬이 있으면 젖었을 때보다 마른 뒤 더 짧아질 수 있습니다.", note: "마른 상태 기준 길이 확보" },
        { label: "CARE", value: "아침 손질", body: "물 적심, 드라이와 열기구 사용이 매일 가능한지 판단합니다.", note: "루틴이 어렵다면 긴 사이드뱅" },
        { label: "RECOVERY", value: "기를 시간", body: "짧게 자른 앞머리는 다시 옆으로 넘길 길이까지 시간이 필요합니다.", note: "없는 기준 후보와 함께 결정" },
      ],
    },
    workflowTitle: "앞머리 유무와 형태를 따로 비교합니다",
    workflowDescription: "자른 뒤의 이미지뿐 아니라 이마를 연 기준 후보와 손질 조건을 함께 둡니다.",
    workflowSteps: [
      { title: "01 · 오픈 기준", body: "앞머리 없이 이마와 눈썹이 보이는 현재 인상을 확인합니다." },
      { title: "02 · 형태 대조", body: "사이드, 시스루와 풀 프린지의 양감과 길이를 비교합니다." },
      { title: "03 · 리스크 확인", body: "가마, 곱슬, 습도와 아침 손질 시간을 미용실에서 재확인합니다." },
    ],
    proofTitle: "앞머리를 독립된 방향 축으로 다룹니다",
    uniqueProofLabel: "앞머리 축",
    uniqueProofValue: "open·side·full",
    trustTitle: "앞머리 합성만으로 모류와 유지 난이도를 알 수는 없습니다",
    trustDescription: "짧아진 길이와 뿌리 방향은 현장에서 확인해야 하는 되돌리기 어려운 조건입니다.",
    trustNote: { title: "명시적 fringe 축", body: "현재 방향 조정 계약은 앞머리를 open, side, full로 구분해 다른 길이 축과 별도로 다룹니다." },
    faq: [
      { question: "앞머리 없는 모습과 함께 비교할 수 있나요?", answer: "네. 이마를 연 대조 후보와 여러 앞머리 후보를 같은 보드에 둡니다." },
      { question: "시스루 앞머리와 풀뱅의 차이를 볼 수 있나요?", answer: "가벼운 프린지와 더 채운 프린지의 이마 노출과 양감 차이를 비교할 수 있습니다." },
      { question: "가마 때문에 앞머리가 뜨는지도 알 수 있나요?", answer: "이미지만으로 확정할 수 없습니다. 뿌리 방향은 미용실에서 확인해야 합니다." },
      { question: "결과가 마음에 들지 않으면 바로 되돌릴 수 있나요?", answer: "실제 커트는 되돌리기 어렵습니다. 그래서 없는 기준과 관리 조건까지 먼저 비교합니다." },
    ],
    manifestId: "SAMPLE-D-BANGS-CATALOG-V4",
    uniqueEvidenceId: "EVD-FRINGE-AXIS",
    relatedPageIds: ["D-FACE", "D-WOMEN", "D-BOB"],
  }),
  page({
    id: "D-BOB",
    slug: "bob-cut-preview",
    pageType: "style",
    audience: "b2c",
    title: "단발 미리보기, 보브컷 길이와 끝선 비교 | HairFit",
    description: "턱선 단발, 보브컷, 어깨선 미디엄과 길이 유지 후보를 같은 얼굴에서 비교해 자르기 전 기준을 정하세요.",
    eyebrow: "HAIRFIT DISCOVERY · 06",
    h1: "단발 미리보기, 턱선과 어깨선 사이를 구체적으로 비교",
    support: "단발이 어울릴지 묻기보다 끝선 위치, 앞머리, 층과 바깥선이 달라질 때의 인상과 관리 조건을 봅니다.",
    heroNote: "단발은 모발 수축과 목선, 현재 층에 따라 실제 완성 길이가 달라질 수 있습니다.",
    primaryLabel: "단발 컨설팅 시작",
    sampleLabel: "내 사진 분석부터 시작",
    finalLabel: "분석 후 단발 후보 비교",
    finalTitle: "단발 한 장 대신, 턱선 전후의 선택지를 비교하세요",
    finalSupport: "short·medium·long 길이 축으로 커트 폭과 유지 대안을 함께 확인합니다.",
    sample: {
      eyebrow: "BOB LENGTH BOARD",
      title: "턱선 보브, 어깨선, 길이 유지 대조 후보",
      description: "짧은 세 후보만 보여주지 않고 어깨선과 롱 대안을 함께 둬 커트 폭을 판단합니다.",
      heroLinkLabel: "단발 샘플 보기",
      heroCaption: "짧음·중간·유지 길이로 나눈 동일 인물 비교 보드",
      note: "끝선 위치는 목 길이, 곱슬과 건조 후 수축을 고려해 미용실에서 조정해야 합니다.",
    },
    artifact: {
      kind: "bob-cut-ladder",
      eyebrow: "CUT COMMITMENT LADDER",
      title: "한 번에 자를 길이를 네 단계로 낮춰보기",
      description: "가장 짧은 단발만 보지 않고, 변화 폭과 되돌림 비용이 커지는 순서로 선택지를 배열합니다.",
      items: [
        { label: "KEEP", value: "길이 유지", body: "얼굴선 레이어만 더해 커트 폭을 최소화합니다.", note: "변화 폭: 낮음" },
        { label: "COLLARBONE", value: "쇄골선", body: "묶임을 유지하면서 손상된 끝과 무게를 줄입니다.", note: "변화 폭: 낮음~중간" },
        { label: "SHOULDER", value: "어깨선", body: "미디엄 끝선과 바깥 뻗침 가능성을 함께 봅니다.", note: "변화 폭: 중간" },
        { label: "JAW", value: "턱선 보브", body: "목선을 드러내고 선명한 끝선을 만드는 가장 큰 커트 변화입니다.", note: "변화 폭: 높음 · 되돌림 오래 걸림" },
      ],
    },
    workflowTitle: "얼마나 자를지를 세 길이 구간으로 봅니다",
    workflowDescription: "단발 후보와 유지 대안을 같은 화면에 두어 커트 폭과 되돌림 비용을 판단합니다.",
    workflowSteps: [
      { title: "01 · 턱선 구간", body: "턱 위·아래 끝선과 앞머리 유무가 만드는 차이를 봅니다." },
      { title: "02 · 어깨선 대안", body: "한 번에 짧게 자르지 않는 미디엄 후보를 비교합니다." },
      { title: "03 · 유지 대조", body: "긴 길이를 유지했을 때의 레이어와 관리 차이도 함께 둡니다." },
    ],
    proofTitle: "커트 길이를 독립된 방향 축으로 다룹니다",
    uniqueProofLabel: "길이 축",
    uniqueProofValue: "short·medium·long",
    trustTitle: "미리보기의 끝선이 실제 커트 기준선은 아닙니다",
    trustDescription: "건조 수축, 현재 층과 모발 방향을 확인한 뒤 최종 길이를 정해야 합니다.",
    trustNote: { title: "명시적 length 축", body: "현재 방향 조정 계약은 길이를 short, medium, long으로 구분해 후보 수정에 사용합니다." },
    faq: [
      { question: "턱선 단발과 어깨선 길이를 같이 볼 수 있나요?", answer: "네. 짧은 보브와 미디엄, 길이 유지 후보를 한 화면에서 비교합니다." },
      { question: "단발이 어울리는지 확정해 주나요?", answer: "아닙니다. 여러 길이 후보를 비교하고 상담 질문을 만드는 도구입니다." },
      { question: "곱슬머리도 같은 길이로 나오나요?", answer: "건조 후 수축이 있어 실제 끝선은 달라질 수 있습니다. 현장에서 조정해야 합니다." },
      { question: "긴 머리를 유지하는 후보도 필요한가요?", answer: "네. 변화 폭을 판단하려면 길이를 유지하는 대조 후보가 도움이 됩니다." },
    ],
    manifestId: "SAMPLE-D-BOB-CATALOG-V4",
    uniqueEvidenceId: "EVD-LENGTH-AXIS",
    relatedPageIds: ["D-WOMEN", "D-FACE", "D-SALON"],
  }),
  page({
    id: "D-SALON",
    slug: "salon-consultation-image",
    pageType: "use-case",
    audience: "b2c",
    title: "미용실 상담 이미지, 후보와 요청사항 정리하기 | HairFit",
    description: "미용실에 보여줄 헤어 후보를 최대 3개로 좁히고 원하는 점, 피할 점과 현장 확인사항을 Salon Brief로 정리하세요.",
    eyebrow: "HAIRFIT DISCOVERY · 07",
    h1: "미용실 상담 이미지, 예쁜 사진보다 비교 이유까지 준비",
    support: "후보 한 장만 보여주지 않고 원하는 길이·앞머리·볼륨과 피하고 싶은 조건을 버전된 Salon Brief로 전달합니다.",
    heroNote: "Salon Brief는 대화를 돕는 자료이며 디자이너의 전문 판단이나 시술 결과를 대신하지 않습니다.",
    primaryLabel: "미용실 상담 준비 시작",
    sampleLabel: "내 사진 분석부터 시작",
    finalLabel: "분석 후 Salon Brief 준비",
    finalTitle: "후보 이미지와 선택 이유를 한 상담 자료로 묶으세요",
    finalSupport: "최대 세 후보와 피하고 싶은 조건, 현장 확인 질문을 정리해 대화를 준비합니다.",
    sample: {
      eyebrow: "SALON CONVERSATION BOARD",
      title: "길이·인상·관리 방향을 나눈 상담용 9가지",
      description: "후보를 고르는 단계부터 미용실에서 확인할 질문을 남길 수 있도록 세 방향으로 구성했습니다.",
      heroLinkLabel: "상담 보드 샘플 보기",
      heroCaption: "Salon Brief로 이어지는 방향별 후보 보드 예시",
      note: "이 자료는 상담 준비용이며 미용사 검토 완료, 예약 승인 또는 시술 가능성을 뜻하지 않습니다.",
    },
    artifact: {
      kind: "salon-brief",
      eyebrow: "SALON BRIEF ANATOMY",
      title: "미용실에 가져갈 것은 사진보다 네 가지 필드",
      description: "후보 이미지 옆에 선택 이유와 제약, 현장에서 확인할 질문을 붙여 오해를 줄입니다.",
      items: [
        { label: "SHORTLIST", value: "후보 2~3개", body: "한 장의 정답 대신 공통으로 원하는 끝선과 질감을 찾습니다.", note: "이미지별 좋은 점 표시" },
        { label: "WANT", value: "원하는 요소", body: "길이, 앞머리, 볼륨과 질감 중 유지할 요소를 구체적으로 씁니다.", note: "예: 턱 아래 끝선 유지" },
        { label: "AVOID", value: "피할 조건", body: "너무 짧은 앞머리, 높은 볼륨처럼 원하지 않는 결과를 기록합니다.", note: "금지 조건은 명시적으로" },
        { label: "CHECK", value: "현장 질문", body: "손상도, 수축과 가능한 시술을 디자이너에게 확인할 항목으로 남깁니다.", note: "전문 판단은 현장에서" },
      ],
    },
    workflowTitle: "사진 전달을 선택 이유와 확인 질문으로 확장합니다",
    workflowDescription: "후보의 좋은 점만 적지 않고 피할 조건과 현장 판단이 필요한 부분을 함께 남깁니다.",
    workflowSteps: [
      { title: "01 · 후보 좁히기", body: "아홉 후보에서 최대 세 개를 선택하고 공통점을 찾습니다." },
      { title: "02 · 이유와 제약", body: "원하는 점, 피하고 싶은 길이와 관리 조건을 기록합니다." },
      { title: "03 · 현장 확인", body: "모질, 손상도와 시술 가능성을 디자이너와 다시 확인합니다." },
    ],
    proofTitle: "상담 자료는 선택과 수정 이력을 연결합니다",
    uniqueProofLabel: "Salon Brief",
    uniqueProofValue: "버전 저장",
    trustTitle: "상담 보드는 전문가 검토나 시술 승인이 아닙니다",
    trustDescription: "현장에서는 모발 상태와 가능한 시술을 전문가와 다시 확인해야 합니다.",
    trustNote: { title: "버전된 전달 자료", body: "Salon Brief 화면은 상담 요청과 제약 조건을 수정할 때 새 버전으로 저장합니다." },
    faq: [
      { question: "미용실에 이미지 한 장만 보여주면 되나요?", answer: "한 장보다 2~3개 후보의 공통점과 피할 조건을 함께 전달하면 대화 기준이 더 선명해집니다." },
      { question: "Salon Brief가 시술을 승인하나요?", answer: "아닙니다. 상담 준비 자료이며 전문 판단과 시술 가능 여부는 미용실에서 확인합니다." },
      { question: "요청사항을 나중에 바꿀 수 있나요?", answer: "현재 화면 계약은 수정된 요청과 제약 조건을 새 버전으로 저장합니다." },
      { question: "실제 결과도 후보 이미지와 같나요?", answer: "보장하지 않습니다. 모질, 손상도, 시술 방식과 손질 환경에 따라 달라집니다." },
    ],
    manifestId: "SAMPLE-D-SALON-CATALOG-V4",
    uniqueEvidenceId: "EVD-SALON-BRIEF-VERSION",
    relatedPageIds: ["D-AI-SIM", "D-MEN", "D-BOB"],
  }),
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
  return discoveryPages.find((candidate) => candidate.id === id);
}

export function getDiscoveryPageBySlug(slug: string) {
  return discoveryPages.find((candidate) => candidate.slug === slug);
}

export function getPublishedDiscoveryPages() {
  return discoveryPages.filter((candidate) => candidate.status === "published");
}

export function getRelatedDiscoveryPages(definition: DiscoveryPageDefinition) {
  const relatedIds = new Set(definition.relatedPageIds);
  return getPublishedDiscoveryPages().filter((candidate) => relatedIds.has(candidate.id));
}
