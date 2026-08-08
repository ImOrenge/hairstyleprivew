"use client";

import { useState } from "react";
import type { AnalysisEvidenceDraft, ConsultationPatch, ConsultationSnapshot, EvidenceItem } from "../../../lib/consulting/contracts";
import { loadGenerationConsultationBridge } from "../../../lib/consulting/generation-bridge";
import { Button } from "../../ui/Button";
import { ConsultationPhotoEvidence } from "../photo/ConsultationPhotoEvidence";
import { Panel, SaveStageButton, SurfaceCard, WorkbenchGrid } from "./shared";

const BASE: EvidenceItem[] = [
  { id: "contour", layer: "contour", evidence: "좌우 윤곽선과 턱선 폭", meaning: "아래쪽 무게가 강조될 수 있음", action: "광대 아래 레이어와 정수리 높이로 시선 분산", confidence: "medium", manuallyCorrected: false },
  { id: "hairline", layer: "hairline", evidence: "이마 폭과 헤어라인 노출", meaning: "앞머리 면적이 인상에 큰 영향", action: "완전 폐쇄보다 열린 프린지 우선", confidence: "medium", manuallyCorrected: false },
  { id: "measurement", layer: "measurement", evidence: "세로 대비 가로 비율", meaning: "측면 볼륨이 넓이를 강조할 수 있음", action: "사이드 볼륨 낮춤", confidence: "medium", manuallyCorrected: false },
  { id: "skin", layer: "skin", evidence: "컬러 보조 사진의 명도 대비", meaning: "저채도 색상이 얼굴보다 먼저 보이지 않음", action: "자연 명도 컬러부터 비교", confidence: "low", manuallyCorrected: false },
  { id: "excluded", layer: "excluded", evidence: "가림·표정·렌즈 왜곡 영역", meaning: "해당 영역은 판단 근거에서 제외", action: "낮은 신뢰도로 표시하고 현장 확인", confidence: "low", manuallyCorrected: false },
  { id: "direction", layer: "direction", evidence: "목표와 회피 조건 교차", meaning: "분석만으로 결정하지 않음", action: "사용자 목표와 함께 05 전략에 반영", confidence: "high", manuallyCorrected: false },
];

export function ScanWorkbench({ snapshot, mutate, saving }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>; saving: boolean }) {
  const [evidence, setEvidence] = useState<AnalysisEvidenceDraft>(snapshot.evidence.items.length ? snapshot.evidence : { pipelineStatus: snapshot.photo.generationId ? "linked" : "idle", items: BASE, reviewedAt: null });
  const [faceAnalysis, setFaceAnalysis] = useState(snapshot.faceAnalysis);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (id: string, patch: Partial<EvidenceItem>) => setEvidence({ ...evidence, items: evidence.items.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const linkAnalysis = async () => {
    if (!snapshot.photo.generationId) return;
    setLoading(true); setError(null);
    try {
      const bridge = await loadGenerationConsultationBridge(snapshot.photo.generationId);
      if (bridge.faceAnalysis) {
        setFaceAnalysis(bridge.faceAnalysis);
        setEvidence((current) => ({ ...current, pipelineStatus: "linked", items: current.items.map((item) => item.id === "contour" ? { ...item, evidence: `${bridge.faceAnalysis?.faceShape} 윤곽과 ${bridge.faceAnalysis?.balance} 균형`, confidence: "medium" } : item.id === "hairline" ? { ...item, evidence: bridge.faceAnalysis?.hairline || item.evidence, confidence: "medium" } : item.id === "measurement" ? { ...item, evidence: `모발 밀도 ${bridge.faceAnalysis?.density || "확인 필요"}`, confidence: "medium" } : item) }));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "분석을 연결하지 못했습니다."); }
    finally { setLoading(false); }
  };
  return <WorkbenchGrid><Panel className="grid gap-4 p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-black">실제 generation 분석 근거</p><Button type="button" variant="secondary" loading={loading} disabled={!snapshot.photo.generationId} onClick={() => void linkAnalysis()}>분석 파이프라인 연결</Button></div>{error ? <p className="text-sm text-[var(--app-danger)]">{error}</p> : null}<div className="grid gap-3">{evidence.items.map((item) => <article key={item.id} className="border border-[var(--app-border)] bg-[var(--app-surface)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="app-kicker">{item.layer}</p><select value={item.confidence} onChange={(event) => update(item.id, { confidence: event.target.value as EvidenceItem["confidence"], manuallyCorrected: true })} className="app-input min-h-10 px-2 text-xs font-black" aria-label={`${item.layer} 신뢰도`}><option value="low">LOW</option><option value="medium">MEDIUM</option><option value="high">HIGH</option></select></div><div className="mt-3 grid gap-2 text-sm"><p><strong>Evidence</strong> · {item.evidence}</p><p><strong>Meaning</strong> · {item.meaning}</p><p><strong>Action</strong> · {item.action}</p></div></article>)}</div><SaveStageButton loading={saving} disabled={evidence.pipelineStatus === "idle"} onClick={() => void mutate({ evidence: { ...evidence, pipelineStatus: "reviewed", reviewedAt: new Date().toISOString() }, faceAnalysis, completeStage: "scan", currentStage: "analysis" })}>근거 검토 완료</SaveStageButton></Panel><div className="grid gap-4"><ConsultationPhotoEvidence sessionId={snapshot.sessionId} enabled={snapshot.photo.usageScopes.includes("analysis")} /><SurfaceCard className="p-5"><p className="app-kicker">AnalysisEvidenceDraft</p><h2 className="mt-3 text-xl font-black">AI 판단을 숨기지 않습니다</h2><p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">근거 레이어와 제외 영역, 신뢰도를 확인하고 사람이 보정한 항목을 별도로 기록합니다.</p></SurfaceCard></div></WorkbenchGrid>;
}
