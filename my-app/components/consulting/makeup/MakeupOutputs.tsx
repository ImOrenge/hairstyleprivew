"use client";

import { useMemo, useState } from "react";
import type { MakeupArtistBrief, MakeupRoutine } from "@hairfit/shared/makeup";
import { Button } from "../../ui/Button";
import { SurfaceCard } from "../workbenches/shared";

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
  if (!routine || !brief) return <SurfaceCard className="p-5"><p className="app-kicker">메이크업 활용 안내</p><h2 className="mt-2 text-lg font-black">셀프 루틴과 아티스트 전달 내용을 준비합니다</h2><p className="mt-2 text-sm text-[var(--app-muted)]">내가 확정한 메이크업 방향만 반영하고, 사용하지 않기로 한 부위는 루틴에서 제외합니다.</p><div className="mt-4"><Button type="button" loading={working} onClick={() => void createArtifacts()}>활용 안내 다시 만들기</Button></div>{error ? <p role="alert" className="mt-3 text-sm text-red-400">{error}</p> : null}</SurfaceCard>;
  return <section className="grid gap-5 lg:grid-cols-2">
    <SurfaceCard className="p-5"><p className="app-kicker">제품 찾기</p><h2 className="mt-2 text-lg font-black">브랜드와 관계없이 활용할 검색어</h2><p className="mt-2 text-sm text-[var(--app-muted)]">확정된 컬러와 질감을 기준으로 제품 유형을 찾아보세요.</p><div className="mt-4 flex flex-wrap gap-2">{productTerms.map((term) => <span key={term} className="border border-[var(--app-border)] px-2 py-1 text-xs font-bold">{term}</span>)}</div></SurfaceCard>
    <SurfaceCard className="p-5"><p className="app-kicker">공유 범위 선택</p><h2 className="mt-2 text-lg font-black">아티스트에게 리포트 전달</h2><label className="mt-4 flex min-h-11 items-start gap-3 text-sm font-bold"><input type="checkbox" className="mt-1" checked={includeSourcePhoto} onChange={(event) => setIncludeSourcePhoto(event.target.checked)} />원본 사진도 명시적으로 포함</label><p className="text-xs text-[var(--app-muted)]">기본값은 포함하지 않음입니다. 사진을 포함하면 보존 만료 시점까지만 링크가 유지됩니다.</p>{share ? <div className="mt-4 border border-[var(--app-border)] p-3 text-sm"><a href={share.url} className="break-all underline" target="_blank" rel="noreferrer">{share.url}</a><p className="mt-2 text-xs">사진 {share.sourcePhotoIncluded ? "포함" : "미포함"} · {new Date(share.expiresAt).toLocaleString("ko-KR")} 만료</p><div className="mt-3"><Button type="button" variant="secondary" loading={working} onClick={() => void revokeShare()}>공유 취소</Button></div></div> : <div className="mt-4"><Button type="button" loading={working} onClick={() => void createShare()}>7일 공유 링크 만들기</Button></div>}{error ? <p role="alert" className="mt-3 text-sm text-red-400">{error}</p> : null}</SurfaceCard>
  </section>;
}
