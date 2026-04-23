import type {
  HairstyleCatalogRow,
  RecommendationCorrectionFocus,
  RecommendationLengthBucket,
} from "./recommendation-types";

export interface HairstyleCatalogBlueprint {
  slug: string;
  nameKo: string;
  description: string;
  lengthBucket: RecommendationLengthBucket;
  correctionFocus: RecommendationCorrectionFocus;
  silhouette: string;
  texture: string;
  bangType: string;
  volumeFocusTags: string[];
  faceShapeFitTags: string[];
  avoidTags: string[];
  promptTemplate: string;
  negativePrompt: string;
  promptTemplateVersion: string;
  trendKeywords: string[];
  baselineTrendScore: number;
  baselineFreshnessScore: number;
}

export interface BlueprintTrendSignal {
  slug: string;
  signalCount: number;
  trendScore: number;
  freshnessScore: number;
}

const DEFAULT_NEGATIVE_PROMPT = [
  "low quality",
  "blurry",
  "deformed face",
  "bad anatomy",
  "watermark",
  "text",
  "different person",
  "face swap",
  "changed identity",
  "changed ethnicity",
  "changed skin tone",
  "changed face shape",
  "age change",
  "gender swap",
  "hat",
  "glasses change",
  "side profile",
  "three-quarter view",
  "head tilt",
  "looking away",
].join(", ");

export function buildKoreanWeeklyStyleQueries(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();

  return [
    `${year} 헤어 트렌드`,
    `${year} 헤어스타일 트렌드`,
    `${year} 단발 트렌드`,
    `${year} 레이어드컷 트렌드`,
    `${year} 허쉬컷 트렌드`,
    `${year} 태슬컷 트렌드`,
    `${year} 리프컷 트렌드`,
    `${year} 숏컷 트렌드`,
    `${year} 시스루뱅 트렌드`,
    `${year} 남자 헤어 트렌드`,
    `${year} 여자 헤어 트렌드`,
  ];
}

export const KOREAN_HAIRSTYLE_BLUEPRINTS: HairstyleCatalogBlueprint[] = [
  {
    slug: "airy-short-crop-lift",
    nameKo: "에어리 숏 크롭 리프트",
    description: "짧은 기장에 정수리 볼륨을 올려 상부 비율을 가볍게 정리하는 숏 크롭 스타일.",
    lengthBucket: "short",
    correctionFocus: "crown",
    silhouette: "compact crop",
    texture: "airy texture",
    bangType: "soft fringe",
    volumeFocusTags: ["crown", "top-volume"],
    faceShapeFitTags: ["round", "oval", "short-face"],
    avoidTags: ["very-long-face", "heavy-forehead-cover"],
    promptTemplate:
      "soft airy short crop, lifted crown volume, clean side taper, light texture on top, natural black or deep brown hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["에어리 숏컷", "숏 크롭", "크롭컷", "crop cut", "short crop"],
    baselineTrendScore: 54,
    baselineFreshnessScore: 50,
  },
  {
    slug: "soft-pixie-temple-balance",
    nameKo: "소프트 픽시 템플 밸런스",
    description: "관자 부근의 폭을 부드럽게 보완해 측면 밸런스를 정리하는 픽시 계열 스타일.",
    lengthBucket: "short",
    correctionFocus: "temple",
    silhouette: "soft pixie",
    texture: "wispy texture",
    bangType: "piecey fringe",
    volumeFocusTags: ["temple", "side-balance"],
    faceShapeFitTags: ["heart", "diamond", "oval"],
    avoidTags: ["wide-cheekbone-emphasis"],
    promptTemplate:
      "soft pixie silhouette, gentle fullness around the temple, wispy texture near the cheekbone, clean neckline, natural hair color",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["픽시컷", "픽시", "pixie cut", "short pixie"],
    baselineTrendScore: 50,
    baselineFreshnessScore: 47,
  },
  {
    slug: "rounded-jawline-bob-frame",
    nameKo: "라운드 조라인 보브 프레임",
    description: "턱선을 감싸는 라운드 보브 실루엣으로 하부 라인을 부드럽게 정리하는 단발.",
    lengthBucket: "short",
    correctionFocus: "jawline",
    silhouette: "rounded bob",
    texture: "smooth inward texture",
    bangType: "no bangs",
    volumeFocusTags: ["jawline", "lower-contour"],
    faceShapeFitTags: ["long", "diamond", "angular"],
    avoidTags: ["very-round-lower-face"],
    promptTemplate:
      "rounded ear-length bob, face-framing line around the jaw, soft inward ends, controlled side volume, natural hair color",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["라운드 보브", "보브컷", "bob cut", "턱선 보브", "귀밑 단발"],
    baselineTrendScore: 56,
    baselineFreshnessScore: 51,
  },
  {
    slug: "layered-volume-flow",
    nameKo: "레이어드 볼륨 플로우",
    description: "정수리와 후두부 흐름을 살려 전체 밸런스를 정리하는 미디엄 레이어드 컷.",
    lengthBucket: "medium",
    correctionFocus: "crown",
    silhouette: "medium layered",
    texture: "soft movement",
    bangType: "open forehead",
    volumeFocusTags: ["crown", "back-balance"],
    faceShapeFitTags: ["oval", "round", "square"],
    avoidTags: ["flat-top"],
    promptTemplate:
      "medium layered cut, lifted top volume, soft movement through the crown, light face-framing pieces, natural hair color",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["레이어드컷", "레이어드 컷", "layered cut", "레이어드 펌"],
    baselineTrendScore: 63,
    baselineFreshnessScore: 60,
  },
  {
    slug: "see-through-hush-balance",
    nameKo: "시스루 허쉬 밸런스",
    description: "관자와 광대를 부드럽게 연결하는 허쉬컷에 시스루뱅을 더한 한국형 미디엄 스타일.",
    lengthBucket: "medium",
    correctionFocus: "temple",
    silhouette: "hush cut",
    texture: "feathered layers",
    bangType: "see-through bangs",
    volumeFocusTags: ["temple", "soft-side-volume"],
    faceShapeFitTags: ["long", "oval", "heart"],
    avoidTags: ["very-short-forehead"],
    promptTemplate:
      "korean hush cut, soft see-through bangs, balanced fullness near the temple, gentle layered ends, natural hair color",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["허쉬컷", "허쉬 펌", "hush cut", "시스루뱅"],
    baselineTrendScore: 67,
    baselineFreshnessScore: 62,
  },
  {
    slug: "medium-c-curl-contour",
    nameKo: "미디엄 C컬 컨투어",
    description: "턱선 안쪽으로 말리는 C컬을 써서 하부 윤곽을 단정하게 정리하는 미디엄 컷.",
    lengthBucket: "medium",
    correctionFocus: "jawline",
    silhouette: "contour medium",
    texture: "c-curl",
    bangType: "side part",
    volumeFocusTags: ["jawline", "lower-contour"],
    faceShapeFitTags: ["square", "diamond", "long"],
    avoidTags: ["very-short-neck"],
    promptTemplate:
      "medium C-curl cut, inward curl at the jawline, clean contour around the lower face, smooth top section, natural hair color",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["c컬", "c컬펌", "c-curl", "바디펌"],
    baselineTrendScore: 58,
    baselineFreshnessScore: 54,
  },
  {
    slug: "long-soft-lift-layer",
    nameKo: "롱 소프트 리프트 레이어",
    description: "긴 기장을 유지하면서 상부 볼륨을 살려 전체 비율을 가볍게 만드는 롱 레이어드.",
    lengthBucket: "long",
    correctionFocus: "crown",
    silhouette: "long soft layer",
    texture: "soft lift",
    bangType: "open forehead",
    volumeFocusTags: ["crown", "soft-top-volume"],
    faceShapeFitTags: ["oval", "round", "heart"],
    avoidTags: ["heavy-flat-top"],
    promptTemplate:
      "long soft layers, subtle crown lift, controlled top volume, long flowing ends, natural hair color",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["롱 레이어드", "long layer", "long layered cut", "롱레이어드"],
    baselineTrendScore: 60,
    baselineFreshnessScore: 56,
  },
  {
    slug: "long-curtain-flow",
    nameKo: "롱 커튼 플로우",
    description: "커튼뱅과 롱 레이어를 결합해 측면 폭과 얼굴선을 자연스럽게 분산시키는 스타일.",
    lengthBucket: "long",
    correctionFocus: "temple",
    silhouette: "long curtain layer",
    texture: "flowing curtain",
    bangType: "curtain bangs",
    volumeFocusTags: ["temple", "side-softness"],
    faceShapeFitTags: ["long", "diamond", "heart"],
    avoidTags: ["very-round-cheek-emphasis"],
    promptTemplate:
      "long curtain layers, gentle width near the temple, face-framing curtain pieces, clean long silhouette, natural hair color",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["커튼뱅", "커튼 레이어드", "curtain bangs", "curtain layer"],
    baselineTrendScore: 61,
    baselineFreshnessScore: 58,
  },
  {
    slug: "long-s-curl-frame",
    nameKo: "롱 S컬 프레임",
    description: "하부 윤곽을 따라 흐르는 S컬 웨이브로 긴 얼굴선과 각을 부드럽게 정리하는 스타일.",
    lengthBucket: "long",
    correctionFocus: "jawline",
    silhouette: "long s-curl",
    texture: "polished wave",
    bangType: "no bangs",
    volumeFocusTags: ["jawline", "lower-frame"],
    faceShapeFitTags: ["square", "long", "angular"],
    avoidTags: ["very-round-short-face"],
    promptTemplate:
      "long S-curl flow, soft curve around the jawline, balanced lower silhouette, polished top section, natural hair color",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["s컬", "s컬펌", "s-curl", "웨이브 레이어드"],
    baselineTrendScore: 55,
    baselineFreshnessScore: 52,
  },
  {
    slug: "tassel-bob-sharp-line",
    nameKo: "태슬 보브 샤프 라인",
    description: "직선적인 원랭스 라인으로 턱선과 목선을 또렷하게 정리하는 태슬 보브.",
    lengthBucket: "medium",
    correctionFocus: "jawline",
    silhouette: "tassel bob",
    texture: "sleek straight",
    bangType: "side part",
    volumeFocusTags: ["jawline", "line-definition"],
    faceShapeFitTags: ["oval", "heart", "diamond"],
    avoidTags: ["very-square-jaw-emphasis"],
    promptTemplate:
      "tassel bob, clean one-length line, sleek straight texture, crisp jawline framing, natural deep brown hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["태슬컷", "태슬 보브", "tassel cut", "칼단발"],
    baselineTrendScore: 64,
    baselineFreshnessScore: 61,
  },
  {
    slug: "leaf-cut-back-flow",
    nameKo: "리프컷 백 플로우",
    description: "뒤로 흐르는 리프 실루엣으로 관자와 정수리 균형을 같이 잡는 미디엄 스타일.",
    lengthBucket: "medium",
    correctionFocus: "temple",
    silhouette: "leaf cut",
    texture: "back flow",
    bangType: "center part",
    volumeFocusTags: ["temple", "crown"],
    faceShapeFitTags: ["round", "oval", "heart"],
    avoidTags: ["flat-side"],
    promptTemplate:
      "leaf cut with semi-long layers flowing back, clean center part, balanced side volume, soft polished texture, natural hair color",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["리프컷", "리프 펌", "leaf cut", "leaf perm"],
    baselineTrendScore: 66,
    baselineFreshnessScore: 63,
  },
  {
    slug: "guile-cut-side-volume",
    nameKo: "가일컷 사이드 볼륨",
    description: "사이드 파트와 상부 볼륨으로 전체 두상 비율을 정리하는 남성형 가일컷.",
    lengthBucket: "short",
    correctionFocus: "crown",
    silhouette: "guile cut",
    texture: "polished side part",
    bangType: "side fringe",
    volumeFocusTags: ["crown", "top-volume"],
    faceShapeFitTags: ["round", "square", "oval"],
    avoidTags: ["very-long-face"],
    promptTemplate:
      "guile cut with clean side-part volume, lifted top shape, polished side control, natural black hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["가일컷", "가일 펌", "guile cut", "side part crop"],
    baselineTrendScore: 62,
    baselineFreshnessScore: 58,
  },
];

function clampScore(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function buildCatalogRowsForCycle(
  cycleId: string,
  nowIso: string,
  trendSignals: Map<string, BlueprintTrendSignal>,
): Omit<HairstyleCatalogRow, "id">[] {
  return KOREAN_HAIRSTYLE_BLUEPRINTS.map((item) => {
    const signal = trendSignals.get(item.slug);

    return {
      slug: item.slug,
      nameKo: item.nameKo,
      description: item.description,
      market: "kr",
      lengthBucket: item.lengthBucket,
      silhouette: item.silhouette,
      texture: item.texture,
      bangType: item.bangType,
      volumeFocusTags: item.volumeFocusTags,
      faceShapeFitTags: item.faceShapeFitTags,
      avoidTags: item.avoidTags,
      trendScore: clampScore(signal?.trendScore ?? item.baselineTrendScore, 25, 99),
      freshnessScore: clampScore(signal?.freshnessScore ?? item.baselineFreshnessScore, 20, 99),
      promptTemplate: item.promptTemplate,
      negativePrompt: item.negativePrompt,
      promptTemplateVersion: item.promptTemplateVersion,
      status: "active",
      sourceCycleId: cycleId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  });
}
