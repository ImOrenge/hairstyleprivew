"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { consultationConfidenceLabel, consultationEvidenceLayerLabel, type ConsultationAnalysisRun, type ConsultationPatch, type ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { consultationStageHrefForPath } from "../../../lib/consulting/routes";
import { ConsultationPhotoEvidence } from "../photo/ConsultationPhotoEvidence";
import { ConsultationSystemData, Panel, SurfaceCard, WorkbenchGrid } from "./shared";

function runStateCopy(run: ConsultationAnalysisRun | null, ready: boolean) {
  if (run?.state === "retry_required") return run.errorMessage || "사진 조건을 보완하면 분석을 다시 시작할 수 있어요.";
  if (["failed", "cancelled"].includes(run?.state ?? "")) return run?.errorMessage || "분석을 끝내지 못했어요. 사진을 확인한 뒤 다시 시도해 주세요.";
  if (ready) return "분석이 끝났어요. 얼굴과 모발에서 확인한 근거를 바로 볼 수 있습니다.";
  return "사진 품질, 얼굴 기준점, 모발 특성을 차례로 확인하고 있어요.";
}

export function ScanWorkbench({ snapshot }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>; saving: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [run, setRun] = useState<ConsultationAnalysisRun | null>(snapshot.analysisRun);
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(snapshot.evidence.items[0]?.id ?? null);
  const ready = snapshot.evidence.items.length > 0 || run?.state === "completed";
  const analysisHref = consultationStageHrefForPath(snapshot.sessionId, "analysis", pathname);
  const photoHref = consultationStageHrefForPath(snapshot.sessionId, "photo", pathname);

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const poll = async () => {
      const response = await fetch(`/api/consultations/${encodeURIComponent(snapshot.sessionId)}/photo-analysis`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        run?: ConsultationAnalysisRun | null;
      };
      if (stopped) return;
      if (response.ok) setRun(data.run ?? null);
      if (data.run?.state === "completed") {
        timer = window.setTimeout(() => {
          router.replace(analysisHref);
          router.refresh();
        }, 1200);
        return;
      }
      if (!data.run || !["retry_required", "failed", "cancelled"].includes(data.run.state)) timer = window.setTimeout(poll, 1200);
    };
    if (snapshot.evidence.items.length) timer = window.setTimeout(() => router.replace(analysisHref), 1200);
    else void poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [analysisHref, router, snapshot.evidence.items.length, snapshot.sessionId]);

  const needsRecovery = ["retry_required", "failed", "cancelled"].includes(run?.state ?? "");
  return (
    <WorkbenchGrid
      inputLabel="분석 진행 상태"
      inputHeading="현재 하는 일"
      inputDescription="사진을 바꾸거나 다시 시작해야 할 때만 선택이 필요해요."
      outputLabel="준비된 분석 근거"
      outputHeading="곧 받는 결과"
      outputDescription="완료된 근거는 다음 화면에서 자세히 확인할 수 있어요."
      input={
        <Panel className="grid gap-4 p-5 sm:p-7">
          <div>
            <p className="text-sm font-black">AI 분석 자동 진행</p>
            <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">사진 품질을 먼저 확인한 뒤 얼굴 윤곽, 모발 특성, 추천에 필요한 근거를 순서대로 정리합니다. 이 화면에서는 분석값을 수정하지 않습니다.</p>
          </div>
          <SurfaceCard className="p-4 text-sm leading-6" aria-live="polite">
            <strong className="block">{ready ? "분석 완료" : needsRecovery ? "사진 확인 필요" : "분석 중"}</strong>
            <span className="mt-1 block text-[var(--app-muted)]">{runStateCopy(run, ready)}</span>
          </SurfaceCard>
          {ready ? (
            <Link href={analysisHref} className="inline-flex min-h-12 items-center justify-center border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 text-sm font-black text-[var(--app-inverse-text)]">
              분석 결과 보기
            </Link>
          ) : null}
          {needsRecovery ? (
            <Link href={photoHref} className="inline-flex min-h-12 items-center justify-center border border-[var(--app-border-strong)] px-4 text-sm font-black">
              사진 확인하고 다시 시도하기
            </Link>
          ) : null}
        </Panel>
      }
      output={
        <>
          <ConsultationPhotoEvidence sessionId={snapshot.sessionId} enabled={Boolean(snapshot.photo.draftId && snapshot.photo.usageScopes.includes("analysis"))} activeEvidenceId={activeEvidenceId} onEvidenceSelect={setActiveEvidenceId} />
          <SurfaceCard className="p-5">
            <p className="app-kicker">확인한 분석 근거</p>
            <h2 className="mt-3 text-xl font-black">관찰과 추천을 구분해 보여드려요</h2>
            <div className="mt-4 grid gap-3">
              {snapshot.evidence.items.length ? (
                snapshot.evidence.items.map((item) => (
                  <button key={item.id} type="button" onClick={() => setActiveEvidenceId(item.id)} aria-pressed={activeEvidenceId === item.id} className="min-h-16 border-l-2 border-[var(--app-accent)] p-3 text-left">
                    <span className="text-xs font-black">
                      {consultationEvidenceLayerLabel(item.layer)} · 신뢰도 {consultationConfidenceLabel(item.confidence)}
                    </span>
                    <span className="mt-1 block text-sm leading-6">{item.evidence}</span>
                  </button>
                ))
              ) : (
                <p className="text-sm text-[var(--app-muted)]">분석이 끝나는 대로 근거가 여기에 표시됩니다.</p>
              )}
            </div>
          </SurfaceCard>
          <ConsultationSystemData snapshot={snapshot} />
        </>
      }
    />
  );
}
