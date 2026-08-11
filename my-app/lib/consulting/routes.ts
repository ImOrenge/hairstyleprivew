import { CONSULTATION_STAGE_SLUGS, type ConsultationSnapshot, type ConsultationStage } from "./contracts";

export const CONSULTATION_STAGE_DEFINITIONS: Array<{
  slug: ConsultationStage;
  task: string;
  title: string;
  description: string;
}> = [
  { slug: "discovery", task: "DISCOVERY", title: "원하는 변화부터 정리해요", description: "목표와 현재 모발, 관리 가능 범위를 함께 정의합니다." },
  { slug: "photo", task: "PHOTO", title: "분석할 사진을 준비해요", description: "사진 품질과 사용 범위, 보존 기간을 확인합니다." },
  { slug: "scan", task: "FACE SCAN", title: "분석 근거를 검토해요", description: "윤곽·헤어라인·측정·피부 근거를 사람이 확인할 수 있게 연결합니다." },
  { slug: "analysis", task: "ANALYSIS", title: "근거가 뜻하는 방향을 읽어요", description: "Evidence에서 Meaning과 Action까지 한 화면에서 설명합니다." },
  { slug: "direction", task: "DIRECTION", title: "생성 전에 전략을 확정해요", description: "8개 설계 축을 정하고 비용이 발생하기 전에 방향을 잠급니다." },
  { slug: "previews", task: "PREVIEW", title: "세 가지 전략으로 9개를 봐요", description: "BALANCE·IMAGE·LIFESTYLE 후보에서 2~3개를 추립니다." },
  { slug: "compare", task: "COMPARE", title: "같은 기준으로 나란히 비교해요", description: "동일한 크롭과 정보 구조로 최종 후보를 고릅니다." },
  { slug: "decision", task: "DECISION", title: "현실적으로 가능한 스타일을 확정해요", description: "시술·관리·제약을 포함한 불변 선택 스냅샷을 만듭니다." },
  { slug: "salon-brief", task: "SALON BRIEF", title: "말로 설명하기 어려운 것을 브리프로", description: "고객용과 디자이너용 상담 자료를 안전하게 공유합니다." },
  { slug: "aftercare", task: "AFTERCARE", title: "실제 시술을 기준으로 관리해요", description: "계획이 아니라 실제 받은 시술과 경과를 기록합니다." },
  { slug: "fashion", task: "FASHION", title: "헤어와 이어지는 인상을 완성해요", description: "DAILY·WORK·STATEMENT 룩을 비교하고 하나를 선택합니다." },
];

export function consultationStageHref(sessionId: string, stage: ConsultationStage) {
  return `/consulting/${encodeURIComponent(sessionId)}/${stage}`;
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
