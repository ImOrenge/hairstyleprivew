import type {
  DiscoverySampleAsset,
  DiscoverySampleManifest,
  DiscoveryStrategyId,
} from "./types.ts";

type PreviewSeed = readonly [number: string, bytes: number, description: string];

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

const femaleV2: ContinuitySet = {
  source: { path: "/hero/demo/grid/female-01.webp", width: 640, height: 800, bytes: 37740 },
  previews: [
    ["01", 12506, "턱선이 또렷하게 보이는 짧은 C컬 보브"],
    ["02", 12152, "가벼운 앞머리를 더한 짧은 보브"],
    ["03", 13314, "층과 움직임을 강조한 짧은 레이어"],
    ["04", 12372, "얼굴선을 감싸는 중간 길이 C컬"],
    ["05", 14694, "차분한 볼륨의 중간 길이 레이어"],
    ["06", 13476, "가벼운 앞머리와 중간 길이 레이어"],
    ["07", 15034, "자연스러운 웨이브의 긴 레이어"],
    ["08", 18198, "질감과 볼륨을 강조한 긴 웨이브"],
    ["09", 14728, "윤곽을 길게 연결하는 차분한 롱 헤어"],
  ],
  previewPath: (number) => `/hero/demo/grid/female-v2-${number}.webp`,
  previewWidth: 418,
  previewHeight: 418,
  personId: "synthetic-female-continuity-v2",
  licenseRef: "internal-generated-content:landing-continuity-v2",
  consentRef: "synthetic-model:no-user-upload",
  provenanceRef: "docs/landing-page-editorial-image-prompts.md#continuity-set-v2",
};

const femaleClassic: ContinuitySet = {
  source: { path: "/hero/demo/female-original.webp", width: 1024, height: 1536, bytes: 139978 },
  previews: [
    ["01", 37740, "이마를 열고 턱선을 정리한 블런트 보브"],
    ["02", 39920, "가벼운 시스루 앞머리와 짧은 보브"],
    ["03", 48998, "얇은 앞머리와 목선을 잇는 샤기 레이어"],
    ["04", 35530, "이마를 열고 바깥선을 살린 미디엄 C컬"],
    ["05", 40808, "긴 페이스라인 레이어와 자연스러운 가르마"],
    ["06", 52930, "가벼운 앞머리와 긴 레이어"],
    ["07", 48688, "이마를 열고 흐르는 롱 웨이브"],
    ["08", 79162, "짧은 컬 프린지와 풍성한 롱 컬"],
    ["09", 39942, "이마를 열고 직선 실루엣을 살린 롱 헤어"],
  ],
  previewPath: (number) => `/hero/demo/grid/female-${number}.webp`,
  previewWidth: 640,
  previewHeight: 800,
  personId: "synthetic-female-continuity-v1",
  licenseRef: "internal-generated-content:landing-demo-v1",
  consentRef: "synthetic-model:no-user-upload",
  provenanceRef: "docs/landing-page-redesign-run.md#demo-continuity-assets",
};

const maleV2: ContinuitySet = {
  source: { path: "/hero/demo/male-original.webp", width: 1024, height: 1536, bytes: 163770 },
  previews: [
    ["01", 13618, "짧은 텍스처와 앞머리를 살린 크롭"],
    ["02", 13286, "가벼운 센터 파트의 짧은 헤어"],
    ["03", 12046, "이마를 열고 선을 정리한 사이드 파트"],
    ["04", 13176, "부드러운 가르마와 낮은 옆 볼륨"],
    ["05", 13528, "귀선을 덮는 중간 길이 센터 파트"],
    ["06", 14468, "짧은 컬과 자연스러운 앞머리"],
    ["07", 15228, "목선을 잇는 긴 센터 파트"],
    ["08", 15632, "중간 길이 텍스처와 가벼운 컬"],
    ["09", 13432, "부드러운 웨이브의 중간 길이 헤어"],
  ],
  previewPath: (number) => `/hero/demo/grid/male-v2-${number}.webp`,
  previewWidth: 418,
  previewHeight: 418,
  personId: "synthetic-male-continuity-v2",
  licenseRef: "internal-generated-content:landing-continuity-v2",
  consentRef: "synthetic-model:no-user-upload",
  provenanceRef: "docs/landing-page-editorial-image-prompts.md#continuity-set-v2",
};

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
    id: "SAMPLE-D-AI-SIM-FEMALE-V2",
    prefix: "sample-ai-sim",
    set: femaleV2,
    sourceAlt: "AI 헤어 후보 비교에 사용하는 여성 원본 모델 예시",
    og: previewBoardOg,
    strategies: standardStrategies("얼굴선과 길이의 균형", "원하는 인상", "손질 시간과 일상 활용"),
  }),
  createManifest({
    id: "SAMPLE-D-FACE-FEMALE-V2",
    prefix: "sample-face",
    set: femaleV2,
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
      { id: "BALANCE", label: "FACE LINE", description: "턱선 주변의 길이와 옆 볼륨을 비교합니다.", numbers: ["01", "04", "07"] },
      { id: "IMAGE", label: "FOREHEAD / PART", description: "앞머리와 가르마가 이마 노출에 주는 차이를 봅니다.", numbers: ["02", "05", "08"] },
      { id: "LIFESTYLE", label: "TEXTURE", description: "레이어와 컬의 강도를 손질 조건과 함께 비교합니다.", numbers: ["03", "06", "09"] },
    ],
  }),
  createManifest({
    id: "SAMPLE-D-MEN-MALE-V2",
    prefix: "sample-men",
    set: maleV2,
    sourceAlt: "남자 헤어 길이와 가르마를 비교하는 남성 원본 모델 예시",
    og: { ...previewBoardOg, alt: "남자 헤어 후보 아홉 가지를 비교하는 HairFit 예시", personId: "synthetic-editorial-men-preview-v2" },
    strategies: standardStrategies("짧은 길이와 윤곽 균형", "가르마와 앞머리 인상", "중간 길이와 손질 난이도"),
  }),
  createManifest({
    id: "SAMPLE-D-WOMEN-FEMALE-CLASSIC",
    prefix: "sample-women",
    set: femaleClassic,
    sourceAlt: "여자 헤어 길이와 앞머리를 비교하는 여성 원본 모델 예시",
    og: { ...previewBoardOg, alt: "여자 헤어 후보 아홉 가지를 비교하는 HairFit 예시", personId: "synthetic-editorial-women-preview-v2" },
    strategies: standardStrategies("단발과 얼굴선 균형", "미디엄 길이와 인상", "롱 헤어 질감과 관리"),
  }),
  createManifest({
    id: "SAMPLE-D-BANGS-FEMALE-CLASSIC",
    prefix: "sample-bangs",
    set: femaleClassic,
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
      { id: "BALANCE", label: "OPEN FOREHEAD", description: "앞머리 없이 이마를 여는 기준 후보를 비교합니다.", numbers: ["01", "04", "09"] },
      { id: "IMAGE", label: "SOFT FRINGE", description: "시스루와 가벼운 앞머리가 인상에 주는 차이를 봅니다.", numbers: ["02", "03", "06"] },
      { id: "LIFESTYLE", label: "TEXTURE / CARE", description: "길이와 컬이 다른 후보로 손질 부담까지 확인합니다.", numbers: ["05", "07", "08"] },
    ],
  }),
  createManifest({
    id: "SAMPLE-D-BOB-FEMALE-CLASSIC",
    prefix: "sample-bob",
    set: femaleClassic,
    sourceAlt: "단발과 보브컷 전환을 비교하는 여성 원본 모델 예시",
    og: { ...previewBoardOg, alt: "단발과 보브컷 후보를 비교하는 HairFit 보드 예시", personId: "synthetic-editorial-bob-preview-v2" },
    strategies: [
      { id: "BALANCE", label: "JAW LINE", description: "턱선에 닿는 세 가지 짧은 실루엣을 비교합니다.", numbers: ["01", "02", "03"] },
      { id: "IMAGE", label: "SHOULDER LINE", description: "어깨선 전후의 길이와 끝선 움직임을 확인합니다.", numbers: ["04", "05", "06"] },
      { id: "LIFESTYLE", label: "KEEP LENGTH", description: "길이를 유지하는 대조 후보와 관리 차이를 함께 봅니다.", numbers: ["07", "08", "09"] },
    ],
  }),
  createManifest({
    id: "SAMPLE-D-SALON-FEMALE-V2",
    prefix: "sample-salon",
    set: femaleV2,
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
      { id: "BALANCE", label: "CUT DIRECTION", description: "짧음·중간·긴 길이를 한 줄에서 비교합니다.", numbers: ["01", "04", "07"] },
      { id: "IMAGE", label: "IMAGE DIRECTION", description: "앞머리와 볼륨이 만드는 인상 차이를 정리합니다.", numbers: ["02", "05", "08"] },
      { id: "LIFESTYLE", label: "CARE DIRECTION", description: "레이어와 질감을 관리 조건과 함께 전달합니다.", numbers: ["03", "06", "09"] },
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
  const previewAssets = config.set.previews.map(([number, bytes, description]): DiscoverySampleAsset => ({
    id: `${config.prefix}-preview-${number}`,
    path: config.set.previewPath(number),
    role: "preview",
    width: config.set.previewWidth,
    height: config.set.previewHeight,
    bytes,
    alt: `동일한 기준 모델의 ${description} AI 헤어 후보`,
    crop: config.set.previewWidth === config.set.previewHeight ? "square" : "portrait",
    status: "approved",
    personId: config.set.personId,
    licenseRef: config.set.licenseRef,
    consentRef: config.set.consentRef,
  }));

  return {
    id: config.id,
    status: "approved",
    sourceAssetId,
    ogAssetId,
    reviewedAt: "2026-08-14",
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
