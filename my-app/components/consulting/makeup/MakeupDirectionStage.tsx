"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CapabilityResult, CapabilityTaskState } from "@hairfit/shared/consulting/capability";
import { MAKEUP_MODE_LABELS, makeupTechnicalCustomerLabel, type MakeupArtistBrief, type MakeupContextProfile, type MakeupDirectionProfessionalReportEnvelopeV1, type MakeupDirectionSnapshot, type MakeupInterviewProfileV2, type MakeupInterviewTopic, type MakeupModule, type MakeupRationaleNarrativeV1, type MakeupRoutine, type MakeupSemanticProjectionV3, type MakeupSimulationOutputV1, type MakeupSimulationRunV1, type MakeupSimulationSelectionSnapshotV1, type MakeupSourceStaleReason, type MakeupWorkspaceStateV2 } from "@hairfit/shared/makeup";
import type { ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { Button } from "../../ui/Button";
import { Panel, SurfaceCard } from "../workbenches/shared";
import { MakeupContextForm } from "./MakeupContextForm";
import { MakeupDirectionCanvas } from "./MakeupDirectionCanvas";
import { MakeupOutputs } from "./MakeupOutputs";
import { MakeupDirectionInterview } from "./MakeupDirectionInterview";
import { MakeupRecommendationReview } from "./MakeupRecommendationReview";
import { MakeupSimulationWorkspace } from "./MakeupSimulationWorkspace";
import { MakeupProfessionalReportDetails, MakeupProfessionalReportNarrative } from "./MakeupProfessionalReport";

type InterviewPayload = { profile: MakeupInterviewProfileV2; coverage: Array<{ topicId: MakeupInterviewTopic; required: boolean; status: "complete" | "skipped" | "pending" }>; complete: boolean; confirmed: boolean; savedAt: string | null };
type SimulationPayload = { run: MakeupSimulationRunV1 | null; outputs: MakeupSimulationOutputV1[]; selection: MakeupSimulationSelectionSnapshotV1 | null; workspaceState: MakeupWorkspaceStateV2 };
type Payload = { snapshot: MakeupDirectionSnapshot | null; revision: number | null; sourceFingerprint?: string | null; staleSourceReasons: MakeupSourceStaleReason[]; defaultContext: MakeupContextProfile; interviewEnabled?: boolean; interview?: InterviewPayload | null; rationaleAi?: CapabilityResult<MakeupRationaleNarrativeV1> | null; professionalReport?: MakeupDirectionProfessionalReportEnvelopeV1 | null; semanticMap?: CapabilityResult<MakeupSemanticProjectionV3> | null; semanticEnabled?: boolean; denseAtlasEnabled?: boolean; simulationEnabled?: boolean; simulation?: SimulationPayload | null; artifacts?: { routine: MakeupRoutine | null; brief: MakeupArtistBrief | null; share: { active: boolean; expiresAt: string; sourcePhotoIncluded: boolean } | null } };
const STALE_LABELS: Record<MakeupSourceStaleReason, string> = { face_observation_changed: "얼굴 관측", personal_color_changed: "퍼스널 컬러", selected_style_changed: "확정 헤어", input_profile_changed: "입력 프로필" };
const SEMANTIC_WAITING_MESSAGES = ["컬러칩을 실제 메이크업 부위에 연결하고 있어요.", "아이라인과 속눈썹의 눈매 기준을 확인하고 있어요.", "부위별 컬러와 적용 정보를 정리하고 있어요."];
const MODULE_LABELS: Record<MakeupModule, string> = { base: "베이스", brow: "눈썹", eyeshadow: "아이섀도", eyeliner: "아이라인", blush: "볼", lip: "입술", lashes: "속눈썹" };

class JsonRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); this.name = "JsonRequestError"; }
}

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const failure = data as { error?: string; code?: string };
    throw new JsonRequestError(failure.error ?? "요청을 처리하지 못했습니다.", response.status, failure.code);
  }
  return data as Record<string, unknown>;
}

async function fetchMakeupStageData(baseUrl: string, sessionId: string) {
  const [data, evidenceResponse] = await Promise.all([
    jsonRequest(baseUrl).then((value) => value as unknown as Payload),
    fetch(`/api/v2/consultations/${encodeURIComponent(sessionId)}/evidence`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null).catch(() => null),
  ]);
  const sourceImageUrl = (evidenceResponse as { sourceImageUrl?: unknown } | null)?.sourceImageUrl;
  return { data, sourceImageUrl: typeof sourceImageUrl === "string" ? sourceImageUrl : null };
}

export function MakeupDirectionStage({ consultation, onConfirmed }: { consultation: ConsultationSnapshot; onConfirmed?: () => Promise<unknown> | unknown }) {
  const baseUrl = `/api/consultations/${encodeURIComponent(consultation.sessionId)}/makeup`;
  const [payload, setPayload] = useState<Payload | null>(null);
  const [context, setContext] = useState<MakeupContextProfile | null>(null);
  const [activeModule, setActiveModule] = useState<MakeupModule>("base");
  const [sourcePhotoUrl, setSourcePhotoUrl] = useState<string | null>(consultation.photo.primaryUrl);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [semanticLocalState, setSemanticLocalState] = useState<CapabilityTaskState | "idle">("idle");
  const [semanticMessageIndex, setSemanticMessageIndex] = useState(0);
  const semanticDispatchKeyRef = useRef<string | null>(null);
  const reportDispatchKeyRef = useRef<string | null>(null);
  const interviewRevisionRef = useRef<number | null>(null);

  const applyLoadedData = useCallback(({ data, sourceImageUrl }: Awaited<ReturnType<typeof fetchMakeupStageData>>) => {
    interviewRevisionRef.current = data.interview?.profile.revision ?? null;
    setPayload(data);
    setContext(data.snapshot?.context ?? data.defaultContext);
    if (sourceImageUrl) setSourcePhotoUrl(sourceImageUrl);
  }, []);
  const load = useCallback(async () => applyLoadedData(await fetchMakeupStageData(baseUrl, consultation.sessionId)), [applyLoadedData, baseUrl, consultation.sessionId]);

  useEffect(() => {
    let cancelled = false;
    void fetchMakeupStageData(baseUrl, consultation.sessionId).then((result) => {
      if (!cancelled) {
        interviewRevisionRef.current = result.data.interview?.profile.revision ?? null;
        setPayload(result.data);
        setContext(result.data.snapshot?.context ?? result.data.defaultContext);
        if (result.sourceImageUrl) setSourcePhotoUrl(result.sourceImageUrl);
      }
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "메이크업 정보를 불러오지 못했습니다."); });
    return () => { cancelled = true; };
  }, [baseUrl, consultation.sessionId]);

  const semanticDispatchKey = payload?.snapshot?.denseAtlas && !payload.snapshot.denseAtlas.degradedReason
    ? JSON.stringify({ source: payload.sourceFingerprint, context: payload.snapshot.context, modules: payload.snapshot.modules.map((item) => [item.module, item.state, item.direction.enabled]) })
    : null;

  useEffect(() => {
    if (!payload?.semanticEnabled || !semanticDispatchKey || payload.semanticMap || semanticDispatchKeyRef.current === semanticDispatchKey) return;
    semanticDispatchKeyRef.current = semanticDispatchKey;
    let cancelled = false;
    setSemanticLocalState("queued");
    void jsonRequest(`${baseUrl}/semantic-map`, { method: "POST", body: "{}" }).then((result) => {
      if (cancelled) return;
      const semanticMap = (result as { semanticMap?: CapabilityResult<MakeupSemanticProjectionV3> }).semanticMap ?? null;
      setPayload((current) => current ? { ...current, semanticMap } : current);
      setSemanticLocalState(semanticMap?.state ?? "waiting");
    }).catch(() => {
      if (!cancelled) setSemanticLocalState("failed");
    });
    return () => { cancelled = true; };
  }, [baseUrl, payload?.semanticEnabled, payload?.semanticMap, semanticDispatchKey]);

  const semanticState = payload?.semanticMap?.state ?? semanticLocalState;
  const semanticWaiting = ["queued", "waiting", "running", "partial"].includes(semanticState);
  const semanticPolling = Boolean(payload?.semanticMap && ["queued", "waiting", "running", "partial"].includes(payload.semanticMap.state));
  useEffect(() => {
    if (!semanticWaiting) return;
    const timer = window.setInterval(() => setSemanticMessageIndex((current) => (current + 1) % SEMANTIC_WAITING_MESSAGES.length), 2200);
    return () => window.clearInterval(timer);
  }, [semanticWaiting]);

  useEffect(() => {
    if (!semanticPolling) return;
    const timer = window.setInterval(() => void load().catch(() => undefined), 1500);
    return () => window.clearInterval(timer);
  }, [load, semanticPolling]);

  const reportState = payload?.professionalReport?.state ?? null;
  const reportCanEnhance = payload?.professionalReport?.canEnhance ?? false;
  const confirmedSnapshotId = payload?.snapshot?.confirmedAt ? payload.snapshot.id : null;

  useEffect(() => {
    if (!confirmedSnapshotId || !reportCanEnhance || reportState !== "fallback" || reportDispatchKeyRef.current === confirmedSnapshotId) return;
    reportDispatchKeyRef.current = confirmedSnapshotId;
    void jsonRequest(`${baseUrl}/report`, { method: "POST", body: "{}" }).then((value) => {
      const professionalReport = (value as { professionalReport?: MakeupDirectionProfessionalReportEnvelopeV1 }).professionalReport;
      if (professionalReport) setPayload((current) => current ? { ...current, professionalReport } : current);
    }).catch(() => setPayload((current) => current?.professionalReport ? { ...current, professionalReport: { ...current.professionalReport, state: "failed" } } : current));
  }, [baseUrl, confirmedSnapshotId, reportCanEnhance, reportState]);

  useEffect(() => {
    if (reportState !== "preparing") return;
    const timer = window.setInterval(() => void load().catch(() => undefined), 1500);
    return () => window.clearInterval(timer);
  }, [load, reportState]);

  const saveAndBuild = async () => {
    if (!context) return;
    setWorking(true); setError("");
    try {
      const saved = await jsonRequest(`${baseUrl}/context`, { method: "PUT", body: JSON.stringify(context) }) as unknown as { revision: number };
      await jsonRequest(`${baseUrl}/build`, { method: "POST", body: JSON.stringify({ expectedRevision: saved.revision }) });
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "방향 맵을 만들지 못했습니다."); }
    finally { setWorking(false); }
  };

  const confirm = async () => {
    if (!payload?.snapshot || payload.revision === null) return;
    setWorking(true); setError("");
    try {
      await jsonRequest(`${baseUrl}/confirm`, { method: "POST", body: JSON.stringify({ snapshotId: payload.snapshot.id, expectedRevision: payload.revision }) });
      await load(); await onConfirmed?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "메이크업 방향을 확정하지 못했습니다."); }
    finally { setWorking(false); }
  };

  const retrySemantic = async () => {
    setSemanticLocalState("queued"); setError("");
    try {
      const result = await jsonRequest(`${baseUrl}/semantic-map/retry`, { method: "POST", body: "{}" }) as { semanticMap?: CapabilityResult<MakeupSemanticProjectionV3> };
      setPayload((current) => current ? { ...current, semanticMap: result.semanticMap ?? null } : current);
      setSemanticLocalState(result.semanticMap?.state ?? "waiting");
    } catch (reason) {
      setSemanticLocalState("failed");
      setError(reason instanceof Error ? reason.message : "부위 연결 정보를 다시 불러오지 못했습니다.");
    }
  };

  const saveInterview = async (topic: MakeupInterviewTopic, profile: MakeupInterviewProfileV2, skip?: boolean) => {
    if (!payload?.interview) throw new Error("인터뷰를 불러오지 못했습니다.");
    const expectedRevision = interviewRevisionRef.current ?? payload.interview.profile.revision;
    const result = await jsonRequest(`${baseUrl}/interview`, { method: "PATCH", body: JSON.stringify({ expectedRevision, topic, profile, skip }) }) as unknown as InterviewPayload;
    interviewRevisionRef.current = result.profile.revision;
    setPayload((current) => current ? { ...current, interview: result } : current);
    return result.profile;
  };

  const confirmInterview = async (profile: MakeupInterviewProfileV2) => {
    setWorking(true); setError("");
    try {
      await jsonRequest(`${baseUrl}/interview/confirm`, { method: "POST", body: JSON.stringify({ expectedRevision: profile.revision }) });
      await load();
      void jsonRequest(`${baseUrl}/recommendation/rationale`, { method: "POST", body: "{}" }).then(() => load()).catch(() => undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "추천 근거를 준비하지 못했습니다."); }
    finally { setWorking(false); }
  };

  const decideRecommendation = async (decision: "accept_adjustment" | "keep_selection") => {
    if (payload?.revision === null || payload?.revision === undefined) return;
    setWorking(true); setError("");
    try { await jsonRequest(`${baseUrl}/recommendation/decision`, { method: "POST", body: JSON.stringify({ expectedRevision: payload.revision, decision }) }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "메이크업 방향을 확정하지 못했습니다."); }
    finally { setWorking(false); }
  };

  const retryRationale = async () => {
    try { await jsonRequest(`${baseUrl}/recommendation/rationale`, { method: "PUT", body: "{}" }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "AI 설명을 다시 요청하지 못했습니다."); }
  };

  const retryProfessionalReport = async () => {
    setError("");
    try {
      const value = await jsonRequest(`${baseUrl}/report`, { method: "PUT", body: "{}" }) as { professionalReport?: MakeupDirectionProfessionalReportEnvelopeV1 };
      if (value.professionalReport) setPayload((current) => current ? { ...current, professionalReport: value.professionalReport } : current);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "AI 해설을 다시 준비하지 못했습니다."); }
  };

  const reopenInterview = async () => {
    if (!payload?.interview) return;
    try { await saveInterview("mode", payload.interview.profile); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "인터뷰를 다시 열지 못했습니다."); }
  };

  if (!payload || !context) return <Panel className="p-6"><p className="app-kicker">Makeup direction</p><h2 className="mt-2 text-xl font-black">얼굴 기준과 컬러 근거를 불러오는 중</h2><p className="mt-3 text-sm text-[var(--app-muted)]">사진을 다시 분석하지 않고 기존 관측 번들을 연결합니다.</p>{error ? <p role="alert" className="mt-4 text-sm text-red-400">{error}</p> : null}</Panel>;

  if (payload.interviewEnabled && payload.interview && !payload.interview.confirmed) return <MakeupDirectionInterview consultationId={consultation.sessionId} value={payload.interview.profile} coverage={payload.interview.coverage} savedAt={payload.interview.savedAt} disabled={working} onSave={saveInterview} onConfirm={confirmInterview} />;

  if (payload.interviewEnabled && payload.snapshot?.rationale?.decision === "pending") return <div className="grid gap-4"><MakeupRecommendationReview rationale={payload.snapshot.rationale} ai={payload.rationaleAi} working={working} onDecision={(decision) => void decideRecommendation(decision)} onRetry={() => void retryRationale()} onEdit={() => void reopenInterview()} />{error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}</div>;

  if (!payload.snapshot || payload.snapshot.status === "context_draft" || payload.staleSourceReasons.length) return <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
    <Panel className="p-6"><p className="app-kicker">Makeup context</p><h2 className="mt-2 text-xl font-black">어떤 표현을 원하는지 먼저 알려주세요</h2>{payload.staleSourceReasons.length ? <div role="alert" className="mt-4 border border-amber-500/50 bg-amber-500/10 p-4 text-sm"><strong>기준 결과가 바뀌었습니다.</strong><p className="mt-1">{payload.staleSourceReasons.map((item) => STALE_LABELS[item]).join(" · ")} 기준으로 다시 계산합니다.</p></div> : null}<div className="mt-6"><MakeupContextForm value={context} onChange={setContext} onSubmit={saveAndBuild} working={working} /></div>{error ? <p role="alert" className="mt-4 text-sm text-red-400">{error}</p> : null}</Panel>
    <SurfaceCard className="p-6"><p className="app-kicker">이어지는 상담 정보</p><h2 className="mt-2 text-lg font-black">이미 확인한 결과를 함께 반영해요</h2><dl className="mt-5 grid gap-3 text-sm"><div><dt className="text-[var(--app-muted)]">얼굴 특징</dt><dd className="font-bold">앞 단계에서 확인한 얼굴 균형</dd></div><div><dt className="text-[var(--app-muted)]">퍼스널 컬러</dt><dd className="font-bold">확정한 추천·주의 팔레트</dd></div><div><dt className="text-[var(--app-muted)]">헤어</dt><dd className="font-bold">확정 스타일의 컬러·앞머리·가르마</dd></div><div><dt className="text-[var(--app-muted)]">제공 결과</dt><dd className="font-bold">얼굴을 바꾸지 않는 적용 위치·방향 안내</dd></div></dl></SurfaceCard>
  </div>;

  const confirmed = payload.snapshot.status === "confirmed" || payload.snapshot.status === "routine_ready" || payload.snapshot.status === "brief_ready";
  if (confirmed) return <div className="grid gap-5" data-makeup-direction-confirmed="true">
    <div className="flex flex-wrap items-center justify-between gap-3 border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
      <div>
        <p className="text-xs font-black text-emerald-300">확정한 메이크업 방향</p>
        <p className="mt-1 font-black">이 방향을 기준으로 해설·루틴·공유 자료를 준비했습니다.</p>
      </div>
      <span className="border border-emerald-500/50 px-3 py-2 text-sm font-black text-emerald-300">확정 완료</span>
    </div>
    {payload.professionalReport ? <MakeupProfessionalReportNarrative report={payload.professionalReport} onRetry={() => void retryProfessionalReport()} /> : <Panel className="p-6"><p className="app-kicker">AI 메이크업 디렉터 리포트</p><h2 className="mt-2 text-xl font-black">확정한 방향을 리포트로 정리하고 있어요</h2></Panel>}
    {payload.simulationEnabled ? <MakeupSimulationWorkspace sessionId={consultation.sessionId} sourcePhotoUrl={sourcePhotoUrl} initial={payload.simulation ?? null} onConfirmed={onConfirmed} /> : null}
    {payload.artifacts?.routine && payload.artifacts.brief ? <MakeupProfessionalReportDetails routine={payload.artifacts.routine} brief={payload.artifacts.brief} /> : null}
    <MakeupOutputs sessionId={consultation.sessionId} routine={payload.artifacts?.routine ?? null} brief={payload.artifacts?.brief ?? null} onRefresh={load} />
    {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
  </div>;
  const semanticProjection = payload.semanticMap?.state === "completed" ? payload.semanticMap.output : null;
  const acceptedMode = payload.snapshot.rationale?.acceptedMode ?? payload.snapshot.context.makeupMode ?? payload.snapshot.interviewProfile?.primaryMode;
  const directionLabel = acceptedMode ? MAKEUP_MODE_LABELS[acceptedMode] : makeupTechnicalCustomerLabel(payload.snapshot.context.presentation);
  const activeModules = payload.snapshot.modules.filter((item) => item.state === "enabled" && item.direction.enabled).map((item) => MODULE_LABELS[item.module]);
  return <div className="grid gap-5">
    <Panel className="p-5 sm:p-6" data-makeup-direction-summary="true">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="app-kicker">AI 추천 메이크업 방향</p>
          <h2 className="mt-2 text-xl font-black sm:text-2xl">{directionLabel}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">퍼스널 컬러와 확정한 헤어, 원하는 분위기와 준비 시간을 함께 반영한 방향입니다.</p>
        </div>
        {payload.interviewEnabled ? <Button variant="ghost" onClick={() => void reopenInterview()}>인터뷰 답변 수정</Button> : null}
      </div>
      {payload.snapshot.rationale ? <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{payload.snapshot.rationale.evidence.slice(0, 3).map((item) => <div key={item.id} className="border-l-2 border-[var(--app-accent)] pl-3"><p className="text-xs font-black text-[var(--app-muted)]">{item.label}</p><p className="mt-1 text-sm font-bold leading-6">{item.finding}</p></div>)}</div> : null}
      <div className="mt-5">
        <p className="text-xs font-black text-[var(--app-muted)]">적용하는 부위</p>
        <div className="mt-2 flex flex-wrap gap-2">{activeModules.map((label) => <span key={label} className="border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-xs font-black">{label}</span>)}</div>
      </div>
    </Panel>
    <Panel className="p-4 sm:p-5">
      <div className="mb-4">
        <p className="app-kicker">메이크업 적용 지도</p>
        <h2 className="mt-1 text-lg font-black">어디에 어떻게 적용할지 확인하세요</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">색상 칩을 선택하면 해당 부위의 바르는 방향과 표현 질감을 확인할 수 있습니다.</p>
      </div>
      <MakeupDirectionCanvas photoUrl={sourcePhotoUrl} modules={payload.snapshot.modules} topology={payload.snapshot.topologyProjection} denseAtlas={payload.denseAtlasEnabled === false ? null : payload.snapshot.denseAtlas} semanticProjection={semanticProjection} activeModule={activeModule} mode="application" onSelect={setActiveModule} />
      {payload.semanticEnabled ? <div className="mt-3 border border-[var(--app-border)] px-3 py-2 text-xs leading-5" role="status" aria-live="polite" data-makeup-semantic-task-state={semanticState}><strong>{semanticProjection ? "부위 연결 기준 준비 완료" : semanticWaiting ? "부위 연결 기준을 확인하는 중" : semanticState === "failed" || semanticState === "retry_required" ? "기본 부위 연결 정보로 계속 진행" : "기본 부위 연결 정보 준비 완료"}</strong>{semanticWaiting ? <p className="text-[var(--app-muted)]">{SEMANTIC_WAITING_MESSAGES[semanticMessageIndex]}</p> : null}{semanticState === "failed" || semanticState === "retry_required" ? <Button type="button" className="mt-2" variant="secondary" onClick={() => void retrySemantic()}>부위 연결 정보 다시 시도</Button> : null}</div> : null}
      <p className="mt-3 text-xs leading-5 text-[var(--app-muted)]">원본 얼굴은 바꾸지 않고, 확정 전 적용 위치와 방향만 안내합니다.</p>
    </Panel>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] pt-5">
      <div>
        <p className="font-black">추천 방향과 적용 부위를 확인했나요?</p>
        <p className="mt-1 text-sm text-[var(--app-muted)]">확정하면 같은 기준으로 전문 해설과 셀프 루틴을 준비합니다.</p>
        {error ? <p role="alert" className="mt-1 text-sm text-red-400">{error}</p> : null}
      </div>
      <Button type="button" loading={working} onClick={() => void confirm()}>이 메이크업 방향으로 확정</Button>
    </div>
  </div>;
}
