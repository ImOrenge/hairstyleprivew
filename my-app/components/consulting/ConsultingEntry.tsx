"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ConsultationSnapshot } from "../../lib/consulting/contracts";
import { consultationStageHref } from "../../lib/consulting/routes";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Surface";
import Link from "next/link";

export function ConsultingEntry({ latest }: { latest: ConsultationSnapshot | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/consultations", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { snapshot?: ConsultationSnapshot; error?: string };
      if (!response.ok || !data.snapshot) throw new Error(data.error || "상담을 시작하지 못했습니다.");
      router.replace(consultationStageHref(data.snapshot.sessionId, "discovery"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "상담을 시작하지 못했습니다."); setLoading(false); }
  };
  return <div className="mx-auto flex min-h-dvh max-w-4xl items-center px-4 py-12"><Panel className="w-full p-6 sm:p-10"><p className="app-kicker">HairFit AI Consultant</p><h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">미리보기를 넘어<br />결정까지 함께합니다.</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-[var(--app-muted)] sm:text-base">목표와 현재 모발을 정리하고, 실제 분석 근거를 확인한 뒤 9개 전략형 프리뷰를 비교합니다. 선택한 스타일은 살롱 브리프·실제 시술 기반 애프터케어·패션까지 같은 스냅샷으로 이어집니다.</p>{error ? <p className="mt-5 border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">{error}</p> : null}<div className="mt-7 flex flex-wrap gap-3">{latest ? <Link href={consultationStageHref(latest.sessionId, latest.journey.recommendedStage)} className="inline-flex min-h-12 items-center border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 text-sm font-black uppercase tracking-[0.04em] text-[var(--app-inverse-text)]">추천 작업 · {latest.journey.recommendedStage} ({latest.completedStages.length}/11)</Link> : null}<Button type="button" variant={latest ? "secondary" : "primary"} loading={loading} onClick={() => void start()} className="min-h-12">새 AI 상담 시작</Button></div></Panel></div>;
}
