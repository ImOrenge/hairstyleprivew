"use client";

import { useMemo, useState } from "react";
import type { MakeupArtistBrief, MakeupRoutine } from "@hairfit/shared/makeup";
import { Button } from "../../ui/Button";
import { SurfaceCard } from "../workbenches/shared";

const LABELS = { base: "베이스", brow: "눈썹", eyeshadow: "아이섀도", eyeliner: "아이라인", blush: "블러셔", lip: "립", lashes: "속눈썹" } as const;

export function MakeupOutputs({ sessionId, routine, brief, onRefresh }: { sessionId: string; routine: MakeupRoutine | null; brief: MakeupArtistBrief | null; onRefresh: () => Promise<void> }) {
  const [working, setWorking] = useState(false); const [error, setError] = useState("");
  const [includeSourcePhoto, setIncludeSourcePhoto] = useState(false); const [share, setShare] = useState<{ token: string; url: string; expiresAt: string; sourcePhotoIncluded: boolean } | null>(null);
  const productTerms = useMemo(() => [...new Set(routine?.steps.flatMap((step) => step.productSearchTerms) ?? [])], [routine]);
  const createArtifacts = async () => {
    setWorking(true); setError("");
    try {
      const responses = await Promise.all([fetch(`/api/consultations/${encodeURIComponent(sessionId)}/makeup/routine`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), fetch(`/api/consultations/${encodeURIComponent(sessionId)}/makeup/brief`, { method: "POST" })]);
      if (responses.some((response) => !response.ok)) throw new Error("실행 문서를 다시 만들지 못했습니다.");
      await onRefresh();
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "실행 문서를 만들지 못했습니다."); }
    finally { setWorking(false); }
  };
  const createShare = async () => {
    setWorking(true); setError("");
    try {
      const response = await fetch(`/api/consultations/${encodeURIComponent(sessionId)}/makeup/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hours: 168, includeSourcePhoto }) });
      const data = await response.json() as { token?: string; expiresAt?: string; sourcePhotoIncluded?: boolean; error?: string };
      if (!response.ok || !data.token || !data.expiresAt) throw new Error(data.error ?? "공유 링크를 만들지 못했습니다.");
      setShare({ token: data.token, expiresAt: data.expiresAt, sourcePhotoIncluded: data.sourcePhotoIncluded === true, url: `${window.location.origin}/makeup/share/${data.token}` });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "공유 링크를 만들지 못했습니다."); }
    finally { setWorking(false); }
  };
  const revokeShare = async () => {
    if (!share) return; setWorking(true); setError("");
    try { const response = await fetch(`/api/consultations/${encodeURIComponent(sessionId)}/makeup/share/${encodeURIComponent(share.token)}`, { method: "DELETE" }); if (!response.ok) throw new Error("공유를 취소하지 못했습니다."); setShare(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "공유를 취소하지 못했습니다."); }
    finally { setWorking(false); }
  };
  if (!routine || !brief) return <SurfaceCard className="p-5"><p className="app-kicker">Execution documents</p><h2 className="mt-2 text-lg font-black">셀프 루틴과 아티스트 브리프를 준비합니다</h2><p className="mt-2 text-sm text-[var(--app-muted)]">확정 스냅샷만 사용하며 OFF 모듈은 루틴에서 제외합니다.</p><div className="mt-4"><Button type="button" loading={working} onClick={() => void createArtifacts()}>실행 문서 다시 만들기</Button></div>{error ? <p role="alert" className="mt-3 text-sm text-red-400">{error}</p> : null}</SurfaceCard>;
  return <section className="grid gap-5 lg:grid-cols-2">
    <SurfaceCard className="p-5"><p className="app-kicker">Self makeup</p><div className="mt-2 flex items-end justify-between gap-3"><h2 className="text-lg font-black">{routine.mode === "compact" ? "컴팩트" : "풀"} 루틴</h2><strong>{Math.ceil(routine.estimatedSeconds / 60)}분 이내</strong></div><ol className="mt-5 grid gap-3">{routine.steps.map((step) => <li key={`${step.order}-${step.module}`} className="border-t border-[var(--app-border)] pt-3"><div className="flex justify-between gap-3"><strong>{step.order}. {LABELS[step.module]}</strong><span className="text-xs">{step.estimatedSeconds}초</span></div><p className="mt-1 text-sm">{step.instruction}</p><p className="mt-1 text-xs text-[var(--app-muted)]">{step.failurePreventionTips[0]}</p></li>)}</ol></SurfaceCard>
    <div className="grid content-start gap-5"><SurfaceCard className="p-5"><p className="app-kicker">Artist handoff</p><h2 className="mt-2 text-lg font-black">구조화 브리프</h2><p className="mt-2 text-sm text-[var(--app-muted)]">Personal Color profile과 확정 헤어 source를 그대로 잠급니다.</p><dl className="mt-4 grid gap-3 text-sm"><div><dt className="text-[var(--app-muted)]">퍼스널 컬러 source</dt><dd className="font-bold">{brief.source.personalColorProfileId}</dd></div><div><dt className="text-[var(--app-muted)]">확정 헤어 source</dt><dd className="font-bold">{brief.source.selectedStyleId}</dd></div><div><dt className="text-[var(--app-muted)]">사용 존</dt><dd className="font-bold">{brief.moduleSummaries.filter((item) => item.enabled).map((item) => LABELS[item.module]).join(" · ")}</dd></div></dl></SurfaceCard><SurfaceCard className="p-5"><p className="app-kicker">Product search guide</p><h2 className="mt-2 text-lg font-black">브랜드가 아닌 검색 속성</h2><div className="mt-4 flex flex-wrap gap-2">{productTerms.map((term) => <span key={term} className="border border-[var(--app-border)] px-2 py-1 text-xs font-bold">{term}</span>)}</div></SurfaceCard><SurfaceCard className="p-5"><p className="app-kicker">Share permission</p><h2 className="mt-2 text-lg font-black">아티스트에게 전달</h2><label className="mt-4 flex min-h-11 items-start gap-3 text-sm font-bold"><input type="checkbox" className="mt-1" checked={includeSourcePhoto} onChange={(event) => setIncludeSourcePhoto(event.target.checked)} />원본 사진도 명시적으로 포함</label><p className="text-xs text-[var(--app-muted)]">기본값은 OFF입니다. 사진을 포함하면 보존 만료 시점까지만 링크가 유지됩니다.</p>{share ? <div className="mt-4 border border-[var(--app-border)] p-3 text-sm"><a href={share.url} className="break-all underline" target="_blank" rel="noreferrer">{share.url}</a><p className="mt-2 text-xs">사진 {share.sourcePhotoIncluded ? "포함" : "미포함"} · {new Date(share.expiresAt).toLocaleString("ko-KR")} 만료</p><div className="mt-3"><Button type="button" variant="secondary" loading={working} onClick={() => void revokeShare()}>공유 취소</Button></div></div> : <div className="mt-4"><Button type="button" loading={working} onClick={() => void createShare()}>7일 공유 링크 만들기</Button></div>}{error ? <p role="alert" className="mt-3 text-sm text-red-400">{error}</p> : null}</SurfaceCard></div>
  </section>;
}
