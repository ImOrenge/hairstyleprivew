export type CustomerHomeActionId = "consultation" | "result" | "care";
export type CustomerHomeActionIcon = "clock" | "sparkles" | "heart";

export interface CustomerHomeViewSource {
  inProgress: {
    stageTitle: string;
    startedAt: string | null;
    href: string;
  } | null;
  completed: {
    title: string;
    completedAt: string | null;
    href: string;
    imageUrl: string | null;
  } | null;
  care: {
    actualServiceId: string;
    styleName: string | null;
    serviceDate: string | null;
  } | null;
}

export interface CustomerHomeActionView {
  id: CustomerHomeActionId;
  icon: CustomerHomeActionIcon;
  kicker: string;
  title: string;
  body: string;
  href: string;
  ctaLabel: string;
  available: boolean;
}

export interface CustomerHomeViewModel {
  confirmedImageUrl: string | null;
  confirmedImageAlt: string | null;
  defaultActionId: CustomerHomeActionId;
  actions: CustomerHomeActionView[];
  recommendation: {
    title: string;
    body: string;
    currentStep: string;
    nextStep: string;
  } | null;
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

function cleanImageUrl(value: string | null | undefined) {
  const url = value?.trim();
  return url || null;
}

export function buildCustomerHomeView(source: CustomerHomeViewSource): CustomerHomeViewModel {
  const { inProgress, completed, care } = source;
  const confirmedImageUrl = cleanImageUrl(completed?.imageUrl);
  const startedAt = formatDate(inProgress?.startedAt);
  const completedAt = formatDate(completed?.completedAt);
  const serviceDate = formatDate(care?.serviceDate);

  const actions: CustomerHomeActionView[] = [
    {
      id: "consultation",
      icon: "clock",
      kicker: inProgress ? "1 · 진행 중" : "1 · 추천",
      title: inProgress ? inProgress.stageTitle : "새 컨설팅으로 다음 룩 찾기",
      body: inProgress
        ? `${startedAt ? `${startedAt} 시작한 ` : ""}상담을 저장된 단계부터 이어가세요.`
        : "사진과 원하는 분위기를 알려주면 얼굴 균형과 관리 습관을 함께 반영해 드려요.",
      href: inProgress?.href ?? "/consulting/new",
      ctaLabel: inProgress ? "컨설팅 이어하기" : "새 컨설팅 시작",
      available: true,
    },
    {
      id: "result",
      icon: "sparkles",
      kicker: "2 · 최근 결과",
      title: completed?.title || "아직 확정한 룩이 없어요",
      body: completed
        ? `${completedAt ? `${completedAt} 완성된 ` : ""}통합 결과와 선택 근거를 다시 확인하세요.`
        : "컨설팅에서 룩을 확정하면 결과와 이미지가 이곳에 표시됩니다.",
      href: completed?.href ?? "/stylebook",
      ctaLabel: completed ? "결과 다시 보기" : "스타일북 보기",
      available: Boolean(completed),
    },
    {
      id: "care",
      icon: "heart",
      kicker: "3 · 케어",
      title: care?.styleName || "내 스타일을 오래 유지해요",
      body: care
        ? `${serviceDate ? `${serviceDate} 시술의 ` : ""}맞춤 관리 가이드를 확인하세요.`
        : "시술이 확정되면 집에서 이어갈 관리 가이드가 준비됩니다.",
      href: care ? `/aftercare/${encodeURIComponent(care.actualServiceId)}` : "/aftercare",
      ctaLabel: "케어 확인",
      available: Boolean(care),
    },
  ];

  const defaultActionId: CustomerHomeActionId = inProgress
    ? "consultation"
    : completed
      ? "result"
      : "consultation";

  return {
    confirmedImageUrl,
    confirmedImageAlt: confirmedImageUrl ? `${completed?.title || "확정한 스타일"} 결과` : null,
    defaultActionId,
    actions,
    recommendation: confirmedImageUrl
      ? null
      : {
          title: inProgress ? "저장된 단계부터 이어가세요" : "컨설팅으로 다음 룩을 구체화하세요",
          body: inProgress
            ? "지금까지 입력한 내용은 그대로 보존되어 있어요. 다음 단계만 완료하면 추천 결과에 더 가까워집니다."
            : "확정되지 않은 예시 이미지를 보여드리는 대신, 지금 필요한 질문과 사진 준비부터 안내해 드릴게요.",
          currentStep: inProgress ? `현재 단계 · ${inProgress.stageTitle}` : "현재 단계 · 컨설팅 시작 전",
          nextStep: inProgress ? "다음 행동 · 저장된 상담 이어가기" : "다음 행동 · 원하는 분위기와 사진 준비",
        },
  };
}
