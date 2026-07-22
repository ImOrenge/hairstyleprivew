import type {
  GenerationDetailApiResponse,
  HairstyleGenerationGroup,
  StylingGenerateApiResponse,
  StylingHairstyleListApiResponse,
  StylingProfileApiResponse,
  StylingQuoteApiResponse,
  StylingRecommendApiResponse,
} from "@hairfit/shared";
import type {
  FashionGenre,
  FashionRecommendation,
  StyleProfile,
} from "../../lib/fashion-types";
import type {
  FaceAnalysisSummary,
  GeneratedVariant,
  RecommendationSet,
} from "../../lib/recommendation-types";

export type StylerProfileResponse = StylingProfileApiResponse;
export type StylerRecommendResponse = StylingRecommendApiResponse<
  FashionRecommendation,
  StyleProfile,
  GeneratedVariant
>;
export type StylerGenerateResponse = StylingGenerateApiResponse;
export type StylerQuoteResponse = StylingQuoteApiResponse;
export type StylerGenerationResponse = Partial<
  GenerationDetailApiResponse<RecommendationSet, GeneratedVariant>
> & { error?: string };
export type StylerHairstyleGenerationGroup = HairstyleGenerationGroup<
  FaceAnalysisSummary,
  GeneratedVariant
>;
export type StylerHairstyleListResponse = StylingHairstyleListApiResponse<
  StylerHairstyleGenerationGroup
>;

export type StylerWizardStep = 1 | 2 | 3;

export const STYLER_STEP_DEFINITIONS: {
  id: StylerWizardStep;
  title: string;
  eyebrow: string;
}[] = [
  { id: 1, title: "프로필 확인", eyebrow: "헤어 + 바디" },
  { id: 2, title: "장르 선택", eyebrow: "패션 방향" },
  { id: 3, title: "견적·생성", eyebrow: "추천 검토 후 시작" },
];

export const STYLER_GENRE_OPTIONS: {
  value: FashionGenre;
  label: string;
  description: string;
}[] = [
  { value: "minimal", label: "미니멀", description: "색과 디테일을 줄여 헤어와 얼굴을 또렷하게 보여줍니다." },
  { value: "street", label: "스트릿", description: "오버핏과 기능성 디테일로 트렌디한 볼륨을 만듭니다." },
  { value: "casual", label: "캐주얼", description: "반복해서 입기 쉬운 데일리 균형을 우선합니다." },
  { value: "classic", label: "클래식", description: "재킷, 셔츠, 로퍼처럼 오래 가는 구조감을 사용합니다." },
  { value: "office", label: "오피스", description: "출근과 미팅에 맞는 단정한 실루엣을 구성합니다." },
  { value: "date", label: "데이트", description: "얼굴 주변을 부드럽게 살리는 색과 소재를 씁니다." },
  { value: "formal", label: "포멀", description: "행사와 격식 있는 자리에 맞는 절제된 룩입니다." },
  { value: "athleisure", label: "애슬레저", description: "활동성은 유지하고 인상은 깔끔하게 정리합니다." },
];

export function formatStylerDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatStylerLength(value?: string | null) {
  if (value === "short") return "짧은 기장";
  if (value === "medium") return "중간 기장";
  if (value === "long") return "긴 기장";
  return "-";
}

export function formatStylerFocus(value?: string | null) {
  if (value === "crown") return "정수리 볼륨";
  if (value === "temple") return "관자/사이드 균형";
  if (value === "jawline") return "턱선 보정";
  return "-";
}

export function formatStylerBodyShape(value?: string | null) {
  if (value === "straight") return "스트레이트";
  if (value === "hourglass") return "아워글래스";
  if (value === "triangle") return "트라이앵글";
  if (value === "inverted_triangle") return "역삼각형";
  if (value === "round") return "라운드";
  return "-";
}

export function formatStylerFit(value?: string | null) {
  if (value === "regular") return "레귤러";
  if (value === "slim") return "슬림";
  if (value === "relaxed") return "릴랙스";
  if (value === "oversized") return "오버핏";
  return "-";
}

export function formatStylerExposure(value?: string | null) {
  if (value === "low") return "낮음";
  if (value === "balanced") return "균형";
  if (value === "bold") return "과감";
  return "-";
}

export function formatStylerPersonalColor(profile?: StyleProfile | null) {
  const result = profile?.personalColor;
  if (!result) return "미진단";
  const tone = result.tone === "warm" ? "웜톤" : result.tone === "cool" ? "쿨톤" : "뉴트럴";
  const contrast = result.contrast === "low" ? "낮은 대비" : result.contrast === "high" ? "높은 대비" : "중간 대비";
  return `${tone} · ${contrast}`;
}

export function isStylerProfileReady(profile?: StyleProfile | null) {
  return Boolean(
    profile?.heightCm &&
      profile.bodyShape &&
      profile.topSize &&
      profile.bottomSize &&
      profile.fitPreference &&
      profile.exposurePreference &&
      profile.bodyPhotoPath,
  );
}

export function buildStylerBillingHref(sessionId: string | null) {
  if (!sessionId) return "/billing";
  return `/billing?${new URLSearchParams({ returnTo: `/styler/${sessionId}` }).toString()}`;
}

export function buildStylerNewHref(generationId: string, variantId: string) {
  return `/styler/new?generationId=${encodeURIComponent(generationId)}&variant=${encodeURIComponent(variantId)}`;
}
