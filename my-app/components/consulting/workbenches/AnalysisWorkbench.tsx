"use client";

import { useState } from "react";
import type { ConsultationPatch, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { Button } from "../../ui/Button";
import { ConsultationPhotoEvidence } from "../photo/ConsultationPhotoEvidence";
import { ConsultationSystemData, DefinitionRows, Panel, SaveStageButton, SurfaceCard, WorkbenchGrid } from "./shared";

export function AnalysisWorkbench({ snapshot, mutate, saving }: {
  snapshot: ConsultationSnapshot;
  mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>;
  saving: boolean;
}) {
  const [color, setColor] = useState(snapshot.personalColor);
  const [colorLoading, setColorLoading] = useState(false);
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(snapshot.evidence.items[0]?.id ?? null);
  const activeEvidence = snapshot.evidence.items.find((item) => item.id === activeEvidenceId) ?? null;
  const linkedRecommendations = snapshot.strategyRecommendations.filter((item) => item.evidenceId === activeEvidenceId);

  const loadColor = async () => {
    setColorLoading(true);
    try {
      const response = await fetch("/api/style-profile", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        profile?: { personalColor?: { season?: string; tone?: string; bestColors?: Array<{ hex?: string }> } | null };
      };
      const saved = data.profile?.personalColor;
      if (response.ok && saved) {
        setColor({
          season: saved.season || "저장된 진단",
          undertone: saved.tone || "neutral",
          palette: (saved.bestColors || []).map((item) => item.hex || "").filter(Boolean),
          confidence: "high",
        });
      }
    } finally {
      setColorLoading(false);
    }
  };

  return <WorkbenchGrid output={<>
    <div className="grid gap-4">
      <ConsultationPhotoEvidence
        sessionId={snapshot.sessionId}
        enabled={snapshot.photo.usageScopes.includes("analysis")}
        activeEvidenceId={activeEvidenceId}
        onEvidenceSelect={setActiveEvidenceId}
      />
      <SurfaceCard className="p-5">
        <p className="app-kicker">Evidence ledger</p>
        <div className="mt-4 grid gap-3" aria-label="분석 근거 목록">
          {snapshot.evidence.items.map((item) => <button
            key={item.id}
            type="button"
            onClick={() => setActiveEvidenceId(item.id)}
            aria-pressed={activeEvidenceId === item.id}
            data-evidence-ledger-id={item.id}
            className={`min-h-16 border-l-2 p-3 text-left ${activeEvidenceId === item.id ? "border-[var(--app-border-strong)] bg-[var(--app-surface-muted)]" : "border-[var(--app-accent)]"}`}
          >
            <span className="text-xs font-black uppercase">{item.layer} · {item.confidence}</span>
            <span className="mt-1 block text-sm">{item.evidence} → {item.meaning} → {item.action}</span>
          </button>)}
        </div>
      </SurfaceCard>
    </div>
    <ConsultationSystemData snapshot={snapshot} items={[
      { label: "Focused evidence", value: activeEvidence?.layer || "선택 전" },
      { label: "Linked directions", value: `${linkedRecommendations.length}건` },
      { label: "Color profile", value: `${color.season} · ${color.confidence}` },
    ]} />
  </>} input={
    <Panel className="grid gap-6 p-5 sm:p-7">
      <div>
        <p className="app-kicker">Evidence → Meaning → Action</p>
        <h2 className="mt-3 text-xl font-black">근거와 추천 방향을 함께 확인합니다</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">AI 분석값은 수정 가능한 입력칸이 아니라 서버에 저장된 관찰 근거입니다. 근거를 선택하면 사진 레이어와 연결된 방향이 함께 강조됩니다.</p>
      </div>

      <DefinitionRows items={[
        { label: "Face blend", value: snapshot.faceAnalysis.faceShape },
        { label: "Balance", value: snapshot.faceAnalysis.balance },
        { label: "Hairline", value: snapshot.faceAnalysis.hairline },
        { label: "Color", value: `${color.season} / ${color.undertone}` },
        { label: "Confidence", value: snapshot.faceAnalysis.confidence },
      ]} />

      <SurfaceCard className="p-4" data-active-evidence-id={activeEvidenceId ?? "none"}>
        <p className="app-kicker">Focus ribbon</p>
        {activeEvidence ? <div className="mt-3 grid gap-2 text-sm">
          <p><strong>관찰</strong> · {activeEvidence.evidence}</p>
          <p><strong>영향</strong> · {activeEvidence.meaning}</p>
          <p><strong>행동</strong> · {activeEvidence.action}</p>
        </div> : <p className="mt-3 text-sm text-[var(--app-muted)]">왼쪽 근거 목록에서 항목을 선택하세요.</p>}
      </SurfaceCard>

      <div>
        <p className="text-sm font-black">Hair Direction Matrix</p>
        <div className="mt-3 grid gap-2">
          {(linkedRecommendations.length ? linkedRecommendations : snapshot.strategyRecommendations).map((recommendation) => <button
            key={recommendation.axis}
            type="button"
            onClick={() => setActiveEvidenceId(recommendation.evidenceId)}
            aria-pressed={activeEvidenceId === recommendation.evidenceId}
            className="min-h-14 border border-[var(--app-border)] p-3 text-left"
          >
            <span className="text-xs font-black uppercase">{recommendation.axis} · {recommendation.recommendedValue}</span>
            <span className="mt-1 block text-sm">{recommendation.impact}</span>
          </button>)}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--app-muted)]">퍼스널 컬러는 사진 품질과 별도 근거로 연결합니다.</p>
        <Button type="button" variant="secondary" loading={colorLoading} onClick={() => void loadColor()}>저장된 퍼스널 컬러 연결</Button>
      </div>
      <SaveStageButton
        loading={saving}
        disabled={!snapshot.evidence.reviewedAt}
        onClick={() => void mutate({
          faceAnalysis: snapshot.faceAnalysis,
          personalColor: color,
          completeStage: "analysis",
          currentStage: "direction",
        })}
      />
    </Panel>
  } />;
}
