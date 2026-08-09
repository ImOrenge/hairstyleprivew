"use client";

/* eslint-disable @next/next/no-img-element */
import { normalizePaidActionQuote, type PaidActionQuote } from "@hairfit/shared";
import type { FashionPreviewCandidateV2, FashionPreviewSetV2 } from "@hairfit/shared/v2";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FashionGenre, FashionRecommendation } from "../../../lib/fashion-types";
import type {
  ConsultationPatch,
  ConsultationSnapshot,
  FashionCategory,
  FashionDirectionSnapshot,
  SelectedFashionLook,
} from "../../../lib/consulting/contracts";
import { selectedStyle } from "../../../lib/consulting/contracts";
import { PaidActionQuoteCard, usePaidActionQuoteExpired } from "../../billing/PaidActionQuoteCard";
import { Button } from "../../ui/Button";
import { Panel, SaveStageButton, SurfaceCard } from "./shared";

type FashionSlot = {
  id: string;
  category: FashionCategory;
  genre: FashionGenre;
  label: string;
  description: string;
};
type FashionStateResponse = {
  previews?: FashionPreviewCandidateV2[];
  previewSet?: FashionPreviewSetV2 | null;
  error?: string;
};

const FASHION_SLOTS: FashionSlot[] = [
  { id: "daily-casual", category: "DAILY", genre: "casual", label: "데일리 캐주얼", description: "반복해서 입기 쉬운 균형" },
  { id: "daily-minimal", category: "DAILY", genre: "minimal", label: "데일리 미니멀", description: "헤어와 얼굴을 또렷하게 만드는 절제" },
  { id: "daily-athleisure", category: "DAILY", genre: "athleisure", label: "데일리 애슬레저", description: "활동성과 정돈된 실루엣" },
  { id: "work-office", category: "WORK", genre: "office", label: "오피스", description: "출근과 미팅에 맞는 단정한 구조" },
  { id: "work-classic", category: "WORK", genre: "classic", label: "워크 클래식", description: "오래 가는 재킷과 셔츠 중심" },
  { id: "work-smart", category: "WORK", genre: "minimal", label: "스마트 워크", description: "가벼운 격식과 실용성의 균형" },
  { id: "statement-street", category: "STATEMENT", genre: "street", label: "스트릿", description: "트렌디한 볼륨과 기능성 디테일" },
  { id: "statement-formal", category: "STATEMENT", genre: "formal", label: "포멀", description: "행사에 맞는 절제된 존재감" },
  { id: "statement-date", category: "STATEMENT", genre: "date", label: "데이트", description: "부드러운 컬러와 헤어 연결" },
];

function statusLabel(status: string) {
  if (status === "completed") return "AI 생성 완료";
  if (status === "generating") return "AI 생성 중";
  if (status === "failed") return "생성 실패 · 재시도 가능";
  if (status === "recommended") return "추천 준비됨";
  return "결과 대기";
}

function directionSummary(direction: FashionDirectionSnapshot) {
  return [
    direction.situation,
    direction.genre,
    direction.season,
    direction.fit,
    direction.exposure,
    direction.budget,
  ].filter(Boolean).join(" · ");
}

function DirectionChoices<T extends string>({
  label,
  values,
  selected,
  onSelect,
}: {
  label: string;
  values: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return <fieldset>
    <legend className="text-sm font-black">{label}</legend>
    <div className="mt-2 flex flex-wrap gap-2">
      {values.map((value) => <button
        key={value}
        type="button"
        onClick={() => onSelect(value)}
        aria-pressed={selected === value}
        className={`min-h-11 border px-3 text-xs font-black uppercase ${selected === value ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "bg-[var(--app-surface)]"}`}
      >{value}</button>)}
    </div>
  </fieldset>;
}

export function FashionWorkbench({ snapshot, mutate, saving }: {
  snapshot: ConsultationSnapshot;
  mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>;
  saving: boolean;
}) {
  const [direction, setDirection] = useState<FashionDirectionSnapshot>(snapshot.fashion.directionSnapshot);
  const initialSlot = FASHION_SLOTS.find((slot) => slot.genre === snapshot.fashion.directionSnapshot.genre) ?? FASHION_SLOTS[0];
  const [selectedSlotId, setSelectedSlotId] = useState(initialSlot.id);
  const [shortlist, setShortlist] = useState(snapshot.fashion.shortlistIds);
  const [selected, setSelected] = useState<SelectedFashionLook>(snapshot.fashion);
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
  const selectedSlot = FASHION_SLOTS.find((slot) => slot.id === selectedSlotId) ?? FASHION_SLOTS[0];

  const refreshFashion = useCallback(async () => {
    const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/fashion-previews`, { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as FashionStateResponse;
    if (!response.ok) throw new Error(data.error || "패션 프리뷰 상태를 불러오지 못했습니다.");
    const nextPreviews = data.previews ?? [];
    setPreviews(nextPreviews);
    if (!restoredServerSelection.current && data.previewSet) {
      restoredServerSelection.current = true;
      const previewSet = data.previewSet;
      setDirection(previewSet.directionSnapshot);
      setSelectedSlotId(previewSet.selectedLook.slotId);
      setShortlist(previewSet.stylingSessionIds);
      setSelected({
        direction: directionSummary(previewSet.directionSnapshot),
        directionSnapshot: previewSet.directionSnapshot,
        shortlistIds: previewSet.stylingSessionIds,
        lookId: previewSet.selectedStylingSessionId,
        category: previewSet.selectedLook.category,
        label: previewSet.selectedLook.label,
        items: previewSet.selectedLook.items,
        palette: previewSet.selectedLook.palette,
        neckline: previewSet.selectedLook.neckline,
        silhouette: previewSet.selectedLook.silhouette,
        avoidCombinations: previewSet.directionSnapshot.avoidItems,
        shoppingKeywords: previewSet.selectedLook.shoppingKeywords,
        selectedAt: previewSet.createdAt,
      });
    }
    return nextPreviews;
  }, [snapshot.sessionId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [profileResponse] = await Promise.all([
          fetch("/api/style-profile", { cache: "no-store" }),
          refreshFashion(),
        ]);
        const profileData = (await profileResponse.json().catch(() => ({}))) as { profile?: { bodyPhotoPath?: string | null } };
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
      void refreshFashion().catch((cause) => setError(cause instanceof Error ? cause.message : "패션 생성 상태를 갱신하지 못했습니다."));
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
        body: JSON.stringify({ action: "outfit_generation", subjectId: targetSessionId, billingScope: "customer" }),
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

  const chooseSlot = (slot: FashionSlot) => {
    setSelectedSlotId(slot.id);
    setDirection((current) => ({
      ...current,
      genre: slot.genre,
      situation: slot.category === "WORK" ? "work" : slot.category === "STATEMENT" ? "formal" : "daily",
    }));
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
    const requestDirection = { ...direction, genre: selectedSlot.genre };
    try {
      const response = await fetch("/api/styling/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consultationId: snapshot.sessionId,
          genre: selectedSlot.genre,
          fashionSlotId: selectedSlot.id,
          direction: requestDirection,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { sessionId?: string; status?: string; recommendation?: FashionRecommendation; error?: string };
      if (!response.ok || !data.sessionId || !data.recommendation) throw new Error(data.error || "확정한 헤어 기반 패션 추천을 만들지 못했습니다.");
      setDirection(requestDirection);
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
      const data = (await response.json().catch(() => ({}))) as { quote?: unknown; error?: string };
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
    if (shortlist.includes(preview.stylingSessionId)) {
      setShortlist(shortlist.filter((item) => item !== preview.stylingSessionId));
      if (selected.lookId === preview.stylingSessionId) {
        setSelected((value) => ({ ...value, lookId: null, category: null, label: "", selectedAt: null }));
      }
      return;
    }
    if (shortlist.length < 3) setShortlist([...shortlist, preview.stylingSessionId]);
  };

  const selectFinal = (preview: FashionPreviewCandidateV2) => {
    if (!shortlist.includes(preview.stylingSessionId)) return;
    setSelected({
      direction: directionSummary(preview.direction),
      directionSnapshot: preview.direction,
      shortlistIds: shortlist,
      lookId: preview.stylingSessionId,
      category: preview.category,
      label: preview.headline,
      items: preview.items,
      palette: preview.palette,
      neckline: preview.neckline,
      silhouette: preview.silhouette,
      avoidCombinations: preview.direction.avoidItems,
      shoppingKeywords: preview.shoppingKeywords,
      selectedAt: new Date().toISOString(),
    });
  };

  const save = async () => {
    if (!selected.lookId || shortlist.length < 2 || shortlist.length > 3) return;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/fashion-previews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `fashion:${snapshot.sessionId}:${snapshot.version}:${selected.lookId}`,
        },
        body: JSON.stringify({ stylingSessionIds: shortlist, selectedStylingSessionId: selected.lookId }),
      });
      const data = (await response.json().catch(() => ({}))) as { previewSet?: FashionPreviewSetV2; error?: string };
      if (!response.ok || !data.previewSet) throw new Error(data.error || "패션 프리뷰 선택을 저장하지 못했습니다.");
      await mutate({
        fashion: {
          ...selected,
          directionSnapshot: data.previewSet.directionSnapshot,
          direction: directionSummary(data.previewSet.directionSnapshot),
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
  const canSave = shortlist.length >= 2 && shortlist.length <= 3 && Boolean(selected.lookId && shortlist.includes(selected.lookId));

  return <div className="grid gap-5">
    <Panel className="grid gap-5 p-5 sm:p-7">
      <div>
        <p className="app-kicker">1 · Direction</p>
        <h2 className="mt-2 text-xl font-black">{style?.label || "확정한 헤어"}에서 이어지는 패션 방향</h2>
        <p className="mt-2 text-sm text-[var(--app-muted)]">상황·계절·핏·노출·예산·회피 아이템이 추천과 이미지 생성 프롬프트에 함께 저장됩니다.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <DirectionChoices label="상황" values={["daily", "work", "date", "formal"] as const} selected={direction.situation} onSelect={(situation) => setDirection({ ...direction, situation })} />
        <DirectionChoices label="계절" values={["spring", "summer", "autumn", "winter", "all-season"] as const} selected={direction.season} onSelect={(season) => setDirection({ ...direction, season })} />
        <DirectionChoices label="핏" values={["slim", "regular", "relaxed", "oversized"] as const} selected={direction.fit} onSelect={(fit) => setDirection({ ...direction, fit })} />
        <DirectionChoices label="노출·넥라인" values={["low", "balanced", "bold"] as const} selected={direction.exposure} onSelect={(exposure) => setDirection({ ...direction, exposure })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-black">예산 범위<input value={direction.budget} onChange={(event) => setDirection({ ...direction, budget: event.target.value })} className="app-input min-h-11 px-3 font-normal" placeholder="예: 20만 원 이내" /></label>
        <label className="grid gap-2 text-sm font-black">회피 아이템<input value={direction.avoidItems.join(", ")} onChange={(event) => setDirection({ ...direction, avoidItems: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} className="app-input min-h-11 px-3 font-normal" placeholder="예: 모자, 높은 터틀넥" /></label>
      </div>
      {profileReady === false ? <p className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">AI 패션 생성에는 동의한 전신 사진과 바디 프로필이 필요합니다. <Link href="/mypage" className="font-black underline">마이페이지에서 프로필 완성</Link></p> : null}
    </Panel>

    <div className="grid gap-5 lg:grid-cols-3" data-fashion-board-size="9">
      {(["DAILY", "WORK", "STATEMENT"] as const).map((category) => <Panel key={category} className="p-4">
        <p className="app-kicker">2 · {category} 3</p>
        <div className="mt-4 grid gap-3">
          {FASHION_SLOTS.filter((slot) => slot.category === category).map((slot) => {
            const preview = previews.find((item) => item.slotId === slot.id);
            const shortlisted = preview ? shortlist.includes(preview.stylingSessionId) : false;
            return <article key={slot.id} data-fashion-slot-id={slot.id} className={`border p-3 ${selectedSlotId === slot.id ? "border-[var(--app-border-strong)] ring-2 ring-[var(--app-ring)]" : "border-[var(--app-border)]"}`}>
              <button type="button" onClick={() => chooseSlot(slot)} aria-pressed={selectedSlotId === slot.id} className="min-h-16 w-full text-left">
                <span className="text-sm font-black">{slot.label}</span>
                <span className="mt-1 block text-xs text-[var(--app-muted)]">{slot.description}</span>
                <span className="mt-2 block text-xs font-black">{statusLabel(preview?.status || "pending")}</span>
              </button>
              {preview?.imageUrl ? <div className="mt-3 aspect-[4/5] overflow-hidden bg-[var(--app-surface-muted)]"><img src={preview.imageUrl} alt={preview.headline} className="h-full w-full object-cover" loading="lazy" decoding="async" /></div> : null}
              {preview ? <button type="button" disabled={preview.status !== "completed" || !preview.imageUrl} onClick={() => toggleShortlist(preview)} aria-pressed={shortlisted} className={`mt-3 min-h-11 w-full border px-3 text-xs font-black ${shortlisted ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "bg-[var(--app-surface)]"}`}>{shortlisted ? "후보에서 빼기" : `후보 담기 · ${preview.headline}`}</button> : null}
            </article>;
          })}
        </div>
      </Panel>)}
    </div>

    <SurfaceCard className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="app-kicker">3 · Confirmed hair → selected slot</p><p className="mt-2 font-black">{selectedSlot.label} 추천을 만든 뒤 실제 AI 이미지를 생성합니다.</p><p className="mt-1 text-sm text-[var(--app-muted)]">확정 snapshot, 바디 프로필, 퍼스널 컬러와 구조화 방향을 서버에서 다시 검증합니다.</p></div><Button type="button" loading={working} disabled={!profileReady} onClick={() => void recommend()}>패션 추천 만들기</Button></SurfaceCard>

    {recommendation ? <Panel className="grid gap-4 p-5"><div><p className="app-kicker">AI recommendation · {selectedSlot.id}</p><h3 className="mt-2 text-xl font-black">{recommendation.headline}</h3><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{recommendation.summary}</p></div><div className="flex flex-wrap gap-2">{recommendation.palette.map((color) => <span key={color} className="border border-[var(--app-border)] px-3 py-2 text-xs font-black">{color}</span>)}</div>{activePreview?.status === "completed" ? <p className="border border-[var(--app-border)] p-3 text-sm font-black">이 슬롯의 AI 이미지가 이미 완성되었습니다.</p> : <><PaidActionQuoteCard quote={quote} loading={quoteLoading} error={quoteError} payerLabel="내 계정" billingHref="/billing?returnTo=%2Fconsulting%2Fnew" onRefresh={() => { if (sessionId) void loadQuote(sessionId); }} /><div className="flex justify-end"><Button type="button" loading={working} disabled={!quote || quoteExpired || !quote.isAllowed} onClick={() => void generate()}>실제 패션 프리뷰 생성</Button></div></>}</Panel> : null}

    {error ? <p className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">{error}</p> : null}

    <Panel className="p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="app-kicker">4 · 9-look board</p><h3 className="mt-2 text-xl font-black">실제 생성 결과 {completedPreviews.length}개 / 9개</h3><p className="mt-1 text-sm text-[var(--app-muted)]">각 그룹 3개 슬롯을 채우고 완료된 이미지 중 2~3개를 shortlist로 선택하세요.</p></div><Button type="button" variant="secondary" onClick={() => void refreshFashion().catch((cause) => setError(cause instanceof Error ? cause.message : "상태를 갱신하지 못했습니다."))}>상태 갱신</Button></div></Panel>

    <Panel className="p-5"><p className="app-kicker">5 · Shortlist & compare</p><p className="mt-2 text-sm text-[var(--app-muted)]">현재 {shortlist.length}개. 동일 크롭의 실제 생성 결과를 비교한 뒤 최종 룩을 선택하세요.</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{previews.filter((preview) => shortlist.includes(preview.stylingSessionId)).map((preview) => <button key={preview.stylingSessionId} type="button" onClick={() => selectFinal(preview)} aria-pressed={selected.lookId === preview.stylingSessionId} className={`overflow-hidden border text-left ${selected.lookId === preview.stylingSessionId ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "border-[var(--app-border)] bg-[var(--app-surface)]"}`}>{preview.imageUrl ? <div className="aspect-[4/5] bg-[var(--app-surface-muted)]"><img src={preview.imageUrl} alt="" className="h-full w-full object-cover" /></div> : null}<span className="block p-3 text-sm font-black">{preview.headline}<span className="mt-2 block text-xs opacity-70">{preview.category} · {preview.neckline || preview.silhouette}</span></span></button>)}</div></Panel>

    <SurfaceCard className="grid gap-4 p-5 sm:grid-cols-[1fr_auto]"><div><p className="app-kicker">6 · Selected look</p><p className="mt-2 font-black">{selected.label || "실제 생성 결과를 2~3개 비교한 뒤 최종 룩을 선택해 주세요"}</p>{selected.lookId ? <div className="mt-3 grid gap-1 text-xs text-[var(--app-muted)]"><p>팔레트 · {selected.palette.join(", ") || "확인 전"}</p><p>넥라인 · {selected.neckline || "확인 전"}</p><p>실루엣 · {selected.silhouette || "확인 전"}</p><p>검색어 · {selected.shoppingKeywords.join(", ") || "확인 전"}</p></div> : null}</div><SaveStageButton loading={saving || working} disabled={!canSave} onClick={() => void save()}>AI 컨설팅 여정 완료</SaveStageButton></SurfaceCard>
  </div>;
}
