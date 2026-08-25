"use client";

import type { ConsultationActiveTask, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { ConsultationPhotoEvidence } from "../photo/ConsultationPhotoEvidence";

export function PartialResultReveal({ snapshot, task }: { snapshot: ConsultationSnapshot; task: ConsultationActiveTask }) {
  if (task.partialOutputCount <= 0) return null;
  if (task.kind === "analysis") return <section className="f-consultant-activity__partial" aria-labelledby="partial-analysis-title">
    <div><p className="app-kicker">먼저 확인된 내용</p><h2 id="partial-analysis-title">확인된 분석 근거부터 보여드릴게요</h2></div>
    <ConsultationPhotoEvidence sessionId={snapshot.sessionId} enabled={Boolean(snapshot.photo.draftId)} allowCorrections={false} />
  </section>;
  if (task.kind === "preview-generation") {
    const acceptedCount = snapshot.previews.filter((item) => item.status === "accepted" && item.imageUrl).length;
    return <section className="f-consultant-activity__partial" aria-labelledby="partial-preview-title"><div><p className="app-kicker">먼저 준비된 결과</p><h2 id="partial-preview-title">준비된 프리뷰 {acceptedCount}개 · 생성 계속 중</h2></div><p className="text-sm leading-6 text-[var(--app-muted)]">완료된 이미지는 아래의 한 화면에서 9개 모두 확인할 수 있습니다. 생성 중에는 같은 이미지를 중복해서 보여주지 않습니다.</p></section>;
  }
  if (task.kind === "brief") return <section className="f-consultant-activity__partial" aria-labelledby="partial-brief-title"><div><p className="app-kicker">미용실에서 보여줄 내용</p><h2 id="partial-brief-title">정리된 항목부터 보여드릴게요</h2></div><dl>{[["요약", snapshot.salonBrief.summary],["커트", snapshot.salonBrief.cut],["볼륨과 질감", snapshot.salonBrief.volumeTexture],["스타일링", snapshot.salonBrief.styling]].filter(([,value]) => value).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>;
  if (task.kind === "aftercare-preparation") return <section className="f-consultant-activity__partial" aria-labelledby="partial-care-title"><div><p className="app-kicker">관리 일정</p><h2 id="partial-care-title">지금 확인할 수 있는 관리 방법</h2></div><ol>{snapshot.careProgram.today.map((item) => <li key={item}>{item}</li>)}{snapshot.careProgram.checkpoints.map((item) => <li key={item.offset}><strong>{item.offset}</strong> {item.action}</li>)}</ol></section>;
  return <section className="f-consultant-activity__partial" aria-labelledby="partial-fashion-title"><div><p className="app-kicker">먼저 준비된 패션</p><h2 id="partial-fashion-title">지금 확인할 수 있는 패션 제안 {snapshot.fashionBatch?.completedCount ?? 0}개</h2></div><p className="text-sm text-[var(--app-muted)]">나머지 제안도 계속 준비하고 있습니다.</p></section>;
}
