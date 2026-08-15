import type {
  DiscoverySampleAsset,
  DiscoverySampleManifest,
  DiscoveryStrategyId,
} from "./types.ts";

interface PreviewSeed {
  number: string;
  bytes: number;
  catalogStyleSlug: string;
  catalogNameKo: string;
}

interface ContinuitySet {
  source: {
    path: `/${string}`;
    width: number;
    height: number;
    bytes: number;
  };
  previews: readonly PreviewSeed[];
  previewPath: (number: string) => `/${string}`;
  previewWidth: number;
  previewHeight: number;
  personId: string;
  licenseRef: string;
  consentRef: string;
  provenanceRef: string;
}

interface ManifestConfig {
  id: string;
  prefix: string;
  set: ContinuitySet;
  sourceAlt: string;
  og: {
    path: `/${string}`;
    width: number;
    height: number;
    bytes: number;
    alt: string;
    personId: string;
    licenseRef: string;
  };
  strategies: readonly {
    id: DiscoveryStrategyId;
    label: string;
    description: string;
    numbers: readonly [string, string, string];
  }[];
}

const aiSimulationSet = discoveryContinuitySet({
  slug: "ai-hairstyle-simulation",
  source: { width: 543, height: 724, bytes: 30240 },
  personId: "synthetic-discovery-ai-model-03",
  previews: [
    catalogPreview("01", 12006, "female-short-soft-pixie-wavy-curly-untreated", "여성 소프트 픽시 · 곱슬 웨이브 일반 모발"),
    catalogPreview("02", 13532, "female-short-tassel-bob-wavy-curly-bleached", "여성 태슬 보브 · 곱슬 웨이브 탈색 모발"),
    catalogPreview("03", 12954, "female-short-short-hush-tight-curly-frizzy-damaged", "여성 숏 허쉬 · 강한 곱슬 손상 모발"),
    catalogPreview("04", 12568, "female-medium-medium-layer-straight-untreated", "여성 미디엄 레이어 · 직모 일반 모발"),
    catalogPreview("05", 17584, "female-medium-c-curl-tight-curly-frizzy-untreated", "여성 C컬 미디엄 · 강한 곱슬 일반 모발"),
    catalogPreview("06", 15680, "female-medium-wolf-layer-wavy-curly-bleached", "여성 울프 레이어 · 곱슬 웨이브 탈색 모발"),
    catalogPreview("07", 15314, "female-long-long-layer-straight-untreated", "여성 롱 레이어 · 직모 일반 모발"),
    catalogPreview("08", 19256, "female-long-butterfly-long-wavy-curly-bleached", "여성 버터플라이 롱 · 곱슬 웨이브 탈색 모발"),
    catalogPreview("09", 25758, "female-long-s-wave-long-tight-curly-frizzy-untreated", "여성 S웨이브 롱 · 강한 곱슬 일반 모발"),
  ],
});

const faceShapeSet = discoveryContinuitySet({
  slug: "face-shape-hairstyle",
  source: { width: 543, height: 724, bytes: 59188 },
  personId: "synthetic-discovery-face-model-05",
  previews: [
    catalogPreview("01", 15288, "female-short-rounded-bob-tight-curly-frizzy-untreated", "여성 라운드 보브 · 강한 곱슬 일반 모발"),
    catalogPreview("02", 11874, "female-short-soft-pixie-wavy-curly-untreated", "여성 소프트 픽시 · 곱슬 웨이브 일반 모발"),
    catalogPreview("03", 11618, "female-short-airy-crop-straight-untreated", "여성 에어리 크롭 · 직모 일반 모발"),
    catalogPreview("04", 17486, "female-medium-c-curl-tight-curly-frizzy-untreated", "여성 C컬 미디엄 · 강한 곱슬 일반 모발"),
    catalogPreview("05", 14700, "female-medium-medium-hush-wavy-curly-untreated", "여성 미디엄 허쉬 · 곱슬 웨이브 일반 모발"),
    catalogPreview("06", 14074, "female-medium-medium-layer-straight-untreated", "여성 미디엄 레이어 · 직모 일반 모발"),
    catalogPreview("07", 20336, "female-long-face-frame-long-tight-curly-frizzy-colored", "여성 페이스 프레임 롱 · 강한 곱슬 염색 모발"),
    catalogPreview("08", 16356, "female-long-curtain-long-wavy-curly-untreated", "여성 커튼 롱 · 곱슬 웨이브 일반 모발"),
    catalogPreview("09", 15000, "female-long-long-layer-straight-untreated", "여성 롱 레이어 · 직모 일반 모발"),
  ],
});

const menSet = discoveryContinuitySet({
  slug: "men-hairstyle",
  source: { width: 1024, height: 1536, bytes: 163770 },
  personId: "synthetic-discovery-men-model-v3",
  previews: [
    catalogPreview("01", 12992, "male-short-textured-crop-wavy-curly-untreated", "남성 텍스처드 크롭 · 곱슬 웨이브 일반 모발"),
    catalogPreview("02", 13374, "male-short-comma-crop-tight-curly-frizzy-untreated", "남성 콤마 크롭 · 강한 곱슬 일반 모발"),
    catalogPreview("03", 11160, "male-short-ivy-lift-straight-untreated", "남성 아이비 리프트 · 직모 일반 모발"),
    catalogPreview("04", 14040, "male-medium-airy-dandy-straight-untreated", "남성 에어리 댄디 · 직모 일반 모발"),
    catalogPreview("05", 14604, "male-medium-leaf-flow-wavy-curly-untreated", "남성 리프 플로우 · 곱슬 웨이브 일반 모발"),
    catalogPreview("06", 15176, "male-medium-comma-medium-tight-curly-frizzy-untreated", "남성 콤마 미디엄 · 강한 곱슬 일반 모발"),
    catalogPreview("07", 14326, "male-long-long-layer-straight-untreated", "남성 롱 레이어 · 직모 일반 모발"),
    catalogPreview("08", 17020, "male-long-curtain-long-wavy-curly-untreated", "남성 커튼 롱 · 곱슬 웨이브 일반 모발"),
    catalogPreview("09", 17176, "male-long-grace-wave-wavy-curly-untreated", "남성 그레이스 웨이브 · 곱슬 웨이브 일반 모발"),
  ],
});

const womenSet = discoveryContinuitySet({
  slug: "women-hairstyle",
  source: { width: 512, height: 768, bytes: 30708 },
  personId: "synthetic-discovery-women-model-07",
  previews: [
    catalogPreview("01", 12978, "female-short-french-bob-straight-damaged", "여성 프렌치 보브 · 직모 손상 모발"),
    catalogPreview("02", 15472, "female-short-choppy-bob-wavy-curly-bleached", "여성 처피 보브 · 곱슬 웨이브 탈색 모발"),
    catalogPreview("03", 16460, "female-short-cocoon-bob-tight-curly-frizzy-colored", "여성 코쿤 보브 · 강한 곱슬 염색 모발"),
    catalogPreview("04", 14846, "female-medium-clavicle-bob-wavy-curly-damaged", "여성 쇄골 보브 · 곱슬 웨이브 손상 모발"),
    catalogPreview("05", 16790, "female-medium-butterfly-medium-tight-curly-frizzy-bleached", "여성 버터플라이 미디엄 · 강한 곱슬 탈색 모발"),
    catalogPreview("06", 14712, "female-medium-textured-lob-wavy-curly-untreated", "여성 텍스처드 로브 · 곱슬 웨이브 일반 모발"),
    catalogPreview("07", 16314, "female-long-cloud-wave-straight-untreated", "여성 클라우드 웨이브 · 직모 일반 모발"),
    catalogPreview("08", 18232, "female-long-grace-wave-wavy-curly-untreated", "여성 그레이스 웨이브 · 곱슬 웨이브 일반 모발"),
    catalogPreview("09", 17538, "female-long-feather-long-wavy-curly-untreated", "여성 페더 롱 · 곱슬 웨이브 일반 모발"),
  ],
});

const bangsSet = discoveryContinuitySet({
  slug: "bangs-hairstyle",
  source: { width: 768, height: 1024, bytes: 37488 },
  personId: "synthetic-discovery-bangs-model-09",
  previews: [
    catalogPreview("01", 9590, "female-short-side-part-crop-straight-colored", "여성 사이드 파트 크롭 · 직모 염색 모발"),
    catalogPreview("02", 11214, "female-short-soft-pixie-wavy-curly-untreated", "여성 소프트 픽시 · 곱슬 웨이브 일반 모발"),
    catalogPreview("03", 13046, "female-short-rounded-bob-tight-curly-frizzy-untreated", "여성 라운드 보브 · 강한 곱슬 일반 모발"),
    catalogPreview("04", 11222, "female-medium-curtain-medium-straight-colored", "여성 커튼 미디엄 · 직모 염색 모발"),
    catalogPreview("05", 13790, "female-medium-medium-hush-wavy-curly-untreated", "여성 미디엄 허쉬 · 곱슬 웨이브 일반 모발"),
    catalogPreview("06", 12128, "female-medium-c-curl-tight-curly-frizzy-untreated", "여성 C컬 미디엄 · 강한 곱슬 일반 모발"),
    catalogPreview("07", 11488, "female-long-center-flow-long-straight-bleached", "여성 센터 플로우 롱 · 직모 탈색 모발"),
    catalogPreview("08", 14418, "female-long-curtain-long-wavy-curly-untreated", "여성 커튼 롱 · 곱슬 웨이브 일반 모발"),
    catalogPreview("09", 15168, "female-long-s-wave-long-tight-curly-frizzy-untreated", "여성 S웨이브 롱 · 강한 곱슬 일반 모발"),
  ],
});

const bobSet = discoveryContinuitySet({
  slug: "bob-hairstyle",
  source: { width: 768, height: 1024, bytes: 42152 },
  personId: "synthetic-discovery-bob-model-11",
  previews: [
    catalogPreview("01", 13004, "female-short-french-bob-straight-damaged", "여성 프렌치 보브 · 직모 손상 모발"),
    catalogPreview("02", 15810, "female-short-tassel-bob-wavy-curly-bleached", "여성 태슬 보브 · 곱슬 웨이브 탈색 모발"),
    catalogPreview("03", 17820, "female-short-rounded-bob-tight-curly-frizzy-untreated", "여성 라운드 보브 · 강한 곱슬 일반 모발"),
    catalogPreview("04", 14540, "female-medium-s-curl-lob-straight-damaged", "여성 S컬 로브 · 직모 손상 모발"),
    catalogPreview("05", 17414, "female-medium-clavicle-bob-wavy-curly-damaged", "여성 쇄골 보브 · 곱슬 웨이브 손상 모발"),
    catalogPreview("06", 19260, "female-medium-volume-bob-tight-curly-frizzy-colored", "여성 볼륨 보브 · 강한 곱슬 염색 모발"),
    catalogPreview("07", 24640, "female-long-blunt-long-tight-curly-frizzy-colored", "여성 블런트 롱 · 강한 곱슬 염색 모발"),
    catalogPreview("08", 24520, "female-long-face-frame-long-tight-curly-frizzy-colored", "여성 페이스 프레임 롱 · 강한 곱슬 염색 모발"),
    catalogPreview("09", 21004, "female-long-curtain-long-wavy-curly-untreated", "여성 커튼 롱 · 곱슬 웨이브 일반 모발"),
  ],
});

const salonSet = discoveryContinuitySet({
  slug: "salon-consultation",
  source: { width: 768, height: 1024, bytes: 41286 },
  personId: "synthetic-discovery-salon-model-13",
  previews: [
    catalogPreview("01", 14376, "female-short-french-bob-straight-damaged", "여성 프렌치 보브 · 직모 손상 모발"),
    catalogPreview("02", 16250, "female-short-bixie-layer-wavy-curly-damaged", "여성 빅시 레이어 · 곱슬 웨이브 손상 모발"),
    catalogPreview("03", 19998, "female-short-rounded-bob-tight-curly-frizzy-untreated", "여성 라운드 보브 · 강한 곱슬 일반 모발"),
    catalogPreview("04", 16042, "female-medium-s-curl-lob-straight-damaged", "여성 S컬 로브 · 직모 손상 모발"),
    catalogPreview("05", 17716, "female-medium-clavicle-bob-wavy-curly-damaged", "여성 쇄골 보브 · 곱슬 웨이브 손상 모발"),
    catalogPreview("06", 21218, "female-medium-c-curl-tight-curly-frizzy-untreated", "여성 C컬 미디엄 · 강한 곱슬 일반 모발"),
    catalogPreview("07", 14854, "female-long-jelly-long-straight-damaged", "여성 젤리 롱 · 직모 손상 모발"),
    catalogPreview("08", 17204, "female-long-volume-layer-long-wavy-curly-damaged", "여성 볼륨 레이어 롱 · 곱슬 웨이브 손상 모발"),
    catalogPreview("09", 20734, "female-long-s-wave-long-tight-curly-frizzy-untreated", "여성 S웨이브 롱 · 강한 곱슬 일반 모발"),
  ],
});

function catalogPreview(
  number: string,
  bytes: number,
  catalogStyleSlug: string,
  catalogNameKo: string,
): PreviewSeed {
  return { number, bytes, catalogStyleSlug, catalogNameKo };
}

function discoveryContinuitySet(config: {
  slug: string;
  source: Omit<ContinuitySet["source"], "path">;
  personId: string;
  previews: readonly PreviewSeed[];
}): ContinuitySet {
  return {
    source: {
      path: `/discovery/models/${config.slug}/source.webp`,
      ...config.source,
    },
    previews: config.previews,
    previewPath: (number) => `/discovery/models/${config.slug}/preview-${number}.webp`,
    previewWidth: 418,
    previewHeight: 418,
    personId: config.personId,
    licenseRef: "internal-generated-content:discovery-catalog-v4-2026-08-15",
    consentRef: "synthetic-model:no-user-upload",
    provenanceRef: "docs/search-benchmark/evidence/page-specific-catalog-models-2026-08-15.md",
  };
}

const previewBoardOg = {
  path: "/landing/editorial/faq-preview-board-v2.webp" as const,
  width: 1536,
  height: 1024,
  bytes: 108168,
  alt: "태블릿에서 아홉 가지 AI 헤어 후보를 비교하는 HairFit 예시",
  personId: "synthetic-editorial-preview-board-v2",
  licenseRef: "internal-generated-content:landing-editorial-v2",
};

export const discoverySampleManifests = [
  createManifest({
    id: "SAMPLE-D-AI-SIM-CATALOG-V4",
    prefix: "sample-ai-sim",
    set: aiSimulationSet,
    sourceAlt: "AI 헤어 후보 비교에 사용하는 여성 원본 모델 예시",
    og: previewBoardOg,
    strategies: standardStrategies("얼굴선과 길이의 균형", "원하는 인상", "손질 시간과 일상 활용"),
  }),
  createManifest({
    id: "SAMPLE-D-FACE-CATALOG-V4",
    prefix: "sample-face",
    set: faceShapeSet,
    sourceAlt: "얼굴선과 헤어 실루엣 관계를 비교하는 여성 기준 모델",
    og: {
      path: "/landing/editorial/criteria-face-shape-landmark-system.webp",
      width: 1536,
      height: 1024,
      bytes: 79516,
      alt: "얼굴형을 단정하지 않고 관찰 근거를 표시하는 HairFit 랜드마크 예시",
      personId: "synthetic-editorial-face-landmark-v2",
      licenseRef: "internal-generated-content:landing-editorial-v2",
    },
    strategies: [
      { id: "BALANCE", label: "JAWLINE", description: "카탈로그의 턱선 보정 초점 후보를 길이별로 비교합니다.", numbers: ["01", "04", "07"] },
      { id: "IMAGE", label: "TEMPLE", description: "관자 보정 초점과 부드러운 프린지 후보를 비교합니다.", numbers: ["02", "05", "08"] },
      { id: "LIFESTYLE", label: "CROWN", description: "정수리 보정 초점과 직선 질감 후보를 비교합니다.", numbers: ["03", "06", "09"] },
    ],
  }),
  createManifest({
    id: "SAMPLE-D-MEN-CATALOG-V4",
    prefix: "sample-men",
    set: menSet,
    sourceAlt: "남자 헤어 길이와 가르마를 비교하는 남성 원본 모델 예시",
    og: { ...previewBoardOg, alt: "남자 헤어 후보 아홉 가지를 비교하는 HairFit 예시", personId: "synthetic-editorial-men-preview-v2" },
    strategies: standardStrategies("짧은 길이와 윤곽 균형", "가르마와 앞머리 인상", "중간 길이와 손질 난이도"),
  }),
  createManifest({
    id: "SAMPLE-D-WOMEN-CATALOG-V4",
    prefix: "sample-women",
    set: womenSet,
    sourceAlt: "여자 헤어 길이와 앞머리를 비교하는 여성 원본 모델 예시",
    og: { ...previewBoardOg, alt: "여자 헤어 후보 아홉 가지를 비교하는 HairFit 예시", personId: "synthetic-editorial-women-preview-v2" },
    strategies: standardStrategies("단발과 얼굴선 균형", "미디엄 길이와 인상", "롱 헤어 질감과 관리"),
  }),
  createManifest({
    id: "SAMPLE-D-BANGS-CATALOG-V4",
    prefix: "sample-bangs",
    set: bangsSet,
    sourceAlt: "앞머리 유무와 형태를 비교하는 여성 원본 모델 예시",
    og: {
      path: "/landing/editorial/feature-face-line.webp",
      width: 1536,
      height: 1024,
      bytes: 88814,
      alt: "거울 앞에서 앞머리와 얼굴선을 확인하는 HairFit 예시",
      personId: "synthetic-editorial-face-line-v2",
      licenseRef: "internal-generated-content:landing-editorial-v2",
    },
    strategies: [
      { id: "BALANCE", label: "NO FIXED BANGS", description: "카탈로그의 앞머리 고정 없음 후보를 길이별로 비교합니다.", numbers: ["01", "04", "07"] },
      { id: "IMAGE", label: "SOFT FRINGE", description: "카탈로그의 부드러운 프린지 후보를 길이별로 비교합니다.", numbers: ["02", "05", "08"] },
      { id: "LIFESTYLE", label: "CURTAIN FRINGE", description: "카탈로그의 커튼 프린지 후보와 컬 강도를 비교합니다.", numbers: ["03", "06", "09"] },
    ],
  }),
  createManifest({
    id: "SAMPLE-D-BOB-CATALOG-V4",
    prefix: "sample-bob",
    set: bobSet,
    sourceAlt: "단발과 보브컷 전환을 비교하는 여성 원본 모델 예시",
    og: { ...previewBoardOg, alt: "단발과 보브컷 후보를 비교하는 HairFit 보드 예시", personId: "synthetic-editorial-bob-preview-v2" },
    strategies: [
      { id: "BALANCE", label: "JAW LINE", description: "턱선에 닿는 세 가지 짧은 실루엣을 비교합니다.", numbers: ["01", "02", "03"] },
      { id: "IMAGE", label: "SHOULDER LINE", description: "어깨선 전후의 길이와 끝선 움직임을 확인합니다.", numbers: ["04", "05", "06"] },
      { id: "LIFESTYLE", label: "KEEP LENGTH", description: "길이를 유지하는 대조 후보와 관리 차이를 함께 봅니다.", numbers: ["07", "08", "09"] },
    ],
  }),
  createManifest({
    id: "SAMPLE-D-SALON-CATALOG-V4",
    prefix: "sample-salon",
    set: salonSet,
    sourceAlt: "미용실 상담 보드에 사용할 여성 원본 모델 예시",
    og: {
      path: "/landing/editorial/faq-salon-use-v2.webp",
      width: 1536,
      height: 1024,
      bytes: 131526,
      alt: "태블릿의 헤어 후보 보드를 보며 미용실 상담을 준비하는 예시",
      personId: "synthetic-editorial-salon-use-v2",
      licenseRef: "internal-generated-content:landing-editorial-v2",
    },
    strategies: [
      { id: "BALANCE", label: "LOW CARE", description: "카탈로그의 낮은 관리 난이도 후보를 길이별로 비교합니다.", numbers: ["01", "04", "07"] },
      { id: "IMAGE", label: "MEDIUM CARE", description: "중간 관리 난이도의 레이어와 웨이브 후보를 비교합니다.", numbers: ["02", "05", "08"] },
      { id: "LIFESTYLE", label: "HIGH CARE", description: "높은 관리 난이도의 컬 후보와 시술 부담을 확인합니다.", numbers: ["03", "06", "09"] },
    ],
  }),
] satisfies readonly DiscoverySampleManifest[];

function standardStrategies(balance: string, image: string, lifestyle: string): ManifestConfig["strategies"] {
  return [
    { id: "BALANCE", label: "BALANCE", description: `${balance}을 먼저 비교합니다.`, numbers: ["01", "02", "03"] },
    { id: "IMAGE", label: "IMAGE", description: `${image}을 조정합니다.`, numbers: ["04", "05", "06"] },
    { id: "LIFESTYLE", label: "LIFESTYLE", description: `${lifestyle}까지 고려합니다.`, numbers: ["07", "08", "09"] },
  ];
}

function createManifest(config: ManifestConfig): DiscoverySampleManifest {
  const sourceAssetId = `${config.prefix}-source`;
  const ogAssetId = `${config.prefix}-og`;
  const previewAssets = config.set.previews.map((preview): DiscoverySampleAsset => ({
    id: `${config.prefix}-preview-${preview.number}`,
    path: config.set.previewPath(preview.number),
    role: "preview",
    width: config.set.previewWidth,
    height: config.set.previewHeight,
    bytes: preview.bytes,
    alt: `동일한 기준 모델의 HairFit 카탈로그 ${preview.catalogNameKo} 후보`,
    crop: config.set.previewWidth === config.set.previewHeight ? "square" : "portrait",
    status: "approved",
    personId: config.set.personId,
    licenseRef: config.set.licenseRef,
    consentRef: config.set.consentRef,
    catalogStyleSlug: preview.catalogStyleSlug,
    catalogNameKo: preview.catalogNameKo,
    catalogVersion: "catalog-v4",
  }));

  return {
    id: config.id,
    status: "approved",
    sourceAssetId,
    ogAssetId,
    reviewedAt: "2026-08-15",
    owner: "HairFit product design",
    provenanceRef: config.set.provenanceRef,
    assets: [
      {
        id: sourceAssetId,
        path: config.set.source.path,
        role: "source",
        width: config.set.source.width,
        height: config.set.source.height,
        bytes: config.set.source.bytes,
        alt: config.sourceAlt,
        crop: "portrait",
        status: "approved",
        personId: config.set.personId,
        licenseRef: config.set.licenseRef,
        consentRef: config.set.consentRef,
      },
      ...previewAssets,
      {
        id: ogAssetId,
        path: config.og.path,
        role: "og",
        width: config.og.width,
        height: config.og.height,
        bytes: config.og.bytes,
        alt: config.og.alt,
        crop: "landscape",
        status: "approved",
        personId: config.og.personId,
        licenseRef: config.og.licenseRef,
        consentRef: "synthetic-model:no-user-upload",
      },
    ],
    strategies: config.strategies.map((strategy) => ({
      id: strategy.id,
      label: strategy.label,
      description: strategy.description,
      assetIds: strategy.numbers.map((number) => `${config.prefix}-preview-${number}`) as [string, string, string],
    })),
  };
}

export function getDiscoverySampleManifest(id: string) {
  return discoverySampleManifests.find((manifest) => manifest.id === id);
}

export function getDiscoverySampleAsset(manifest: DiscoverySampleManifest, assetId: string) {
  return manifest.assets.find((asset) => asset.id === assetId);
}
