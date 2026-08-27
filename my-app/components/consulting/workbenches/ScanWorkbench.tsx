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
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [pollRevision, setPollRevision] = useState(0);
  const currentRunMatches = Boolean(run && snapshot.photo.analysisRunId === run.id);
  const legacyReady = !snapshot.photo.analysisRunId && snapshot.evidence.items.length > 0 && run?.state === "completed";
  const ready = (currentRunMatches && run?.state === "completed") || legacyReady;
  const visibleEvidence = ready ? snapshot.evidence.items : [];
  const analysisHref = consultationStageHrefForPath(snapshot.sessionId, "analysis", pathname);
  const photoHref = consultationStageHrefForPath(snapshot.sessionId, "photo", pathname);

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    let attempt = 0;
    const startedAt = Date.now();
    const poll = async () => {
      const controller = new AbortController();
      const requestTimeout = window.setTimeout(() => controller.abort(), 12_000);
      let response: Response | null = null;
      let data = {} as { run?: ConsultationAnalysisRun | null };
      try {
        response = await fetch(`/api/consultations/${encodeURIComponent(snapshot.sessionId)}/photo-analysis`, { cache: "no-store", signal: controller.signal });
        data = (await response.json().catch(() => ({}))) as { run?: ConsultationAnalysisRun | null };
      } catch {
        if (!stopped) setConnectionError("분석 상태 연결이 잠시 끊겼습니다. 자동으로 다시 확인하고 있어요.");
      } finally {
        window.clearTimeout(requestTimeout);
      }
      if (stopped) return;
      if (response?.ok) {
        setConnectionError(null);
        setRun(data.run ?? null);
      }
      if (data.run?.state === "completed" && (!snapshot.photo.analysisRunId || data.run.id === snapshot.photo.analysisRunId)) {
        timer = window.setTimeout(() => {
          router.refresh();
          router.replace(analysisHref);
        }, 600);
        return;
      }
      if (data.run && ["failed", "cancelled"].includes(data.run.state)) return;
      if (data.run?.state === "retry_required" && data.run.retryable === false) return;
      if (Date.now() - startedAt >= 120_000) {
        setTimedOut(true);
        return;
      }
      attempt += 1;
      const delay = Math.min(8_000, 1_200 * (2 ** Math.floor(attempt / 4)));
      timer = window.setTimeout(poll, delay);
    };
    if (legacyReady) timer = window.setTimeout(() => router.replace(analysisHref), 600);
    else void poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [analysisHref, legacyReady, pollRevision, router, snapshot.photo.analysisRunId, snapshot.sessionId]);

  const needsNewPhoto = ["failed", "cancelled"].includes(run?.state ?? "") || (run?.state === "retry_required" && run.retryable === false);
  const resume = async () => {
    setResuming(true);
    setConnectionError(null);
    try {
      const response = await fetch(`/api/consultations/${encodeURIComponent(snapshot.sessionId)}/photo-analysis`, { method: "PUT" });
      const data = (await response.json().catch(() => ({}))) as { run?: ConsultationAnalysisRun; error?: string };
      if (!response.ok) throw new Error(data.error || "분석을 다시 연결하지 못했습니다.");
      if (data.run) setRun(data.run);
      setTimedOut(false);
      setPollRevision((revision) => revision + 1);
      router.refresh();
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "분석을 다시 연결하지 못했습니다.");
    } finally {
      setResuming(false);
    }
  };
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
            <strong className="block">{ready ? "분석 완료" : needsNewPhoto ? "사진 확인 필요" : timedOut ? "분석이 예상보다 오래 걸리고 있어요" : "분석 중"}</strong>
            <span className="mt-1 block text-[var(--app-muted)]">{runStateCopy(run, ready)}</span>
          </SurfaceCard>
          {connectionError || timedOut ? <p className="border border-[var(--app-warning)] bg-[var(--app-warning-bg)] p-3 text-sm" role="alert">{connectionError ?? "작업은 서버에서 계속됩니다. 다시 연결해 상태를 확인할 수 있어요."}</p> : null}
          {ready ? (
            <Link href={analysisHref} className="inline-flex min-h-12 items-center justify-center border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 text-sm font-black text-[var(--app-inverse-text)]">
              분석 결과 보기
            </Link>
          ) : null}
          {needsNewPhoto ? (
            <Link href={photoHref} className="inline-flex min-h-12 items-center justify-center border border-[var(--app-border-strong)] px-4 text-sm font-black">
              사진 확인하고 다시 시도하기
            </Link>
          ) : null}
          {!ready && !needsNewPhoto && (timedOut || connectionError) ? <button type="button" onClick={() => void resume()} disabled={resuming} className="inline-flex min-h-12 items-center justify-center border border-[var(--app-border-strong)] px-4 text-sm font-black disabled:opacity-60">{resuming ? "다시 연결하는 중…" : "분석 다시 연결하기"}</button> : null}
        </Panel>
      }
      output={
        <>
          <ConsultationPhotoEvidence sessionId={snapshot.sessionId} enabled={Boolean(snapshot.photo.draftId && snapshot.photo.usageScopes.includes("analysis"))} activeEvidenceId={activeEvidenceId} onEvidenceSelect={setActiveEvidenceId} />
          <SurfaceCard className="p-5">
            <p className="app-kicker">확인한 분석 근거</p>
            <h2 className="mt-3 text-xl font-black">관찰과 추천을 구분해 보여드려요</h2>
            <div className="mt-4 grid gap-3">
              {visibleEvidence.length ? (
                visibleEvidence.map((item) => (
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
