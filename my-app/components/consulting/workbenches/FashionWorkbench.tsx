"use client";

/* eslint-disable @next/next/no-img-element */
import {
  normalizePaidActionQuote,
  type PaidActionQuote,
} from "@hairfit/shared";
import type {
  FashionPreviewCandidateV2,
  FashionPreviewSetV2,
} from "@hairfit/shared/v2";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FashionGenre, FashionRecommendation } from "../../../lib/fashion-types";
import type {
  ConsultationPatch,
  ConsultationSnapshot,
  SelectedFashionLook,
} from "../../../lib/consulting/contracts";
import { selectedStyle } from "../../../lib/consulting/contracts";
import { PaidActionQuoteCard, usePaidActionQuoteExpired } from "../../billing/PaidActionQuoteCard";
import { Button } from "../../ui/Button";
import { Panel, SaveStageButton, SurfaceCard } from "./shared";

type FashionCategory = NonNullable<SelectedFashionLook["category"]>;
type GenreOption = { value: FashionGenre; label: string; description: string };
type FashionStateResponse = {
  previews?: FashionPreviewCandidateV2[];
  previewSet?: FashionPreviewSetV2 | null;
  error?: string;
};

const GENRE_GROUPS: Record<FashionCategory, GenreOption[]> = {
  DAILY: [
    { value: "casual", label: "데일리 캐주얼", description: "반복해서 입기 쉬운 균형" },
    { value: "minimal", label: "미니멀", description: "헤어와 얼굴을 또렷하게 만드는 절제" },
  ],
  WORK: [
    { value: "office", label: "오피스", description: "출근과 미팅에 맞는 단정한 구조" },
    { value: "classic", label: "클래식", description: "오래 가는 재킷과 셔츠 중심의 룩" },
  ],
  STATEMENT: [
    { value: "street", label: "스트릿", description: "트렌디한 볼륨과 기능성 디테일" },
    { value: "formal", label: "포멀", description: "행사에 맞는 절제된 존재감" },
  ],
};

function categoryForGenre(genre: string): FashionCategory {
  const entry = (Object.entries(GENRE_GROUPS) as Array<[FashionCategory, GenreOption[]]>)
    .find(([, options]) => options.some((option) => option.value === genre));
  return entry?.[0] ?? "DAILY";
}

function statusLabel(status: string) {
  if (status === "completed") return "AI 생성 완료";
  if (status === "generating") return "AI 생성 중";
  if (status === "failed") return "생성 실패 · 재시도 가능";
  return "추천 준비됨";
}

export function FashionWorkbench({ snapshot, mutate, saving }: {
  snapshot: ConsultationSnapshot;
  mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>;
  saving: boolean;
}) {
  const [direction, setDirection] = useState(
    snapshot.fashion.direction || "선택한 헤어의 균형과 퍼스널 컬러를 이어가는 룩",
  );
  const [shortlist, setShortlist] = useState(snapshot.fashion.shortlistIds);
  const [selected, setSelected] = useState<SelectedFashionLook>(snapshot.fashion);
  const [genre, setGenre] = useState<FashionGenre>("casual");
  const [previews, setPreviews] = useState<FashionPreviewCandidateV2[]>([]);
  const [profileReady, setProfileReady] = useState<boolean | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<FashionRecommendation | null>(null);
  const [quote, setQuote] = useState<PaidActionQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restoredServerSelection = useRef(false);
  const style = selectedStyle(snapshot);
  const quoteExpired = usePaidActionQuoteExpired(quote);

  const refreshFashion = useCallback(async () => {
    const response = await fetch(
      `/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/fashion-previews`,
      { cache: "no-store" },
    );
    const data = (await response.json().catch(() => ({}))) as FashionStateResponse;
    if (!response.ok) throw new Error(data.error || "패션 프리뷰 상태를 불러오지 못했습니다.");
    const nextPreviews = data.previews ?? [];
    setPreviews(nextPreviews);
    if (!restoredServerSelection.current && data.previewSet) {
      restoredServerSelection.current = true;
      setShortlist((current) => current.length ? current : data.previewSet!.stylingSessionIds);
      const restored = nextPreviews.find(
        (preview) => preview.stylingSessionId === data.previewSet?.selectedStylingSessionId,
      );
      if (restored) setSelected((current) => current.lookId ? current : ({
        direction: current.direction || snapshot.fashion.direction,
        shortlistIds: data.previewSet!.stylingSessionIds,
        lookId: restored.stylingSessionId,
        category: categoryForGenre(restored.genre),
        label: restored.headline,
        selectedAt: data.previewSet!.createdAt,
      }));
    }
    return nextPreviews;
  }, [snapshot.fashion.direction, snapshot.sessionId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [profileResponse] = await Promise.all([
          fetch("/api/style-profile", { cache: "no-store" }),
          refreshFashion(),
        ]);
        const profileData = (await profileResponse.json().catch(() => ({}))) as {
          profile?: { bodyPhotoPath?: string | null };
        };
        if (!cancelled) setProfileReady(Boolean(profileResponse.ok && profileData.profile?.bodyPhotoPath));
      } catch (cause) {
        if (!cancelled) {
          setProfileReady(false);
          setError(cause instanceof Error ? cause.message : "패션 컨설팅 준비 상태를 확인하지 못했습니다.");
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [refreshFashion]);

  useEffect(() => {
    if (!previews.some((preview) => preview.status === "generating")) return;
    const timer = window.setInterval(() => {
      void refreshFashion().catch((cause) => {
        setError(cause instanceof Error ? cause.message : "패션 생성 상태를 갱신하지 못했습니다.");
      });
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [previews, refreshFashion]);

  const loadQuote = useCallback(async (targetSessionId: string) => {
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const response = await fetch("/api/paid-actions/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "outfit_generation",
          subjectId: targetSessionId,
          billingScope: "customer",
        }),
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as { quote?: unknown; error?: string };
      const nextQuote = normalizePaidActionQuote(data.quote);
      if (!response.ok || !nextQuote) throw new Error(data.error || "최신 룩북 견적을 불러오지 못했습니다.");
      setQuote(nextQuote);
    } catch (cause) {
      setQuote(null);
      setQuoteError(cause instanceof Error ? cause.message : "최신 룩북 견적을 불러오지 못했습니다.");
    } finally {
      setQuoteLoading(false);
    }
  }, []);

  const chooseGenre = (value: FashionGenre) => {
    setGenre(value);
    setSessionId(null);
    setRecommendation(null);
    setQuote(null);
    setQuoteError(null);
    setError(null);
  };

  const recommend = async () => {
    if (!profileReady || working) return;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/styling/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultationId: snapshot.sessionId, genre }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        sessionId?: string;
        status?: string;
        recommendation?: FashionRecommendation;
        error?: string;
      };
      if (!response.ok || !data.sessionId || !data.recommendation) {
        throw new Error(data.error || "확정한 헤어 기반 패션 추천을 만들지 못했습니다.");
      }
      setSessionId(data.sessionId);
      setRecommendation(data.recommendation);
      await refreshFashion();
      if (data.status !== "completed") await loadQuote(data.sessionId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "패션 추천을 만들지 못했습니다.");
    } finally {
      setWorking(false);
    }
  };

  const generate = async () => {
    if (!sessionId || !quote || quoteExpired || !quote.isAllowed || working) return;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/styling/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, quoteId: quote.quoteId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        quote?: unknown;
        error?: string;
      };
      const refreshedQuote = normalizePaidActionQuote(data.quote);
      if (refreshedQuote) setQuote(refreshedQuote);
      if (!response.ok) throw new Error(data.error || "패션 프리뷰 생성을 접수하지 못했습니다.");
      await refreshFashion();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "패션 프리뷰 생성을 접수하지 못했습니다.");
    } finally {
      setWorking(false);
    }
  };

  const toggleShortlist = (preview: FashionPreviewCandidateV2) => {
    if (preview.status !== "completed" || !preview.imageUrl) return;
    setShortlist((current) => {
      if (current.includes(preview.stylingSessionId)) {
        if (selected.lookId === preview.stylingSessionId) {
          setSelected({ ...selected, lookId: null, category: null, label: "", selectedAt: null });
        }
        return current.filter((item) => item !== preview.stylingSessionId);
      }
      return current.length < 3 ? [...current, preview.stylingSessionId] : current;
    });
  };

  const selectFinal = (preview: FashionPreviewCandidateV2) => {
    if (!shortlist.includes(preview.stylingSessionId)) return;
    setSelected({
      direction,
      shortlistIds: shortlist,
      lookId: preview.stylingSessionId,
      category: categoryForGenre(preview.genre),
      label: preview.headline,
      selectedAt: new Date().toISOString(),
    });
  };

  const save = async () => {
    if (!selected.lookId || shortlist.length < 2 || shortlist.length > 3) return;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/fashion-previews`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `fashion:${snapshot.sessionId}:${snapshot.version}:${selected.lookId}`,
          },
          body: JSON.stringify({
            stylingSessionIds: shortlist,
            selectedStylingSessionId: selected.lookId,
          }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "패션 프리뷰 선택을 저장하지 못했습니다.");
      await mutate({
        fashion: {
          ...selected,
          direction,
          shortlistIds: shortlist,
          selectedAt: selected.selectedAt || new Date().toISOString(),
        },
        completeStage: "fashion",
        currentStage: "fashion",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "패션 프리뷰 선택을 저장하지 못했습니다.");
    } finally {
      setWorking(false);
    }
  };

  const activePreview = previews.find((preview) => preview.stylingSessionId === sessionId);
  const completedPreviews = previews.filter((preview) => preview.status === "completed" && preview.imageUrl);
  const canSave = shortlist.length >= 2
    && shortlist.length <= 3
    && Boolean(selected.lookId && shortlist.includes(selected.lookId));

  return <div className="grid gap-5">
    <Panel className="p-5 sm:p-7">
      <p className="app-kicker">1 · Direction</p>
      <h2 className="mt-2 text-xl font-black">{style?.label || "확정한 헤어"}에서 이어지는 패션 방향</h2>
      <label className="mt-4 grid gap-2 text-sm font-black">패션 방향<input value={direction} onChange={(event) => setDirection(event.target.value)} className="app-input min-h-11 px-3 font-normal" /></label>
      {profileReady === false ? <p className="mt-4 border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">AI 패션 생성에는 동의한 전신 사진과 바디 프로필이 필요합니다. <Link href="/mypage" className="font-black underline">마이페이지에서 프로필 완성</Link></p> : null}
    </Panel>

    <div className="grid gap-5 lg:grid-cols-3">
      {(Object.entries(GENRE_GROUPS) as Array<[FashionCategory, GenreOption[]]>).map(([category, options]) => <Panel key={category} className="p-4"><p className="app-kicker">2 · {category}</p><div className="mt-4 grid gap-3">{options.map((option) => <button key={option.value} type="button" onClick={() => chooseGenre(option.value)} aria-pressed={genre === option.value} className={`min-h-24 border p-4 text-left ${genre === option.value ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "border-[var(--app-border)] bg-[var(--app-surface)]"}`}><span className="text-sm font-black">{option.label}</span><span className="mt-2 block text-xs opacity-75">{option.description}</span></button>)}</div></Panel>)}
    </div>

    <SurfaceCard className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="app-kicker">3 · Confirmed hair → fashion recommendation</p><p className="mt-2 font-black">선택한 상황의 추천을 만든 뒤 실제 AI 이미지를 생성합니다.</p><p className="mt-1 text-sm text-[var(--app-muted)]">정적 예시가 아니라 확정 스냅샷, 바디 프로필, 퍼스널 컬러가 서버에서 다시 검증됩니다.</p></div><Button type="button" loading={working} disabled={!profileReady} onClick={() => void recommend()}>패션 추천 만들기</Button></SurfaceCard>

    {recommendation ? <Panel className="grid gap-4 p-5"><div><p className="app-kicker">AI recommendation · {recommendation.genre}</p><h3 className="mt-2 text-xl font-black">{recommendation.headline}</h3><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{recommendation.summary}</p></div><div className="flex flex-wrap gap-2">{recommendation.palette.map((color) => <span key={color} className="border border-[var(--app-border)] px-3 py-2 text-xs font-black">{color}</span>)}</div>{activePreview?.status === "completed" ? <p className="border border-[var(--app-border)] p-3 text-sm font-black">이 추천의 AI 이미지가 이미 완성되었습니다.</p> : <><PaidActionQuoteCard quote={quote} loading={quoteLoading} error={quoteError} payerLabel="내 계정" billingHref="/billing?returnTo=%2Fconsulting%2Fnew" onRefresh={() => { if (sessionId) void loadQuote(sessionId); }} /><div className="flex justify-end"><Button type="button" loading={working} disabled={!quote || quoteExpired || !quote.isAllowed} onClick={() => void generate()}>실제 패션 프리뷰 생성</Button></div></>}</Panel> : null}

    {error ? <p className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">{error}</p> : null}

    <Panel className="p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="app-kicker">4 · Generated previews</p><h3 className="mt-2 text-xl font-black">실제 생성 결과 {completedPreviews.length}개</h3><p className="mt-1 text-sm text-[var(--app-muted)]">완료된 이미지 중 2~3개를 shortlist로 선택하세요.</p></div><Button type="button" variant="secondary" onClick={() => void refreshFashion().catch((cause) => setError(cause instanceof Error ? cause.message : "상태를 갱신하지 못했습니다."))}>상태 갱신</Button></div><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{previews.map((preview) => <button key={preview.stylingSessionId} type="button" disabled={preview.status !== "completed" || !preview.imageUrl} onClick={() => toggleShortlist(preview)} aria-pressed={shortlist.includes(preview.stylingSessionId)} className={`overflow-hidden border text-left ${shortlist.includes(preview.stylingSessionId) ? "border-[var(--app-border-strong)] ring-2 ring-[var(--app-ring)]" : "border-[var(--app-border)]"} disabled:opacity-60`}><div className="aspect-[4/5] bg-[var(--app-surface-muted)]">{preview.imageUrl ? <img src={preview.imageUrl} alt={preview.headline} className="h-full w-full object-cover" loading="lazy" decoding="async" /> : <div className="flex h-full items-center justify-center p-4 text-center text-xs text-[var(--app-muted)]">{statusLabel(preview.status)}</div>}</div><div className="p-3"><p className="text-xs font-black uppercase">{categoryForGenre(preview.genre)} · {statusLabel(preview.status)}</p><p className="mt-2 font-black">{preview.headline}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--app-muted)]">{preview.errorMessage || preview.summary}</p></div></button>)}</div>{!previews.length ? <p className="mt-5 border border-[var(--app-border)] p-5 text-sm text-[var(--app-muted)]">아직 생성한 패션 프리뷰가 없습니다. 위에서 상황을 고르고 첫 추천을 만드세요.</p> : null}</Panel>

    <Panel className="p-5"><p className="app-kicker">5 · Shortlist & compare</p><p className="mt-2 text-sm text-[var(--app-muted)]">현재 {shortlist.length}개. 비교할 결과를 누르면 최종 룩으로 확정할 수 있습니다.</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{previews.filter((preview) => shortlist.includes(preview.stylingSessionId)).map((preview) => <button key={preview.stylingSessionId} type="button" onClick={() => selectFinal(preview)} aria-pressed={selected.lookId === preview.stylingSessionId} className={`min-h-24 border p-3 text-left text-sm font-black ${selected.lookId === preview.stylingSessionId ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "bg-[var(--app-surface)]"}`}>{preview.headline}<span className="mt-2 block text-xs opacity-70">{categoryForGenre(preview.genre)}</span></button>)}</div></Panel>

    <SurfaceCard className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="app-kicker">6 · Selected look</p><p className="mt-2 font-black">{selected.label || "실제 생성 결과를 2~3개 비교한 뒤 최종 룩을 선택해 주세요"}</p></div><SaveStageButton loading={saving || working} disabled={!canSave} onClick={() => void save()}>AI 컨설팅 여정 완료</SaveStageButton></SurfaceCard>
  </div>;
}
