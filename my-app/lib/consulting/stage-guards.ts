import { isConsultationPhotoCrop } from "@hairfit/shared";
import type { ConsultationPatch, ConsultationSnapshot } from "./contracts";

function fail(message: string): never { throw new Error(`INVALID_PATCH:${message}`); }

export function validateConsultationPatch(snapshot: ConsultationSnapshot, patch: ConsultationPatch) {
  if (patch.completeStage === "discovery") {
    const discovery = patch.discovery ?? snapshot.discovery;
    if (
      !discovery.purpose.trim()
      || !discovery.goals.length
      || !discovery.currentHair.trim()
      || !discovery.hairLength
      || !discovery.hairDensity
      || !discovery.strandThickness
      || !discovery.hairTexture
      || !discovery.damageLevel
      || !discovery.allowedServices.length
    ) fail("상담 목적, 현재 모발, 가능한 시술 범위와 목표가 필요합니다.");
    const unavailable = discovery.desiredServices.filter((service) => service !== "아직 모름" && !discovery.allowedServices.includes(service));
    if (unavailable.length) fail(`고려 중인 시술이 가능한 범위와 충돌합니다: ${unavailable.join(", ")}`);
  }
  if (patch.photo && (
    !patch.photo.draftId
    || !isConsultationPhotoCrop(patch.photo.crop)
    || !patch.photo.usageScopes.includes("analysis")
    || !patch.photo.usageScopes.includes("preview")
    || patch.photo.quality.length !== 8
  )) fail("사진 업로드, 프레이밍, 사용 범위와 8개 시스템 품질 항목이 필요합니다.");
  if (patch.evidence && !patch.evidence.items.length) fail("저장된 분석 근거가 필요합니다.");
  if (patch.completeStage === "photo") {
    const photo = patch.photo ?? snapshot.photo;
    const evidence = patch.evidence ?? snapshot.evidence;
    const recommendations = patch.strategyRecommendations ?? snapshot.strategyRecommendations;
    if (photo.quality.some((item) => item.status === "pending") || !photo.capturedAt || !evidence.items.length || evidence.pipelineStatus === "idle" || new Set(recommendations.map((item) => item.axis)).size !== 8) fail("8개 시스템 품질 확인, AI 분석 근거와 8개 전략 추천을 저장한 뒤 다음 단계로 이동해 주세요.");
  }
  if (patch.strategy?.confirmedAt && Object.values(patch.strategy).some((value) => typeof value === "string" && !value.trim())) fail("8개 전략 축을 모두 선택해 주세요.");
  if (patch.strategy && snapshot.selectedStyleHistory.at(-1)?.serviceConfirmedAt) fail("실제 시술 확정 후에는 전략을 변경할 수 없습니다.");
  if (patch.shortlist) {
    if (patch.shortlist.previewIds.length < 2 || patch.shortlist.previewIds.length > 3) fail("shortlist는 2~3개여야 합니다.");
    const valid = patch.shortlist.previewIds.every((id) => (patch.previews ?? snapshot.previews).some((preview) => preview.id === id && preview.status === "accepted"));
    if (!valid) fail("완료된 프리뷰만 shortlist에 넣을 수 있습니다.");
  }
  if (patch.finalist?.finalistPreviewId && !snapshot.shortlist.previewIds.includes(patch.finalist.finalistPreviewId)) fail("shortlist 후보만 최종 선택할 수 있습니다.");
  if (patch.selectedStyle && patch.selectedStyle.previewId !== snapshot.finalist.finalistPreviewId) fail("비교에서 정한 최종 후보와 선택이 일치해야 합니다.");
  if (patch.salonBrief && patch.salonBrief.rawFaceIncluded !== false) fail("원본 얼굴 사진은 기본 공유 범위에 포함할 수 없습니다.");
  const activeStyle = snapshot.selectedStyleHistory.find((style) => style.strategy.revision === snapshot.strategy.revision);
  if ((patch.salonBrief?.createdAt || patch.actualService?.confirmedAt || patch.fashion?.selectedAt) && !activeStyle && !patch.selectedStyle) fail("현재 전략에서 선택한 스타일이 필요합니다.");
  if (patch.fashion && (patch.fashion.shortlistIds.length < 2 || patch.fashion.shortlistIds.length > 3 || !patch.fashion.lookId || !patch.fashion.shortlistIds.includes(patch.fashion.lookId))) fail("패션 후보 2~3개를 비교하고 최종 룩을 선택해 주세요.");
  if (patch.actualService?.confirmedAt && (!patch.actualService.services.length || !patch.actualService.serviceDate)) fail("실제 시술과 시술일을 기록해 주세요.");
  if (patch.actualService?.confirmedAt && !patch.careProgram?.today.length) fail("오늘 할 관리 행동을 기록해 주세요.");
}
