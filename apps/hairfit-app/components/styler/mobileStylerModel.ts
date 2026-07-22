import type {
  BodyShape,
  ExposurePreference,
  FashionGenre,
  FitPreference,
  StyleProfile,
} from "@hairfit/shared";

export type MobileStylerWizardStep = 1 | 2 | 3;

export const MOBILE_STYLER_GENRES: {
  value: FashionGenre;
  label: string;
  description: string;
}[] = [
  { value: "minimal", label: "미니멀", description: "색과 디테일을 덜어 헤어와 얼굴이 또렷하게 보이도록 구성합니다." },
  { value: "street", label: "스트리트", description: "볼륨과 오버사이즈, 기능적 디테일로 트렌디하게 구성합니다." },
  { value: "casual", label: "캐주얼", description: "자주 반복해 입기 좋은 아이템으로 일상적인 균형을 만듭니다." },
  { value: "classic", label: "클래식", description: "재킷과 셔츠, 슈즈의 단정한 구조를 중심으로 구성합니다." },
  { value: "office", label: "오피스", description: "출근과 미팅에 어울리는 깔끔한 실루엣으로 구성합니다." },
  { value: "date", label: "데이트", description: "얼굴 주변에 부드러운 색과 소재를 사용해 편안한 인상을 만듭니다." },
  { value: "formal", label: "포멀", description: "행사와 드레스코드에 맞게 절제된 인상으로 구성합니다." },
  { value: "athleisure", label: "애슬레저", description: "활동성을 유지하면서 전체 인상을 정돈해 구성합니다." },
];

export const MOBILE_STYLER_BODY_SHAPES: BodyShape[] = [
  "straight",
  "hourglass",
  "triangle",
  "inverted_triangle",
  "round",
];

export const MOBILE_STYLER_FITS: FitPreference[] = [
  "regular",
  "slim",
  "relaxed",
  "oversized",
];

export const MOBILE_STYLER_EXPOSURES: ExposurePreference[] = [
  "low",
  "balanced",
  "bold",
];

export function formatMobileStylerLength(value?: string | null) {
  if (value === "short") return "숏";
  if (value === "medium") return "미디엄";
  if (value === "long") return "롱";
  return "-";
}

export function formatMobileStylerPersonalColor(profile: StyleProfile | null) {
  const result = profile?.personalColor;
  if (!result) return "진단 결과 없음";
  const tone = { warm: "웜톤", cool: "쿨톤", neutral: "뉴트럴톤" }[result.tone];
  const contrast = { low: "저대비", medium: "중간 대비", high: "고대비" }[result.contrast];
  return `${tone} · ${contrast}`;
}

export function formatMobileStylerBodyShape(value?: BodyShape | null) {
  if (value === "straight") return "스트레이트";
  if (value === "hourglass") return "모래시계형";
  if (value === "triangle") return "삼각형";
  if (value === "inverted_triangle") return "역삼각형";
  if (value === "round") return "라운드형";
  return "-";
}

export function formatMobileStylerFit(value?: FitPreference | null) {
  if (value === "regular") return "레귤러";
  if (value === "slim") return "슬림";
  if (value === "relaxed") return "여유 있는 핏";
  if (value === "oversized") return "오버사이즈";
  return "-";
}

export function formatMobileStylerExposure(value?: ExposurePreference | null) {
  if (value === "low") return "노출 적게";
  if (value === "balanced") return "균형 있게";
  if (value === "bold") return "과감하게";
  return "-";
}

export function formatMobileStylerStatus(value?: string | null) {
  if (value === "completed" || value === "complete" || value === "succeeded") return "완료";
  if (value === "generating" || value === "processing") return "생성 중";
  if (value === "queued" || value === "pending") return "대기 중";
  if (value === "recommended") return "추천 준비 완료";
  if (value === "failed") return "실패";
  return "상태 확인 필요";
}

export function formatMobileStylerCorrectionFocus(value?: string | null) {
  if (value === "crown") return "정수리 볼륨";
  if (value === "temple") return "관자 균형";
  if (value === "jawline") return "턱선 보완";
  return "-";
}

export function formatMobileStylerItemSlot(value?: string | null) {
  if (value === "outer") return "아우터";
  if (value === "top") return "상의";
  if (value === "bottom") return "하의";
  if (value === "shoes") return "신발";
  if (value === "accessory") return "액세서리";
  return value || "아이템";
}

export function formatMobileStylerFaceShape(value?: string | null) {
  if (!value) return "-";
  const normalized = value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (normalized === "oval") return "타원형";
  if (normalized === "round") return "둥근형";
  if (normalized === "square") return "각진형";
  if (normalized === "heart" || normalized === "heart_shaped") return "하트형";
  if (normalized === "oblong" || normalized === "long") return "긴 얼굴형";
  if (normalized === "diamond") return "다이아몬드형";
  return /[가-힣]/.test(value) ? value : "분석 완료";
}

export function isMobileStylerProfileReady(profile: StyleProfile | null) {
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

export function buildMobileStylerBillingHref(sessionId: string) {
  const returnTo = `/styler/${sessionId}`;
  return `/billing?returnTo=${encodeURIComponent(returnTo)}`;
}
