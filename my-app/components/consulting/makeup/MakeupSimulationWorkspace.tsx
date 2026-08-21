"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import type { MakeupSimulationOutputV1, MakeupSimulationRunV1, MakeupSimulationSelectionSnapshotV1, MakeupWorkspaceStateV2 } from "@hairfit/shared/makeup";
import { Button } from "../../ui/Button";
import { Panel, SurfaceCard } from "../workbenches/shared";

type SimulationPayload = { run: MakeupSimulationRunV1 | null; outputs: MakeupSimulationOutputV1[]; selection: MakeupSimulationSelectionSnapshotV1 | null; workspaceState: MakeupWorkspaceStateV2 };
const WAITING = ["확정한 메이크업 기준을 정리하고 있어요.", "얼굴과 헤어를 그대로 유지하며 메이크업만 적용하고 있어요.", "과한 보정이나 형태 변화가 없는지 확인하고 있어요.", "완성된 결과를 비교 화면에 연결하고 있어요."];

export function MakeupSimulationWorkspace({ sessionId, sourcePhotoUrl, initial, onConfirmed }: { sessionId: string; sourcePhotoUrl: string | null; initial: SimulationPayload | null; onConfirmed?: () => Promise<unknown> | unknown }) {
  const baseUrl = `/api/consultations/${encodeURIComponent(sessionId)}/makeup/simulations`;
  const [state, setState] = useState<SimulationPayload | null>(initial);
  const [messageIndex, setMessageIndex] = useState(0);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => { const response = await fetch(baseUrl, { cache: "no-store" }); const data = await response.json() as SimulationPayload & { error?: string }; if (!response.ok) throw new Error(data.error || "시뮬레이션 상태를 불러오지 못했습니다."); setState(data); return data; }, [baseUrl]);
  useEffect(() => {
    if (state?.run || state?.selection) return;
    let cancelled = false;
    void fetch(baseUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(async (response) => { if (!response.ok) { const data = await response.json().catch(() => null) as { error?: string } | null; throw new Error(data?.error || "시뮬레이션을 시작하지 못했습니다."); } return load(); }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "시뮬레이션을 시작하지 못했습니다."); });
    return () => { cancelled = true; };
  }, [baseUrl, load, state?.run, state?.selection]);
  const waiting = state && ["simulation_queued", "simulation_generating", "simulation_partial"].includes(state.workspaceState);
  useEffect(() => { if (!waiting) return; const timer = window.setInterval(() => setMessageIndex((value) => (value + 1) % WAITING.length), 2200); return () => window.clearInterval(timer); }, [waiting]);
  useEffect(() => { if (!waiting) return; const timer = window.setTimeout(() => void load().catch(() => undefined), 1500); return () => window.clearTimeout(timer); }, [load, waiting, state?.run?.updatedAt]);
  const retry = async () => { if (!state?.run) return; setWorking(true); setError(""); try { const response = await fetch(`${baseUrl}/${encodeURIComponent(state.run.id)}/retry`, { method: "POST" }); if (!response.ok) { const data = await response.json().catch(() => null) as { error?: string } | null; throw new Error(data?.error || "다시 시도하지 못했습니다."); } await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "다시 시도하지 못했습니다."); } finally { setWorking(false); } };
  const confirm = async (output: MakeupSimulationOutputV1) => { if (!state?.run) return; setWorking(true); setError(""); try { const response = await fetch(`${baseUrl}/${encodeURIComponent(state.run.id)}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outputId: output.id }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || "시뮬레이션을 확정하지 못했습니다."); await load(); await onConfirmed?.(); } catch (reason) { setError(reason instanceof Error ? reason.message : "시뮬레이션을 확정하지 못했습니다."); } finally { setWorking(false); } };
  if (!state || waiting) return <Panel className="grid min-h-72 place-items-center p-6 text-center" aria-live="polite" data-makeup-simulation-state={state?.workspaceState ?? "simulation_queued"}><div><div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-[var(--app-border)] border-t-[var(--app-accent)] motion-reduce:animate-none" aria-hidden="true" /><p className="app-kicker mt-5">Makeup simulation</p><h2 className="mt-2 text-xl font-black">메이크업 스타일 시뮬레이션을 준비하고 있어요</h2><p className="mt-3 text-sm text-[var(--app-muted)]">{WAITING[messageIndex]}</p><p className="mt-5 text-xs text-[var(--app-muted)]">기다리는 동안 상담을 나가도 작업과 결과는 서버에 유지됩니다.</p>{error ? <p role="alert" className="mt-4 text-sm text-red-400">{error}</p> : null}</div></Panel>;
  if (["simulation_retry_required", "simulation_failed"].includes(state.workspaceState)) return <Panel className="p-6" data-makeup-simulation-state={state.workspaceState}><p className="app-kicker">Makeup simulation</p><h2 className="mt-2 text-xl font-black">시뮬레이션을 마무리하지 못했어요</h2><p className="mt-3 text-sm text-[var(--app-muted)]">{state.run?.errorMessage || "이미 준비된 메이크업 방향은 유지됩니다. 실패한 생성만 다시 시도할 수 있습니다."}</p><Button className="mt-5" loading={working} onClick={() => void retry()}>시뮬레이션 다시 시도</Button></Panel>;
  const output = state.outputs.find((item) => item.id === state.selection?.outputId) ?? state.outputs.find((item) => item.state === "ready") ?? null;
  if (!output?.imageUrl) return <Panel className="p-6"><p className="text-sm">완성된 시뮬레이션 이미지를 불러오는 중입니다.</p></Panel>;
  return <div className="grid gap-5" data-makeup-simulation-state={state.workspaceState}>
    <Panel className="p-5 sm:p-7"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="app-kicker">Before / After</p><h2 className="mt-2 text-xl font-black">메이크업 스타일 시뮬레이션</h2></div>{state.selection ? <span className="border border-emerald-500/50 px-3 py-2 text-sm font-black text-emerald-300">확정됨</span> : null}</div><div className="mt-5 grid gap-3 sm:grid-cols-2">{sourcePhotoUrl ? <figure><Image src={sourcePhotoUrl} alt="메이크업 적용 전 원본" width={720} height={900} unoptimized className="aspect-[4/5] w-full object-cover" /><figcaption className="mt-2 text-xs font-black">BEFORE</figcaption></figure> : null}<figure><Image src={output.imageUrl} alt="메이크업 스타일 시뮬레이션" width={720} height={900} unoptimized className="aspect-[4/5] w-full object-cover" /><figcaption className="mt-2 text-xs font-black">SIMULATION</figcaption></figure></div></Panel>
    <SurfaceCard className="p-5"><p className="app-kicker">Applied direction</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{output.moduleSummary.map((item) => <article key={item.module} className="border-l-2 border-[var(--app-accent)] pl-3"><h3 className="font-black">{item.module}</h3><p className="mt-1 text-sm">{item.color} · {item.finish}</p><p className="text-xs text-[var(--app-muted)]">강도 {item.intensity}%</p></article>)}</div>{output.quality.warnings.map((warning) => <p key={warning} className="mt-4 text-xs text-[var(--app-muted)]">· {warning}</p>)}<p className="mt-4 border-t border-[var(--app-border)] pt-3 text-xs leading-5 text-[var(--app-muted)]">이 이미지는 선택한 메이크업 방향을 이해하기 위한 스타일 시뮬레이션입니다. 실제 발색과 질감은 피부 상태, 제품, 조명, 적용 방법에 따라 달라질 수 있습니다.</p>{!state.selection ? <Button className="mt-5" loading={working} onClick={() => void confirm(output)}>이 이미지로 메이크업 확정</Button> : null}{error ? <p role="alert" className="mt-3 text-sm text-red-400">{error}</p> : null}</SurfaceCard>
  </div>;
}
