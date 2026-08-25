import { CONSULTATION_STAGE_SLUGS, type ConsultationSnapshot, type ConsultationStage } from "./contracts";

export const CONSULTATION_STAGE_DEFINITIONS: Array<{
  slug: ConsultationStage;
  task: string;
  title: string;
  description: string;
}> = [
  { slug: "discovery", task: "DISCOVERY", title: "AI 상담을 가볍게 시작해요", description: "사진을 먼저 보고 결과에 필요한 내용만 짧게 확인합니다." },
  { slug: "photo", task: "PHOTO", title: "분석할 사진을 준비해요", description: "사진 품질과 사용 범위, 보존 기간을 확인합니다." },
  { slug: "scan", task: "FACE SCAN", title: "분석 근거를 검토해요", description: "윤곽·헤어라인·측정·피부 근거를 사람이 확인할 수 있게 연결합니다." },
  { slug: "analysis", task: "ANALYSIS", title: "근거가 뜻하는 방향을 읽어요", description: "Evidence에서 Meaning과 Action까지 한 화면에서 설명합니다." },
  { slug: "personal-color", task: "COLOR DIAGNOSIS", title: "나에게 맞는 색 기준을 정리해요", description: "촬영 품질과 피부색 근거를 바탕으로 컬러 선택 기준을 제안합니다." },
  { slug: "direction", task: "DIRECTION", title: "생성 전에 전략을 확정해요", description: "8개 설계 축을 정하고 비용이 발생하기 전에 방향을 잠급니다." },
  { slug: "previews", task: "HAIR RECOMMENDATION", title: "AI가 9가지 가능성에서 먼저 추천해요", description: "생성 내용은 모두 보여주고, 얼굴·모질·관리 조건에 맞는 주 추천을 먼저 설명합니다." },
  { slug: "compare", task: "COMPARE", title: "같은 기준으로 나란히 비교해요", description: "동일한 크롭과 정보 구조로 최종 후보를 고릅니다." },
  { slug: "decision", task: "DECISION", title: "현실적으로 가능한 스타일을 확정해요", description: "시술·관리·제약을 포함한 불변 선택 스냅샷을 만듭니다." },
  { slug: "color-studio", task: "COLOR STUDIO", title: "확정한 헤어에서 컬러를 비교해요", description: "퍼스널 컬러 근거로 만든 세 후보를 기다림 없이 비교하고 하나를 최종 생성합니다." },
  { slug: "salon-brief", task: "SALON BRIEF", title: "말로 설명하기 어려운 것을 브리프로", description: "고객용과 디자이너용 상담 자료를 안전하게 공유합니다." },
  { slug: "makeup", task: "MAKEUP DIRECTION", title: "나에게 맞는 메이크업 방향을 확인해요", description: "퍼스널 컬러와 확정 헤어를 이어, 어울리는 색과 부위별 적용법을 구체적으로 안내합니다." },
  { slug: "fashion", task: "FASHION", title: "헤어와 이어지는 인상을 완성해요", description: "DAILY·WORK·STATEMENT 룩을 비교하고 하나를 선택합니다." },
  { slug: "result", task: "CONSULTATION RESULT", title: "상담 결과를 한눈에 마무리해요", description: "헤어·컬러·패션 선택과 Salon Brief, 다음 행동을 한곳에 모읍니다." },
  { slug: "aftercare", task: "AFTERCARE", title: "실제 시술을 기준으로 관리해요", description: "계획이 아니라 실제 받은 시술과 경과를 기록합니다." },
];

export function consultationStageHref(sessionId: string, stage: ConsultationStage) {
  return `/consulting/${encodeURIComponent(sessionId)}/${stage}`;
}

export function consultationStageHrefForPath(sessionId: string, stage: ConsultationStage, pathname: string) {
  return pathname === "/consulting/e2e-harness"
    ? `/consulting/e2e-harness?stage=${encodeURIComponent(stage)}`
    : consultationStageHref(sessionId, stage);
}

export function consultationStageIndex(stage: ConsultationStage) {
  return CONSULTATION_STAGE_SLUGS.indexOf(stage);
}

export function adjacentConsultationStages(stage: ConsultationStage) {
  const index = consultationStageIndex(stage);
  return {
    previous: index > 0 ? CONSULTATION_STAGE_SLUGS[index - 1] : null,
    next: index < CONSULTATION_STAGE_SLUGS.length - 1 ? CONSULTATION_STAGE_SLUGS[index + 1] : null,
  };
}

export function canEnterConsultationStage(snapshot: ConsultationSnapshot, stage: ConsultationStage) {
  return snapshot.journey.allowedStages.includes(stage);
}

export function consultationStageBlockingReason(snapshot: ConsultationSnapshot, stage: ConsultationStage) {
  return snapshot.journey.blockingActions.find((action) => action.stage === stage) ?? null;
}
