import { CONSULTATION_STAGE_SLUGS, type ConsultationPatch, type ConsultationSnapshot } from "./contracts";

function fail(message: string): never { throw new Error(`INVALID_PATCH:${message}`); }

export function validateConsultationPatch(snapshot: ConsultationSnapshot, patch: ConsultationPatch) {
  const currentIndex = CONSULTATION_STAGE_SLUGS.indexOf(snapshot.currentStage);
  if (patch.currentStage) {
    const nextIndex = CONSULTATION_STAGE_SLUGS.indexOf(patch.currentStage);
    if (nextIndex > currentIndex + 1) fail("단계를 건너뛸 수 없습니다.");
    if (nextIndex === currentIndex + 1 && patch.completeStage !== snapshot.currentStage) fail("현재 단계를 완료한 뒤 이동해 주세요.");
  }
  if (patch.completeStage && patch.completeStage !== snapshot.currentStage && !snapshot.completedStages.includes(patch.completeStage)) fail("현재 열려 있는 단계를 먼저 완료해 주세요.");
  if (patch.discovery && (!patch.discovery.goals.length || !patch.discovery.currentHair.trim())) fail("목표와 현재 모발 상태가 필요합니다.");
  if (patch.photo && (!patch.photo.generationId || !patch.photo.usageScopes.length || patch.photo.quality.some((item) => item.status === "pending"))) fail("사진 연결, 사용 범위와 8개 품질 확인이 필요합니다.");
  if (patch.evidence && (!patch.evidence.items.length || patch.evidence.pipelineStatus !== "reviewed")) fail("분석 근거를 검토해 주세요.");
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
  if ((patch.salonBrief?.createdAt || patch.actualService?.confirmedAt || patch.fashion?.selectedAt) && !activeStyle) fail("현재 전략에서 선택한 스타일이 필요합니다.");
  if (patch.fashion && (patch.fashion.shortlistIds.length < 2 || patch.fashion.shortlistIds.length > 3 || !patch.fashion.lookId || !patch.fashion.shortlistIds.includes(patch.fashion.lookId))) fail("패션 후보 2~3개를 비교하고 최종 룩을 선택해 주세요.");
  if (patch.actualService?.confirmedAt && (!patch.actualService.services.length || !patch.actualService.serviceDate)) fail("실제 시술과 시술일을 기록해 주세요.");
  if (patch.actualService?.confirmedAt && !patch.careProgram?.today.length) fail("오늘 할 관리 행동을 기록해 주세요.");
}
