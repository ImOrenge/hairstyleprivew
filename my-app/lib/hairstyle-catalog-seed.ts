import type {
  HairConditionTag,
  HairStrandThickness,
  HairTextureProfile,
  HairstyleCatalogRow,
  HairstyleMaintenanceLevel,
  HairstyleRequiredService,
  MemberStyleTarget,
  RecommendationCorrectionFocus,
  RecommendationLengthBucket,
} from "./recommendation-types";
import femaleLongBlueprints from "../data/hairstyle-blueprints/v4/female-long.json";
import femaleMediumBlueprints from "../data/hairstyle-blueprints/v4/female-medium.json";
import femaleShortBlueprints from "../data/hairstyle-blueprints/v4/female-short.json";
import maleLongBlueprints from "../data/hairstyle-blueprints/v4/male-long.json";
import maleMediumBlueprints from "../data/hairstyle-blueprints/v4/male-medium.json";
import maleShortBlueprints from "../data/hairstyle-blueprints/v4/male-short.json";

export const HAIRSTYLE_CATALOG_PROMPT_TEMPLATE_VERSION = "catalog-v4";

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
  styleTargets?: MemberStyleTarget[];
  trendKeywords: string[];
  baselineTrendScore: number;
  baselineFreshnessScore: number;
  styleFamily?: string;
  variantKey?: string;
  primaryTexture?: HairTextureProfile;
  compatibleTextureTags?: HairTextureProfile[];
  avoidTextureTags?: HairTextureProfile[];
  primaryStrandThickness?: HairStrandThickness;
  compatibleStrandThicknessTags?: HairStrandThickness[];
  avoidStrandThicknessTags?: HairStrandThickness[];
  primaryCondition?: Exclude<HairConditionTag, "permed" | "severely_damaged">;
  compatibleConditionTags?: HairConditionTag[];
  avoidConditionTags?: HairConditionTag[];
  requiredServices?: HairstyleRequiredService[];
  serviceConstraints?: string[];
  maintenanceLevel?: HairstyleMaintenanceLevel;
  introducedIn?: "legacy-32" | "expansion-a" | "expansion-b" | "expansion-c";
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

const FEMALE_ONLY_SLUGS = new Set([
  "soft-pixie-temple-balance",
  "rounded-jawline-bob-frame",
  "see-through-hush-balance",
  "medium-c-curl-contour",
  "long-soft-lift-layer",
  "long-curtain-flow",
  "long-s-curl-frame",
  "tassel-bob-sharp-line",
  "butterfly-layer-air-bang",
  "short-hush-wolf-balance",
  "sleek-low-layer-contour",
  "bonnie-perm-soft-volume",
  "choppy-bob-texture",
  "long-jelly-perm-flow",
]);

const MALE_ONLY_SLUGS = new Set([
  "leaf-cut-back-flow",
  "guile-cut-side-volume",
  "two-block-soft-volume",
  "comma-hair-temple-balance",
  "down-perm-clean-crop",
  "ivy-league-crown-lift",
  "dandy-cut-side-balance",
  "wolf-layer-mullet-flow",
  "semi-leaf-shadow-perm",
  "textured-crop-down-bang",
  "middle-part-volume-perm",
  "short-regent-clean-lift",
  "soft-mohican-crown-line",
  "natural-swell-dandy-flow",
]);

function resolveStyleTargets(slug: string): MemberStyleTarget[] {
  if (FEMALE_ONLY_SLUGS.has(slug)) {
    return ["female"];
  }

  if (MALE_ONLY_SLUGS.has(slug)) {
    return ["male"];
  }

  return ["male", "female"];
}

export interface KoreanWeeklyStyleQuery {
  id: string;
  query: string;
  styleTarget: MemberStyleTarget | null;
  lengthBucket: RecommendationLengthBucket | null;
  textureFacet: HairTextureProfile | null;
  strandThicknessFacet: HairStrandThickness | null;
  conditionFacet: Exclude<HairConditionTag, "untreated" | "permed" | "severely_damaged"> | null;
}

export function buildLegacyKoreanWeeklyStyleQueryRegistry(referenceDate = new Date()): KoreanWeeklyStyleQuery[] {
  const year = referenceDate.getFullYear();
  const queries = [
    `${year} 헤어 트렌드`, `${year} 헤어스타일 트렌드`, `${year} 단발 트렌드`,
    `${year} 레이어드컷 트렌드`, `${year} 허쉬컷 트렌드`, `${year} 태슬컷 트렌드`,
    `${year} 리프컷 트렌드`, `${year} 숏컷 트렌드`, `${year} 시스루뱅 트렌드`,
    `${year} 남자 헤어 트렌드`, `${year} 여자 헤어 트렌드`,
  ];
  return queries.map((query, index) => ({
    id: `legacy-${index + 1}`,
    query,
    styleTarget: null,
    lengthBucket: null,
    textureFacet: null,
    strandThicknessFacet: null,
    conditionFacet: null,
  }));
}

export function buildKoreanWeeklyStyleQueryRegistry(referenceDate = new Date()): KoreanWeeklyStyleQuery[] {
  const year = referenceDate.getFullYear();
  const targets = [
    ["female", "여자"],
    ["male", "남자"],
  ] as const;
  const lengths = [
    ["short", "짧은 머리"],
    ["medium", "중간 머리"],
    ["long", "긴 머리"],
  ] as const;
  const textures = [
    ["straight", "직모"],
    ["wavy_curly", "곱슬 웨이브"],
    ["tight_curly_frizzy", "강한 곱슬 악성곱슬"],
  ] as const;
  const thicknesses = [
    ["fine", "가는 모발"],
    ["medium", "보통 굵기 모발"],
    ["coarse", "굵은 모발"],
  ] as const;
  const conditions = [
    ["damaged", "손상모"],
    ["bleached", "탈색모"],
    ["colored", "염색모"],
  ] as const;
  const registry: KoreanWeeklyStyleQuery[] = [];

  for (const [styleTarget, targetKo] of targets) {
    for (const [lengthBucket, lengthKo] of lengths) {
      registry.push({
        id: `general-${styleTarget}-${lengthBucket}`,
        query: `${year} ${targetKo} ${lengthKo} 헤어스타일 트렌드`,
        styleTarget,
        lengthBucket,
        textureFacet: null,
        strandThicknessFacet: null,
        conditionFacet: null,
      });
      for (const [textureFacet, textureKo] of textures) {
        registry.push({
          id: `texture-${styleTarget}-${lengthBucket}-${textureFacet}`,
          query: `${year} ${targetKo} ${lengthKo} ${textureKo} 헤어스타일`,
          styleTarget,
          lengthBucket,
          textureFacet,
          strandThicknessFacet: null,
          conditionFacet: null,
        });
      }
      for (const [strandThicknessFacet, thicknessKo] of thicknesses) {
        registry.push({
          id: `thickness-${styleTarget}-${lengthBucket}-${strandThicknessFacet}`,
          query: `${year} ${targetKo} ${lengthKo} ${thicknessKo} 헤어스타일`,
          styleTarget,
          lengthBucket,
          textureFacet: null,
          strandThicknessFacet,
          conditionFacet: null,
        });
      }
      for (const [conditionFacet, conditionKo] of conditions) {
        registry.push({
          id: `condition-${styleTarget}-${lengthBucket}-${conditionFacet}`,
          query: `${year} ${targetKo} ${lengthKo} ${conditionKo} 헤어스타일`,
          styleTarget,
          lengthBucket,
          textureFacet: null,
          strandThicknessFacet: null,
          conditionFacet,
        });
      }
    }
  }

  return registry;
}

export function buildKoreanWeeklyStyleQueries(referenceDate = new Date()) {
  const structuredRssEnabled = process.env.HAIRSTYLE_RSS_FACETS_V2_ENABLED?.trim().toLowerCase() === "true";
  const registry = structuredRssEnabled
    ? buildKoreanWeeklyStyleQueryRegistry(referenceDate)
    : buildLegacyKoreanWeeklyStyleQueryRegistry(referenceDate);
  return registry.map((item) => item.query);
}

const LEGACY_KOREAN_HAIRSTYLE_BLUEPRINTS: HairstyleCatalogBlueprint[] = [
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
  {
    slug: "two-block-soft-volume",
    nameKo: "투블럭 소프트 볼륨",
    description: "옆머리는 단정하게 정리하고 상단 볼륨을 살려 두상 균형을 만드는 남성형 투블럭.",
    lengthBucket: "short",
    correctionFocus: "crown",
    silhouette: "two block",
    texture: "soft volume",
    bangType: "natural fringe",
    volumeFocusTags: ["crown", "top-volume"],
    faceShapeFitTags: ["round", "oval", "square"],
    avoidTags: ["flat-top", "wide-side"],
    promptTemplate:
      "men's two-block haircut, clean side control, soft lifted top volume, natural fringe, natural black hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["투블럭", "남자 투블럭", "two block cut", "two-block"],
    baselineTrendScore: 65,
    baselineFreshnessScore: 61,
  },
  {
    slug: "comma-hair-temple-balance",
    nameKo: "쉼표머리 템플 밸런스",
    description: "앞머리 곡선과 관자 부근 볼륨으로 얼굴 상단 인상을 부드럽게 보정하는 남성형 스타일.",
    lengthBucket: "medium",
    correctionFocus: "temple",
    silhouette: "comma hair",
    texture: "soft curve",
    bangType: "comma fringe",
    volumeFocusTags: ["temple", "side-balance"],
    faceShapeFitTags: ["long", "oval", "heart"],
    avoidTags: ["heavy-forehead-cover"],
    promptTemplate:
      "men's comma hair, curved fringe with temple balance, soft side volume, clean natural texture, natural dark brown hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["쉼표머리", "남자 쉼표머리", "comma hair", "comma fringe"],
    baselineTrendScore: 64,
    baselineFreshnessScore: 60,
  },
  {
    slug: "down-perm-clean-crop",
    nameKo: "다운펌 클린 크롭",
    description: "뜨는 옆머리를 눌러 깔끔한 실루엣을 만들고 정수리 볼륨만 남기는 남성형 크롭.",
    lengthBucket: "short",
    correctionFocus: "crown",
    silhouette: "clean crop",
    texture: "down perm",
    bangType: "short fringe",
    volumeFocusTags: ["crown", "side-control"],
    faceShapeFitTags: ["round", "square", "oval"],
    avoidTags: ["very-long-face"],
    promptTemplate:
      "men's clean crop with down perm, controlled sides, short neat fringe, lifted crown volume, natural black hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["다운펌", "남자 다운펌", "clean crop", "crop cut"],
    baselineTrendScore: 66,
    baselineFreshnessScore: 62,
  },
  {
    slug: "ivy-league-crown-lift",
    nameKo: "아이비리그 크라운 리프트",
    description: "짧고 단정한 라인에 정수리 리프트를 더해 세련된 인상을 만드는 남성형 아이비리그 컷.",
    lengthBucket: "short",
    correctionFocus: "crown",
    silhouette: "ivy league",
    texture: "clean texture",
    bangType: "short side part",
    volumeFocusTags: ["crown", "top-volume"],
    faceShapeFitTags: ["oval", "round", "square"],
    avoidTags: ["flat-top"],
    promptTemplate:
      "men's ivy league haircut, short clean side part, lifted crown, refined natural texture, natural black hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["아이비리그컷", "남자 아이비리그", "ivy league cut"],
    baselineTrendScore: 61,
    baselineFreshnessScore: 57,
  },
  {
    slug: "dandy-cut-side-balance",
    nameKo: "댄디컷 사이드 밸런스",
    description: "앞머리와 옆머리 흐름을 단정하게 맞춰 부드러운 인상을 주는 남성형 댄디컷.",
    lengthBucket: "medium",
    correctionFocus: "temple",
    silhouette: "dandy cut",
    texture: "smooth flow",
    bangType: "soft fringe",
    volumeFocusTags: ["temple", "side-softness"],
    faceShapeFitTags: ["long", "oval", "diamond"],
    avoidTags: ["wide-cheekbone-emphasis"],
    promptTemplate:
      "men's dandy cut, soft fringe, balanced side flow near the temples, smooth natural texture, natural dark hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["댄디컷", "남자 댄디컷", "dandy cut"],
    baselineTrendScore: 63,
    baselineFreshnessScore: 59,
  },
  {
    slug: "wolf-layer-mullet-flow",
    nameKo: "울프 레이어 뒷흐름",
    description: "뒷머리 레이어와 상단 볼륨으로 긴 얼굴형과 두상 흐름을 보정하는 남성형 울프 레이어.",
    lengthBucket: "long",
    correctionFocus: "jawline",
    silhouette: "wolf layer",
    texture: "layered flow",
    bangType: "center fringe",
    volumeFocusTags: ["jawline", "back-balance"],
    faceShapeFitTags: ["long", "oval", "angular"],
    avoidTags: ["very-round-short-face"],
    promptTemplate:
      "men's wolf layer mullet, layered back flow, soft center fringe, controlled jawline balance, natural black hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["울프컷", "남자 울프컷", "wolf cut", "mullet layer"],
    baselineTrendScore: 58,
    baselineFreshnessScore: 55,
  },
  {
    slug: "butterfly-layer-air-bang",
    nameKo: "버터플라이 레이어 에어뱅",
    description: "얼굴 주변의 큰 레이어 흐름과 가벼운 뱅으로 상부와 측면 볼륨을 동시에 보정하는 여성형 롱 레이어.",
    lengthBucket: "long",
    correctionFocus: "temple",
    silhouette: "butterfly layer",
    texture: "airy layered wave",
    bangType: "air bangs",
    volumeFocusTags: ["temple", "side-softness", "crown"],
    faceShapeFitTags: ["long", "oval", "heart"],
    avoidTags: ["very-short-forehead"],
    promptTemplate:
      "long butterfly layers, airy Korean bangs, soft volume around the temples, flowing face-framing pieces, natural brown hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["버터플라이컷", "버터플라이 레이어", "에어뱅", "butterfly cut"],
    baselineTrendScore: 66,
    baselineFreshnessScore: 63,
  },
  {
    slug: "short-hush-wolf-balance",
    nameKo: "쇼트 허쉬 울프 밸런스",
    description: "짧은 허쉬 레이어와 울프 라인으로 정수리와 턱선 흐름을 가볍게 정리하는 여성형 숏 스타일.",
    lengthBucket: "short",
    correctionFocus: "jawline",
    silhouette: "short hush wolf",
    texture: "piecey layers",
    bangType: "textured fringe",
    volumeFocusTags: ["jawline", "crown", "back-balance"],
    faceShapeFitTags: ["oval", "diamond", "angular"],
    avoidTags: ["very-round-short-face"],
    promptTemplate:
      "short hush wolf cut, piecey layered fringe, light crown lift, soft jawline movement, natural dark hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["쇼트 허쉬컷", "숏 허쉬", "울프컷 여자", "short wolf cut"],
    baselineTrendScore: 58,
    baselineFreshnessScore: 56,
  },
  {
    slug: "sleek-low-layer-contour",
    nameKo: "슬릭 로우 레이어 컨투어",
    description: "낮은 층과 매끈한 결로 하부 윤곽을 정돈하는 차분한 여성형 미디엄 레이어.",
    lengthBucket: "medium",
    correctionFocus: "jawline",
    silhouette: "low layered medium",
    texture: "sleek smooth",
    bangType: "no bangs",
    volumeFocusTags: ["jawline", "lower-contour"],
    faceShapeFitTags: ["square", "diamond", "long"],
    avoidTags: ["flat-top"],
    promptTemplate:
      "sleek medium low layers, smooth contour around the jawline, minimal volume, polished natural black hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["로우 레이어", "슬릭 레이어", "미디엄 레이어", "low layer cut"],
    baselineTrendScore: 57,
    baselineFreshnessScore: 55,
  },
  {
    slug: "bonnie-perm-soft-volume",
    nameKo: "보니펌 소프트 볼륨",
    description: "부드러운 웨이브와 측면 볼륨으로 얼굴 폭을 자연스럽게 분산시키는 여성형 미디엄 펌.",
    lengthBucket: "medium",
    correctionFocus: "temple",
    silhouette: "bonnie perm",
    texture: "soft wave",
    bangType: "see-through bangs",
    volumeFocusTags: ["temple", "side-volume"],
    faceShapeFitTags: ["round", "heart", "oval"],
    avoidTags: ["heavy-curl-volume"],
    promptTemplate:
      "Korean bonnie perm, soft medium waves, see-through bangs, gentle side volume, natural warm brown hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["보니펌", "미디엄 펌", "물결펌", "soft wave perm"],
    baselineTrendScore: 60,
    baselineFreshnessScore: 58,
  },
  {
    slug: "choppy-bob-texture",
    nameKo: "초피 보브 텍스처",
    description: "가벼운 질감의 보브 라인으로 짧은 기장에서도 정수리와 턱선의 답답함을 줄이는 여성형 단발.",
    lengthBucket: "short",
    correctionFocus: "crown",
    silhouette: "choppy bob",
    texture: "light choppy texture",
    bangType: "soft side bangs",
    volumeFocusTags: ["crown", "line-definition"],
    faceShapeFitTags: ["oval", "heart", "square"],
    avoidTags: ["very-long-face"],
    promptTemplate:
      "short choppy bob, light textured ends, soft side bangs, lifted crown, natural dark brown hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["초피컷", "초피 보브", "질감 단발", "choppy bob"],
    baselineTrendScore: 55,
    baselineFreshnessScore: 54,
  },
  {
    slug: "long-jelly-perm-flow",
    nameKo: "롱 젤리펌 플로우",
    description: "탱글한 굵은 웨이브로 긴 기장의 하부 흐름과 윤곽을 부드럽게 만드는 여성형 롱 펌.",
    lengthBucket: "long",
    correctionFocus: "jawline",
    silhouette: "long jelly perm",
    texture: "bouncy wave",
    bangType: "curtain bangs",
    volumeFocusTags: ["jawline", "lower-frame"],
    faceShapeFitTags: ["long", "square", "oval"],
    avoidTags: ["wide-cheekbone-emphasis"],
    promptTemplate:
      "long Korean jelly perm, bouncy large waves, curtain bangs, soft lower-face framing, natural glossy brown hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["젤리펌", "롱펌", "굵은 웨이브", "jelly perm"],
    baselineTrendScore: 59,
    baselineFreshnessScore: 57,
  },
  {
    slug: "semi-leaf-shadow-perm",
    nameKo: "세미 리프 쉐도우펌",
    description: "세미 리프 흐름에 쉐도우펌 질감을 더해 관자와 상부 볼륨을 부드럽게 보정하는 남성형 롱 미디엄.",
    lengthBucket: "long",
    correctionFocus: "temple",
    silhouette: "semi leaf perm",
    texture: "shadow perm",
    bangType: "center part",
    volumeFocusTags: ["temple", "crown", "side-softness"],
    faceShapeFitTags: ["long", "oval", "heart"],
    avoidTags: ["flat-side"],
    promptTemplate:
      "men's long semi leaf cut with shadow perm, soft center part, balanced temple volume, natural black hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["세미리프컷", "쉐도우펌", "남자 리프펌", "semi leaf cut"],
    baselineTrendScore: 67,
    baselineFreshnessScore: 64,
  },
  {
    slug: "textured-crop-down-bang",
    nameKo: "텍스처드 크롭 다운뱅",
    description: "짧은 앞머리와 질감 있는 상단으로 정수리 볼륨은 살리고 옆선은 깔끔히 잡는 남성형 숏 컷.",
    lengthBucket: "short",
    correctionFocus: "crown",
    silhouette: "textured crop",
    texture: "matte texture",
    bangType: "down bangs",
    volumeFocusTags: ["crown", "side-control"],
    faceShapeFitTags: ["round", "square", "oval"],
    avoidTags: ["very-long-face"],
    promptTemplate:
      "men's textured crop, short down bangs, matte top texture, clean controlled sides, natural black hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["텍스처드 크롭", "다운뱅", "남자 크롭컷", "textured crop"],
    baselineTrendScore: 62,
    baselineFreshnessScore: 59,
  },
  {
    slug: "middle-part-volume-perm",
    nameKo: "미들파트 볼륨펌",
    description: "가르마 중심의 볼륨펌으로 이마 노출과 관자 밸런스를 정리하는 남성형 미디엄 스타일.",
    lengthBucket: "medium",
    correctionFocus: "temple",
    silhouette: "middle part perm",
    texture: "soft volume perm",
    bangType: "middle part",
    volumeFocusTags: ["temple", "top-volume"],
    faceShapeFitTags: ["long", "diamond", "oval"],
    avoidTags: ["heavy-forehead-cover"],
    promptTemplate:
      "men's middle part volume perm, soft lifted front, balanced temple width, natural dark brown hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["가르마펌", "미들파트", "남자 볼륨펌", "middle part perm"],
    baselineTrendScore: 65,
    baselineFreshnessScore: 62,
  },
  {
    slug: "short-regent-clean-lift",
    nameKo: "쇼트 리젠트 클린 리프트",
    description: "앞머리를 올려 상부 비율을 시원하게 만들고 옆선을 정돈하는 남성형 리젠트 컷.",
    lengthBucket: "short",
    correctionFocus: "crown",
    silhouette: "short regent",
    texture: "clean lift",
    bangType: "up fringe",
    volumeFocusTags: ["crown", "top-volume"],
    faceShapeFitTags: ["round", "oval", "square"],
    avoidTags: ["high-forehead-emphasis"],
    promptTemplate:
      "men's short regent cut, clean lifted fringe, controlled sides, refined crown volume, natural black hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["리젠트컷", "남자 리젠트", "올림머리", "regent cut"],
    baselineTrendScore: 56,
    baselineFreshnessScore: 53,
  },
  {
    slug: "soft-mohican-crown-line",
    nameKo: "소프트 모히칸 크라운 라인",
    description: "과하지 않은 모히칸 실루엣으로 정수리 라인을 세워 짧은 기장에서도 입체감을 주는 남성형 컷.",
    lengthBucket: "short",
    correctionFocus: "crown",
    silhouette: "soft mohican",
    texture: "structured texture",
    bangType: "short fringe",
    volumeFocusTags: ["crown", "line-definition"],
    faceShapeFitTags: ["round", "square", "oval"],
    avoidTags: ["very-narrow-face"],
    promptTemplate:
      "men's soft mohican haircut, subtle crown line, structured short texture, clean side taper, natural black hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["소프트 모히칸", "모히칸컷", "남자 숏컷", "soft mohican"],
    baselineTrendScore: 53,
    baselineFreshnessScore: 51,
  },
  {
    slug: "natural-swell-dandy-flow",
    nameKo: "내추럴 스웰 댄디 플로우",
    description: "자연스러운 스웰 볼륨과 긴 댄디 흐름으로 부드러운 인상을 만드는 남성형 롱 미디엄.",
    lengthBucket: "long",
    correctionFocus: "temple",
    silhouette: "swell dandy",
    texture: "natural swell",
    bangType: "soft fringe",
    volumeFocusTags: ["temple", "side-softness"],
    faceShapeFitTags: ["long", "oval", "heart"],
    avoidTags: ["flat-top"],
    promptTemplate:
      "men's long natural swell dandy cut, soft fringe flow, gentle side volume, clean natural texture, dark brown hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["스웰컷", "스웰펌", "댄디펌", "natural dandy cut"],
    baselineTrendScore: 60,
    baselineFreshnessScore: 58,
  },
  {
    slug: "modern-shag-air-layer",
    nameKo: "모던 샤기 에어 레이어",
    description: "성별 구분 없이 쓰기 좋은 가벼운 샤기 레이어로 정수리와 측면 흐름을 동시에 살리는 공용 스타일.",
    lengthBucket: "medium",
    correctionFocus: "crown",
    silhouette: "modern shag layer",
    texture: "airy shag texture",
    bangType: "soft fringe",
    volumeFocusTags: ["crown", "temple", "soft-side-volume"],
    faceShapeFitTags: ["oval", "round", "heart"],
    avoidTags: ["heavy-flat-top"],
    promptTemplate:
      "modern airy shag layers, soft fringe, balanced crown and side volume, natural dark hair, Korean salon finish",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["샤기컷", "샤기 레이어", "공용 헤어", "modern shag"],
    baselineTrendScore: 57,
    baselineFreshnessScore: 55,
  },
  {
    slug: "clean-long-layer-neutral",
    nameKo: "클린 롱 레이어 뉴트럴",
    description: "긴 레이어 흐름을 깔끔하게 정리해 남녀 모두 긴 기장에서 사용할 수 있는 공용 롱 스타일.",
    lengthBucket: "long",
    correctionFocus: "jawline",
    silhouette: "clean long layer",
    texture: "natural flow",
    bangType: "open forehead",
    volumeFocusTags: ["jawline", "crown"],
    faceShapeFitTags: ["long", "oval", "square"],
    avoidTags: ["very-round-short-face"],
    promptTemplate:
      "clean long layered hair, natural flowing ends, subtle crown lift, open forehead, natural black or brown hair",
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    promptTemplateVersion: "catalog-v2",
    trendKeywords: ["롱 레이어", "뉴트럴 헤어", "긴머리 레이어", "clean long layer"],
    baselineTrendScore: 54,
    baselineFreshnessScore: 52,
  },
];

const EXPANSION_BLUEPRINTS_WITHOUT_NEGATIVE_PROMPT = [
  ...femaleShortBlueprints,
  ...femaleMediumBlueprints,
  ...femaleLongBlueprints,
  ...maleShortBlueprints,
  ...maleMediumBlueprints,
  ...maleLongBlueprints,
] as unknown as Array<Omit<HairstyleCatalogBlueprint, "negativePrompt">>;

const EXPANSION_KOREAN_HAIRSTYLE_BLUEPRINTS: HairstyleCatalogBlueprint[] =
  EXPANSION_BLUEPRINTS_WITHOUT_NEGATIVE_PROMPT.map((blueprint) => ({
    ...blueprint,
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
  }));

export const KOREAN_HAIRSTYLE_BLUEPRINTS: HairstyleCatalogBlueprint[] = [
  ...LEGACY_KOREAN_HAIRSTYLE_BLUEPRINTS,
  ...EXPANSION_KOREAN_HAIRSTYLE_BLUEPRINTS,
];

export function isHairstyleBlueprintV4Enabled() {
  return process.env.HAIRSTYLE_BLUEPRINT_V4_ENABLED?.trim().toLowerCase() === "true";
}

export function getRuntimeHairstyleBlueprints() {
  return isHairstyleBlueprintV4Enabled()
    ? KOREAN_HAIRSTYLE_BLUEPRINTS
    : LEGACY_KOREAN_HAIRSTYLE_BLUEPRINTS;
}

function inferLegacyTexture(texture: string): HairTextureProfile {
  const normalized = texture.toLowerCase();
  if (normalized.includes("curl") || normalized.includes("wave") || normalized.includes("perm")) {
    return "wavy_curly";
  }
  return "straight";
}

function clampScore(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function buildCatalogRowsForCycle(
  cycleId: string,
  nowIso: string,
  trendSignals: Map<string, BlueprintTrendSignal>,
): Omit<HairstyleCatalogRow, "id">[] {
  return getRuntimeHairstyleBlueprints().map((item) => {
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
      promptTemplateVersion: HAIRSTYLE_CATALOG_PROMPT_TEMPLATE_VERSION,
      styleTargets: item.styleTargets ?? resolveStyleTargets(item.slug),
      styleFamily: item.styleFamily ?? item.slug,
      variantKey: item.variantKey ?? `legacy-${item.slug}`,
      primaryTexture: item.primaryTexture ?? inferLegacyTexture(item.texture),
      compatibleTextureTags: item.compatibleTextureTags ?? ["straight", "wavy_curly", "tight_curly_frizzy"],
      avoidTextureTags: item.avoidTextureTags ?? [],
      primaryStrandThickness: item.primaryStrandThickness ?? "medium",
      compatibleStrandThicknessTags: item.compatibleStrandThicknessTags ?? ["fine", "medium", "coarse"],
      avoidStrandThicknessTags: item.avoidStrandThicknessTags ?? [],
      primaryCondition: item.primaryCondition ?? "untreated",
      compatibleConditionTags: item.compatibleConditionTags ?? ["untreated", "damaged", "bleached", "colored", "permed"],
      avoidConditionTags: item.avoidConditionTags ?? [],
      requiredServices: item.requiredServices ?? ["cut"],
      serviceConstraints: item.serviceConstraints ?? ["professional_assessment"],
      maintenanceLevel: item.maintenanceLevel ?? "medium",
      introducedIn: item.introducedIn ?? "legacy-32",
      status: "active",
      sourceCycleId: cycleId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  });
}
