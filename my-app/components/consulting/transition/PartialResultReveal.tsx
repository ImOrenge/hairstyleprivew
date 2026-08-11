"use client";

import Image from "next/image";
import type { ConsultationActiveTask, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { ConsultationPhotoEvidence } from "../photo/ConsultationPhotoEvidence";

export function PartialResultReveal({ snapshot, task }: { snapshot: ConsultationSnapshot; task: ConsultationActiveTask }) {
  if (task.partialOutputCount <= 0) return null;
  if (task.kind === "analysis") return <section className="f-consultant-activity__partial" aria-labelledby="partial-analysis-title">
    <div><p className="app-kicker">First evidence</p><h2 id="partial-analysis-title">저장된 분석 근거를 먼저 공개합니다</h2></div>
    <ConsultationPhotoEvidence sessionId={snapshot.sessionId} enabled={Boolean(snapshot.photo.draftId)} allowCorrections={false} />
  </section>;
  if (task.kind === "preview-generation") {
    const results = snapshot.previews.filter((item) => item.status === "accepted" && item.imageUrl);
    return <section className="f-consultant-activity__partial" aria-labelledby="partial-preview-title"><div><p className="app-kicker">Partial results</p><h2 id="partial-preview-title">완성된 프리뷰 {results.length}개</h2></div><div className="f-consultant-activity__result-grid">{results.map((preview) => <article key={preview.id}><Image unoptimized src={preview.imageUrl!} alt={preview.label} width={240} height={300} /><strong>{preview.label}</strong></article>)}</div></section>;
  }
  if (task.kind === "brief") return <section className="f-consultant-activity__partial" aria-labelledby="partial-brief-title"><div><p className="app-kicker">Brief draft</p><h2 id="partial-brief-title">저장된 항목부터 보여드립니다</h2></div><dl>{[["Summary", snapshot.salonBrief.summary],["Cut", snapshot.salonBrief.cut],["Volume", snapshot.salonBrief.volumeTexture],["Styling", snapshot.salonBrief.styling]].filter(([,value]) => value).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>;
  if (task.kind === "aftercare-preparation") return <section className="f-consultant-activity__partial" aria-labelledby="partial-care-title"><div><p className="app-kicker">Care timeline</p><h2 id="partial-care-title">저장된 관리 일정</h2></div><ol>{snapshot.careProgram.today.map((item) => <li key={item}>{item}</li>)}{snapshot.careProgram.checkpoints.map((item) => <li key={item.offset}><strong>{item.offset}</strong> {item.action}</li>)}</ol></section>;
  return <section className="f-consultant-activity__partial" aria-labelledby="partial-fashion-title"><div><p className="app-kicker">Fashion batch</p><h2 id="partial-fashion-title">완료 슬롯 {snapshot.fashionBatch?.completedCount ?? 0}개</h2></div><div className="f-consultant-activity__slot-grid">{Object.entries(snapshot.fashionBatch?.slotState ?? {}).map(([slot, state]) => <div key={slot} data-state={state}><strong>{slot}</strong><span>{state}</span></div>)}</div></section>;
}
