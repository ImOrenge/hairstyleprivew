"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConsultationPatch, ConsultationSnapshot, HairColorCandidateKey, HairColorPreviewRun } from "../../../lib/consulting/contracts";
import { compileHairColorPreviewCandidates, type HairColorPreviewCandidate } from "../../../lib/consulting/color-preview-candidates";
import { consultationStageHref } from "../../../lib/consulting/routes";
import { ConsultationSystemData, Panel, SurfaceCard, WorkbenchGrid } from "./shared";

const ACTIVE_STATES = new Set(["queued", "generating", "quality"]);
const TERMINAL_STATES = new Set(["confirmed", "keep-current", "deferred", "salon-review"]);

type ServerRun = Record<string, unknown>;
type StoredRequest = Partial<{
  candidateKey: HairColorCandidateKey;
  purpose: "exploration" | "final";
  quality: "low" | "medium";
  colorName: string;
  swatchHex: string;
  technique: HairColorPreviewRun["technique"];
  targetLevel: number | null;
  rationale: string[];
  bleachPolicy: string;
  maintenance: string;
  cautions: string[];
}>;

function normalizeRun(run: ServerRun): HairColorPreviewRun | null {
  const request = ((run.quality_result as { request?: StoredRequest } | null)?.request ?? run) as StoredRequest;
  if (!request.candidateKey || !["best-match", "natural", "accent"].includes(request.candidateKey)) return null;
  const state = String(run.state || "queued").replace("_", "-") as HairColorPreviewRun["state"];
  return {
    id: String(run.id),
    candidateKey: request.candidateKey,
    purpose: request.purpose === "final" ? "final" : "exploration",
    quality: request.quality === "medium" ? "medium" : "low",
    state,
    colorName: String(request.colorName || "컬러 후보"),
    swatchHex: String(request.swatchHex || "#4D3426"),
    technique: request.technique || "full",
    targetLevel: typeof request.targetLevel === "number" ? request.targetLevel : null,
    rationale: request.rationale || [],
    bleachPolicy: String(request.bleachPolicy || "현장 모발 진단 후 결정"),
    maintenance: String(request.maintenance || "컬러 전용 케어"),
    cautions: request.cautions || [],
    outputUrl: typeof run.outputUrl === "string" ? run.outputUrl : null,
    outputPath: typeof run.output_path === "string" ? run.output_path : typeof run.outputPath === "string" ? run.outputPath : null,
    inputFingerprint: typeof run.input_fingerprint === "string" ? run.input_fingerprint : typeof run.inputFingerprint === "string" ? run.inputFingerprint : null,
    attemptCount: Number(run.attempt_count ?? run.attemptCount ?? 0),
    heartbeatAt: typeof run.heartbeat_at === "string" ? run.heartbeat_at : typeof run.heartbeatAt === "string" ? run.heartbeatAt : null,
    errorCode: typeof run.error_code === "string" ? run.error_code : typeof run.errorCode === "string" ? run.errorCode : null,
    errorMessage: typeof run.error_message === "string" ? run.error_message : typeof run.errorMessage === "string" ? run.errorMessage : null,
    startedAt: typeof run.started_at === "string" ? run.started_at : typeof run.startedAt === "string" ? run.startedAt : null,
    completedAt: typeof run.completed_at === "string" ? run.completed_at : typeof run.completedAt === "string" ? run.completedAt : null,
    updatedAt: String(run.updated_at || run.updatedAt || new Date().toISOString()),
  };
}

function upsertRun(current: HairColorPreviewRun[], next: HairColorPreviewRun) {
  return [next, ...current.filter((run) => run.id !== next.id)].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function runFor(runs: HairColorPreviewRun[], candidateKey: HairColorCandidateKey, purpose: "exploration" | "final") {
  return runs.find((run) => run.candidateKey === candidateKey && run.purpose === purpose) ?? null;
}

function statusCopy(run: HairColorPreviewRun | null) {
  if (!run)
    return {
      label: "준비 중",
      detail: "퍼스널 컬러 근거를 생성 입력으로 묶고 있어요.",
    };
  if (run.state === "queued") return { label: "생성 대기", detail: "요청을 안전하게 접수했습니다." };
  if (run.state === "generating")
    return {
      label: "AI 생성 중",
      detail: "확정 헤어의 형태와 얼굴을 유지하며 색만 바꾸고 있어요.",
    };
  if (run.state === "quality")
    return {
      label: "품질 확인 중",
      detail: "얼굴·헤어 형태·화면 구도가 유지됐는지 확인하고 있어요.",
    };
  if (run.state === "completed")
    return {
      label: run.purpose === "final" ? "최종 컬러 완성" : "탐색 후보 완성",
      detail: run.purpose === "final" ? "선택 결과를 상담 기록에 연결하고 있어요." : "이 후보를 선택하면 고품질 최종본을 바로 만듭니다.",
    };
  return {
    label: "다시 확인 필요",
    detail: run.errorMessage || "생성 작업을 다시 시작할 수 있습니다.",
  };
}

function CandidateGuidance({ candidate }: { candidate: HairColorPreviewCandidate }) {
  return (
    <SurfaceCard data-color-candidate-key={candidate.key} className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="app-kicker">{candidate.name}</p>
          <h3 className="mt-2 text-lg font-black">{candidate.salonName}</h3>
        </div>
        <span role="img" className="h-10 w-10 shrink-0 rounded-full border border-[var(--app-border-strong)]" style={{ backgroundColor: candidate.swatchHex }} aria-label={`${candidate.salonName} ${candidate.swatchHex}`} />
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">{candidate.rationale[0]}</p>
      <dl className="mt-4 grid gap-2 text-sm">
        <div className="flex justify-between gap-4 border-t border-[var(--app-border)] pt-2">
          <dt className="text-[var(--app-muted)]">Salon level</dt>
          <dd className="font-bold">{candidate.targetLevel ?? "현장 진단"}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-[var(--app-border)] pt-2">
          <dt className="text-[var(--app-muted)]">기법</dt>
          <dd className="font-bold">{candidate.technique}</dd>
        </div>
        <div className="grid gap-1 border-t border-[var(--app-border)] pt-2">
          <dt className="text-[var(--app-muted)]">탈색·구현</dt>
          <dd className="font-bold leading-5">{candidate.bleachPolicy}</dd>
        </div>
        <div className="grid gap-1 border-t border-[var(--app-border)] pt-2">
          <dt className="text-[var(--app-muted)]">유지 관리</dt>
          <dd className="font-bold leading-5">{candidate.maintenance}</dd>
        </div>
      </dl>
    </SurfaceCard>
  );
}

function PreviewCard({ candidate, run, sourceImage, selected, onSelect, disabled }: { candidate: HairColorPreviewCandidate; run: HairColorPreviewRun | null; sourceImage: string | null; selected: boolean; onSelect: () => void; disabled: boolean }) {
  const status = statusCopy(run);
  const ready = run?.state === "completed" && Boolean(run.outputUrl);
  return (
    <article className={`overflow-hidden border bg-[var(--app-surface)] ${selected ? "border-[var(--app-accent)]" : "border-[var(--app-border)]"}`} aria-busy={Boolean(run && ACTIVE_STATES.has(run.state))}>
      <div className="relative aspect-[4/5] overflow-hidden bg-[var(--app-surface-muted)]">
        {ready && run?.outputUrl ? <Image src={run.outputUrl} alt={`${candidate.salonName} AI 염색 탐색 결과`} fill unoptimized loading="eager" className="object-cover" /> : sourceImage ? <Image src={sourceImage} alt="확정 헤어 원본" fill unoptimized loading="eager" className="object-cover opacity-35 grayscale" /> : null}
        {!ready ? (
          <div className="absolute inset-0 grid place-items-center bg-[var(--app-bg)]/35 p-5 text-center">
            <div>
              <span className="mx-auto block h-9 w-9 animate-spin rounded-full border-2 border-[var(--app-border)] border-t-[var(--app-text)] motion-reduce:animate-none" aria-hidden="true" />
              <p className="mt-4 text-sm font-black">{status.label}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--app-muted)]">{status.detail}</p>
            </div>
          </div>
        ) : null}
      </div>
      <div className="grid gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="app-kicker">{candidate.name}</p>
            <h3 className="mt-1 font-black">{candidate.salonName}</h3>
          </div>
          <span className="h-6 w-6 rounded-full border border-[var(--app-border)]" style={{ backgroundColor: candidate.swatchHex }} aria-hidden="true" />
        </div>
        <p className="text-xs leading-5 text-[var(--app-muted)]" role="status">
          {status.detail}
        </p>
        <button type="button" onClick={onSelect} disabled={!ready || disabled} className="min-h-11 border border-[var(--app-border-strong)] px-3 py-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-45">
          {selected ? "최종본 생성 중" : ready ? "이 컬러로 최종 생성" : status.label}
        </button>
      </div>
    </article>
  );
}

export function ColorStudioWorkbench({ snapshot, mutate, saving, pollingEnabled = true }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>; saving: boolean; pollingEnabled?: boolean }) {
  const router = useRouter();
  const selectedStyle = snapshot.selectedStyleHistory.at(-1);
  const candidates = useMemo(() => compileHairColorPreviewCandidates(snapshot), [snapshot]);
  const [runs, setRuns] = useState<HairColorPreviewRun[]>(snapshot.hairColorPreviewRuns);
  const [selectedKey, setSelectedKey] = useState<HairColorCandidateKey | null>(() => snapshot.hairColorPreviewRuns.find((run) => run.purpose === "final")?.candidateKey ?? null);
  const [error, setError] = useState<string | null>(null);
  const [terminalBusy, setTerminalBusy] = useState(false);
  const autoStarted = useRef(false);
  const confirmedRunId = useRef<string | null>(snapshot.colorDecision.generationAttemptId);

  const requestGeneration = useCallback(
    async (candidateKey: HairColorCandidateKey, purpose: "exploration" | "final") => {
      setError(null);
      const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/color-studio/generation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateKey, purpose }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        run?: ServerRun;
        error?: string;
      };
      if (!response.ok || !data.run) throw new Error(data.error || "컬러 미리보기 생성을 시작하지 못했습니다.");
      const run = normalizeRun(data.run);
      if (!run) throw new Error("컬러 생성 응답을 읽지 못했습니다.");
      setRuns((current) => upsertRun(current, run));
      return run;
    },
    [snapshot.sessionId],
  );

  useEffect(() => {
    if (!pollingEnabled || autoStarted.current || !selectedStyle || snapshot.personalColorDiagnosis.state !== "ready" || TERMINAL_STATES.has(snapshot.colorDecision.state)) return;
    const missing = candidates.filter((candidate) => !runFor(runs, candidate.key, "exploration"));
    if (!missing.length) return;
    autoStarted.current = true;
    void Promise.allSettled(missing.map((candidate) => requestGeneration(candidate.key, "exploration"))).then((results) => {
      const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (rejected) setError(rejected.reason instanceof Error ? rejected.reason.message : "일부 컬러 후보 생성을 시작하지 못했습니다.");
    });
  }, [candidates, pollingEnabled, requestGeneration, runs, selectedStyle, snapshot.colorDecision.state, snapshot.personalColorDiagnosis.state]);

  useEffect(() => {
    if (!pollingEnabled) return;
    const active = runs.filter((run) => ACTIVE_STATES.has(run.state));
    if (!active.length) return;
    const timer = window.setInterval(() => {
      void Promise.all(
        active.map(async (run) => {
          const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/color-studio/generation?runId=${encodeURIComponent(run.id)}`, { cache: "no-store" });
          const data = (await response.json().catch(() => ({}))) as {
            run?: ServerRun;
          };
          return response.ok && data.run ? normalizeRun(data.run) : null;
        }),
      ).then((updates) => setRuns((current) => updates.reduce((next, run) => (run ? upsertRun(next, run) : next), current)));
    }, 2500);
    return () => window.clearInterval(timer);
  }, [pollingEnabled, runs, snapshot.sessionId]);

  const selectCandidate = async (candidateKey: HairColorCandidateKey) => {
    if (selectedKey) return;
    setSelectedKey(candidateKey);
    try {
      await requestGeneration(candidateKey, "final");
    } catch (reason) {
      setSelectedKey(null);
      setError(reason instanceof Error ? reason.message : "최종 컬러 생성을 시작하지 못했습니다.");
    }
  };

  const finalRun = selectedKey ? runFor(runs, selectedKey, "final") : null;
  useEffect(() => {
    if (!finalRun || finalRun.state !== "completed" || !finalRun.outputUrl || confirmedRunId.current === finalRun.id) return;
    confirmedRunId.current = finalRun.id;
    void (async () => {
      const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/color-studio/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: finalRun.id }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        snapshot?: Record<string, unknown>;
        error?: string;
      };
      if (!response.ok || !data.snapshot) throw new Error(data.error || "최종 컬러를 상담 기록에 연결하지 못했습니다.");
      await mutate({
        colorDecision: {
          ...snapshot.colorDecision,
          id: String(data.snapshot.id),
          revision: Number(data.snapshot.snapshot_version || 1),
          state: "confirmed",
          selectionSnapshotId: selectedStyle?.id || null,
          personalColorEvidenceId: snapshot.personalColorDiagnosis.evidenceId,
          hairMask: null,
          colorName: finalRun.colorName,
          swatchHex: finalRun.swatchHex,
          technique: finalRun.technique,
          targetLevel: finalRun.targetLevel,
          bleachPolicy: finalRun.bleachPolicy,
          maintenance: finalRun.maintenance,
          warnings: finalRun.cautions,
          finalImageUrl: finalRun.outputUrl,
          finalImagePath: finalRun.outputPath,
          generationAttemptId: finalRun.id,
          inputFingerprint: finalRun.inputFingerprint,
          confirmedAt: String(data.snapshot.confirmed_at || new Date().toISOString()),
          updatedAt: new Date().toISOString(),
        },
      });
      router.push(consultationStageHref(snapshot.sessionId, "salon-brief"));
    })().catch((reason) => {
      confirmedRunId.current = null;
      setError(reason instanceof Error ? reason.message : "컬러 확정에 실패했습니다.");
    });
  }, [finalRun, mutate, router, selectedStyle?.id, snapshot]);

  const confirmTerminal = async (state: "keep-current" | "deferred" | "salon-review") => {
    setTerminalBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/color-studio/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        snapshot?: Record<string, unknown>;
        error?: string;
      };
      if (!response.ok || !data.snapshot) throw new Error(data.error || "컬러 선택을 저장하지 못했습니다.");
      await mutate({
        colorDecision: {
          ...snapshot.colorDecision,
          id: String(data.snapshot.id),
          revision: Number(data.snapshot.snapshot_version || 1),
          state,
          colorName: state === "keep-current" ? "현재 색상 유지" : snapshot.colorDecision.colorName,
          hairMask: null,
          confirmedAt: String(data.snapshot.confirmed_at || new Date().toISOString()),
          inputFingerprint: String(data.snapshot.input_fingerprint || ""),
          updatedAt: new Date().toISOString(),
        },
      });
      router.push(consultationStageHref(snapshot.sessionId, "salon-brief"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "컬러 선택을 저장하지 못했습니다.");
    } finally {
      setTerminalBusy(false);
    }
  };

  const completedExplorations = candidates.filter((candidate) => runFor(runs, candidate.key, "exploration")?.state === "completed").length;
  const activeCount = runs.filter((run) => ACTIVE_STATES.has(run.state)).length;
  const diagnosisReady = snapshot.personalColorDiagnosis.state === "ready";

  return (
    <WorkbenchGrid
      inputLabel="퍼스널 컬러 기반 염색 방향"
      outputLabel="AI 염색 후보와 생성 상태"
      input={
        <>
          <Panel className="grid gap-5 p-5">
            <div>
              <p className="app-kicker">Personal color direction</p>
              <h2 className="mt-2 text-xl font-black">진단 근거가 세 가지 염색 방향이 됩니다</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">마스크나 강도 슬라이더를 조절하지 않습니다. 확정 헤어와 퍼스널 컬러, 손상도·관리 조건을 서버가 고정한 뒤 후보를 자동 생성합니다.</p>
            </div>
            {diagnosisReady ? (
              <div className="grid gap-3 border-y border-[var(--app-border)] py-4">
                <div>
                  <p className="text-xs font-black uppercase text-[var(--app-muted)]">Primary type</p>
                  <p className="mt-1 text-lg font-black">{snapshot.personalColorDiagnosis.primaryType?.replaceAll("_", " ")}</p>
                </div>
                <p className="text-sm leading-6 text-[var(--app-muted)]">{snapshot.personalColorDiagnosis.summary}</p>
                <div className="flex flex-wrap gap-2">
                  {snapshot.personalColorDiagnosis.palette.best.slice(0, 5).map((hex) => (
                    <span key={hex} className="inline-flex items-center gap-2 border border-[var(--app-border)] px-2 py-1 text-xs font-bold">
                      <span className="h-4 w-4 rounded-full border border-[var(--app-border)]" style={{ backgroundColor: hex }} aria-hidden="true" />
                      {hex}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border border-[var(--app-danger)] p-4 text-sm leading-6">
                <p className="font-black">퍼스널 컬러 진단이 먼저 필요합니다.</p>
                <Link href={consultationStageHref(snapshot.sessionId, "personal-color")} className="mt-2 inline-block underline">
                  진단 화면으로 이동
                </Link>
              </div>
            )}
            <div className="grid gap-3">
              {candidates.map((candidate) => (
                <CandidateGuidance key={candidate.key} candidate={candidate} />
              ))}
            </div>
          </Panel>
          <Panel className="grid gap-3 p-5">
            <p className="app-kicker">다른 선택</p>
            <h2 className="text-lg font-black">생성 없이 상담을 이어갈 수도 있어요</h2>
            <p className="text-sm leading-6 text-[var(--app-muted)]">현재 색상을 유지하거나 살롱 현장 검토로 넘겨도 Brief에는 결정 이유가 남습니다.</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <button type="button" disabled={terminalBusy || saving || Boolean(selectedKey)} onClick={() => void confirmTerminal("keep-current")} className="min-h-11 border border-[var(--app-border)] px-3 text-sm font-black disabled:opacity-45">
                현재 색상 유지
              </button>
              <button type="button" disabled={terminalBusy || saving || Boolean(selectedKey)} onClick={() => void confirmTerminal("salon-review")} className="min-h-11 border border-[var(--app-border)] px-3 text-sm font-black disabled:opacity-45">
                살롱에서 결정
              </button>
              <button type="button" disabled={terminalBusy || saving || Boolean(selectedKey)} onClick={() => void confirmTerminal("deferred")} className="min-h-11 border border-[var(--app-border)] px-3 text-sm font-black disabled:opacity-45">
                나중에 결정
              </button>
            </div>
          </Panel>
        </>
      }
      output={
        <>
          <Panel className="grid gap-4 p-5" aria-live="polite" aria-busy={activeCount > 0}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="app-kicker">컬러 후보 비교</p>
                <h2 className="mt-2 text-xl font-black">완성되는 후보부터 바로 비교하세요</h2>
              </div>
              <p className="text-sm font-black">{completedExplorations} / 3 탐색 완료</p>
            </div>
            <p className="text-sm leading-6 text-[var(--app-muted)]">세 후보를 함께 준비합니다. 첫 결과가 나오면 기다리지 않고 선택할 수 있고, 선택한 컬러는 더 선명한 최종 이미지로 이어집니다.</p>
            {error ? (
              <div role="alert" className="border border-[var(--app-danger)] p-3 text-sm font-bold">
                {error}
              </div>
            ) : null}
            <div className="grid gap-4 xl:grid-cols-3">
              {candidates.map((candidate) => (
                <PreviewCard key={candidate.key} candidate={candidate} run={runFor(runs, candidate.key, "exploration")} sourceImage={selectedStyle?.imageUrl || null} selected={selectedKey === candidate.key} onSelect={() => void selectCandidate(candidate.key)} disabled={Boolean(selectedKey) || terminalBusy || saving} />
              ))}
            </div>
          </Panel>
          {selectedKey ? (
            <Panel className="grid gap-4 p-5" aria-live="polite" aria-busy={!finalRun || ACTIVE_STATES.has(finalRun.state)}>
              <div>
                <p className="app-kicker">최종 컬러 준비</p>
                <h2 className="mt-2 text-xl font-black">선택한 컬러를 고품질로 마무리하고 있어요</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,180px)_1fr]">
                <div className="relative aspect-[4/5] overflow-hidden bg-[var(--app-surface-muted)]">{finalRun?.outputUrl ? <Image src={finalRun.outputUrl} alt="최종 염색 결과" fill unoptimized className="object-cover" /> : selectedStyle?.imageUrl ? <Image src={selectedStyle.imageUrl} alt="확정 헤어 원본" fill unoptimized className="object-cover opacity-40" /> : null}</div>
                <div className="grid content-start gap-3">
                  <p className="text-lg font-black">{candidates.find((candidate) => candidate.key === selectedKey)?.salonName}</p>
                  <p className="text-sm leading-6 text-[var(--app-muted)]">{statusCopy(finalRun).detail}</p>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--app-surface-muted)]">
                    <div className={`h-full bg-[var(--app-text)] transition-all ${finalRun?.state === "completed" ? "w-full" : finalRun?.state === "quality" ? "w-4/5" : finalRun?.state === "generating" ? "w-2/5" : "w-1/5"}`} />
                  </div>
                  <p className="text-xs font-black uppercase">{statusCopy(finalRun).label}</p>
                </div>
              </div>
            </Panel>
          ) : null}
          <ConsultationSystemData snapshot={snapshot} />
        </>
      }
    />
  );
}
