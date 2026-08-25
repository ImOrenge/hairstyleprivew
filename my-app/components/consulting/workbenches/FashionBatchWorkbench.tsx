"use client";

/* eslint-disable @next/next/no-img-element */
import type { FashionPreviewCandidateV2, FashionPreviewSetV2 } from "@hairfit/shared/v2";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClientConsultationTask, selectedStyle, type ConsultationPatch, type ConsultationSnapshot, type FashionCategory, type FashionDirectionSnapshot, type FashionPreviewBatch, type SelectedFashionLook } from "../../../lib/consulting/contracts";
import { Button } from "../../ui/Button";
import { FashionDirectionInterview } from "../interview/FashionDirectionInterview";
import { useConsultationTaskRuntime } from "../transition/ConsultationTaskRuntime";
import { ConsultationSystemData, Panel, SaveStageButton, SurfaceCard, WorkbenchGrid } from "./shared";

const SLOTS: Array<{
  id: string;
  category: FashionCategory;
  genre: string;
  label: string;
}> = [
  {
    id: "daily-casual",
    category: "DAILY",
    genre: "casual",
    label: "데일리 캐주얼",
  },
  {
    id: "daily-minimal",
    category: "DAILY",
    genre: "minimal",
    label: "데일리 미니멀",
  },
  {
    id: "daily-athleisure",
    category: "DAILY",
    genre: "athleisure",
    label: "데일리 애슬레저",
  },
  { id: "work-office", category: "WORK", genre: "office", label: "오피스" },
  {
    id: "work-classic",
    category: "WORK",
    genre: "classic",
    label: "워크 클래식",
  },
  {
    id: "work-smart",
    category: "WORK",
    genre: "minimal",
    label: "스마트 워크",
  },
  {
    id: "statement-street",
    category: "STATEMENT",
    genre: "street",
    label: "스트릿",
  },
  {
    id: "statement-formal",
    category: "STATEMENT",
    genre: "formal",
    label: "포멀",
  },
  {
    id: "statement-date",
    category: "STATEMENT",
    genre: "date",
    label: "데이트",
  },
];

type BatchState = {
  batch: FashionPreviewBatch | null;
  stylingSessionIds: string[];
  adaptiveEnabled?: boolean;
};

function directionSummary(direction: FashionDirectionSnapshot) {
  return [direction.situation, direction.genre, direction.season, direction.fit, direction.exposure, direction.budget].filter(Boolean).join(" · ");
}

function stableUtcTime(value: string) {
  const date = new Date(value);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")} UTC`;
}

function generationStatusLabel(value: string) {
  if (["completed", "accepted", "selected"].includes(value)) return "완성";
  if (["failed", "retry_required", "stalled"].includes(value)) return "다시 준비 필요";
  if (["queued", "pending", "running", "generating", "approved"].includes(value)) return "준비 중";
  return "확인 중";
}

function selectedLookFromPreview(preview: FashionPreviewCandidateV2, sourceColorSelectionId: string | null): SelectedFashionLook {
  return {
    direction: directionSummary(preview.direction),
    directionSnapshot: preview.direction,
    shortlistIds: [preview.stylingSessionId],
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
    sourceColorSelectionId,
    staleReason: null,
  };
}

function batchStatusCopy(batch: FashionPreviewBatch | null) {
  if (!batch)
    return {
      key: "idle",
      title: "패션 배치 준비 전",
      detail: "인터뷰 방향을 확정하면 AI 권장 룩 3개부터 준비합니다.",
    };
  if (batch.state === "ready")
    return {
      key: "completed",
      title: "패션 배치가 종결됐어요",
      detail: `${batch.completedCount}개 완료 · ${batch.failedCount}개 명시적 실패`,
    };
  if (batch.stalledCount > 0)
    return {
      key: "stalled",
      title: "정체 슬롯을 감지해 복구하고 있어요",
      detail: `${batch.stalledCount}개 정체 · 완료된 ${batch.completedCount}개 결과는 그대로 유지합니다.`,
    };
  if (batch.retryingCount > 0)
    return {
      key: "retrying",
      title: "실패 슬롯만 다시 접수했어요",
      detail: `${batch.retryingCount}개 재시도 · ${batch.completedCount}/${batch.requestedCount}개 결과 준비`,
    };
  if (batch.completedCount > 0)
    return {
      key: "partial",
      title: "준비된 룩부터 확인할 수 있어요",
      detail: `${batch.completedCount}/${batch.requestedCount}개 완료 · 나머지는 백그라운드에서 계속 생성합니다.`,
    };
  if (batch.state === "failed")
    return {
      key: "failed",
      title: "배치가 중단됐어요",
      detail: "완료된 결과를 보존한 채 미완료 슬롯만 다시 접수할 수 있습니다.",
    };
  return {
    key: batch.state === "approved" ? "queued" : "running",
    title: batch.state === "approved" ? `${batch.requestedCount}개 슬롯을 생성 큐에 연결하고 있어요` : "패션 룩을 생성하고 있어요",
    detail: `${batch.completedCount}/${batch.requestedCount}개 완료 · 서버 상태를 기준으로 자동 갱신합니다.`,
  };
}

export function FashionBatchWorkbench({ snapshot, mutate, saving, interviewEnabled = false }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">, options?: { navigate?: boolean }) => Promise<unknown>; saving: boolean; interviewEnabled?: boolean }) {
  const taskRuntime = useConsultationTaskRuntime();
  const style = selectedStyle(snapshot);
  const [direction, setDirection] = useState(snapshot.fashion.directionSnapshot);
  const [profileReady, setProfileReady] = useState<boolean | null>(snapshot.userId === "e2e-consulting" ? true : null);
  const [personalizationRequired, setPersonalizationRequired] = useState(false);
  const [previews, setPreviews] = useState<FashionPreviewCandidateV2[]>([]);
  const [batchState, setBatchState] = useState<BatchState>({
    batch: snapshot.fashionBatch,
    stylingSessionIds: [],
    adaptiveEnabled: snapshot.fashionBatch?.schemaVersion === "fashion-preview-batch-v2" ? true : undefined,
  });
  const [, setShortlist] = useState(snapshot.fashion.shortlistIds);
  const [selected, setSelected] = useState<SelectedFashionLook>(snapshot.fashion);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPurchase, setNeedsPurchase] = useState(false);
  const fashionIsStale = Boolean(snapshot.fashion.lookId && snapshot.colorDecision.id && snapshot.fashion.sourceColorSelectionId !== snapshot.colorDecision.id);

  const refresh = useCallback(async () => {
    const [previewResponse, batchResponse] = await Promise.all([fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/fashion-previews`, { cache: "no-store" }), fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/fashion-batch`, { cache: "no-store" })]);
    const previewData = (await previewResponse.json().catch(() => ({}))) as {
      previews?: FashionPreviewCandidateV2[];
      previewSet?: FashionPreviewSetV2 | null;
      error?: string;
    };
    const batchData = (await batchResponse.json().catch(() => ({}))) as BatchState & { error?: string };
    if (!previewResponse.ok) throw new Error(previewData.error || "패션 프리뷰 상태를 불러오지 못했습니다.");
    if (batchResponse.ok) setBatchState(batchData);
    setPreviews(previewData.previews ?? []);
    return {
      previews: previewData.previews ?? [],
      batch: batchData.batch ?? null,
    };
  }, [snapshot.sessionId]);

  useEffect(() => {
    if (snapshot.userId === "e2e-consulting") return;
    let cancelled = false;
    const timer = window.setTimeout(
      () =>
        void Promise.all([
          fetch("/api/style-profile", { cache: "no-store" }),
          refresh(),
          fetch("/api/v2/me/onboarding/fashion-personalization", {
            cache: "no-store",
          }),
        ])
          .then(async ([profileResponse, , personalizationResponse]) => {
            const data = (await profileResponse.json().catch(() => ({}))) as {
              profile?: { bodyPhotoPath?: string | null };
            };
            const personalizationData = (await personalizationResponse.json().catch(() => ({}))) as {
              coverage?: { complete?: boolean };
              policy?: { confirmedRevision?: number; revision?: number };
            };
            const legacy = personalizationResponse.status === 404;
            const personalizationReady = legacy || Boolean(personalizationResponse.ok && personalizationData.coverage?.complete && personalizationData.policy?.confirmedRevision === personalizationData.policy?.revision);
            if (!cancelled) {
              setPersonalizationRequired(!personalizationReady);
              setProfileReady(Boolean(profileResponse.ok && data.profile?.bodyPhotoPath && personalizationReady));
            }
          })
          .catch((cause) => {
            if (!cancelled) setError(cause instanceof Error ? cause.message : "패션 준비 상태를 확인하지 못했습니다.");
          }),
      0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [refresh, snapshot.userId]);

  useEffect(() => {
    if (!batchState.batch || !["approved", "generating", "partial"].includes(batchState.batch.state)) return;
    const timer = window.setInterval(() => {
      void fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/fashion-batch`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reconcile",
          batchId: batchState.batch?.id,
        }),
      })
        .then(() => refresh())
        .catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [batchState.batch, refresh, snapshot.sessionId]);

  const prepareBatch = async (requestedDirection = direction) => {
    if (!profileReady || working) return;
    setWorking(true);
    setError(null);
    setNeedsPurchase(false);
    try {
      const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/fashion-batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `${snapshot.sessionId}:fashion-batch:${snapshot.colorDecision.inputFingerprint || "no-color"}:${directionSummary(requestedDirection)}`,
        },
        body: JSON.stringify({ direction: requestedDirection }),
      });
      const data = (await response.json().catch(() => ({}))) as BatchState & {
        error?: string;
      };
      if (!response.ok || !data.batch) {
        if (response.status === 409) setNeedsPurchase(true);
        throw new Error(data.error || "패션 룩 생성 권한을 확인하지 못했습니다.");
      }
      setBatchState(data);
      setDirection(requestedDirection);
      taskRuntime.startTask(
        createClientConsultationTask({
          id: data.batch.id,
          kind: "fashion-generation",
          stage: "fashion",
          originStage: "fashion",
          destinationStage: "fashion",
          phaseKey: "generation",
          label: `${data.batch.requestedCount}개 패션 룩 배치`,
          detail: "확정한 헤어 한 개와 개인화 기준으로 모든 요청 슬롯을 생성합니다.",
          completedUnits: data.batch.completedCount,
          totalUnits: data.batch.requestedCount,
        }),
      );
      await refresh();
    } catch (cause) {
      const message = cause instanceof Error ? `${cause.message} 완료된 슬롯은 유지되며 같은 상담에서 이어갈 수 있습니다.` : "배치 실행을 완료하지 못했습니다.";
      setError(message);
      taskRuntime.failTask(message);
      await refresh().catch(() => undefined);
    } finally {
      setWorking(false);
    }
  };

  const resumeIncomplete = async () => {
    const { batch } = batchState;
    if (!batch || working) return;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/fashion-batch`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dispatch", batchId: batch.id }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || "미완료 슬롯을 서버에 재접수하지 못했습니다.");
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "미완료 슬롯을 재접수하지 못했습니다.");
      await refresh().catch(() => undefined);
    } finally {
      setWorking(false);
    }
  };

  const expandBatch = async () => {
    const batch = batchState.batch;
    if (!batch || batch.requestedCount >= 9 || batch.terminalCount !== batch.requestedCount || working) return;
    const targetRequestedCount = batch.requestedCount === 3 ? 6 : 9;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/fashion-batch/expand`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `fashion:${snapshot.sessionId}:${batch.generationInputFingerprint}:${targetRequestedCount}`,
        },
        body: JSON.stringify({
          batchId: batch.id,
          expectedRequestedCount: batch.requestedCount,
          targetRequestedCount,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as BatchState & {
        error?: string;
      };
      if (!response.ok || !data.batch) throw new Error(data.error || "패션 룩 3개를 추가하지 못했습니다.");
      setBatchState((current) => ({
        ...data,
        adaptiveEnabled: current.adaptiveEnabled,
      }));
      taskRuntime.startTask(
        createClientConsultationTask({
          id: data.batch.id,
          kind: "fashion-generation",
          stage: "fashion",
          originStage: "fashion",
          destinationStage: "fashion",
          phaseKey: "expansion",
          label: `${targetRequestedCount}개까지 패션 룩 확장`,
          detail: "기존 생성 결과를 보존하고 새 슬롯 3개만 생성합니다.",
          completedUnits: data.batch.completedCount,
          totalUnits: targetRequestedCount,
        }),
      );
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "패션 룩을 추가하지 못했습니다.");
    } finally {
      setWorking(false);
    }
  };

  const selectFinal = (preview: FashionPreviewCandidateV2) => {
    if (preview.status !== "completed" || !preview.imageUrl) return;
    setShortlist([preview.stylingSessionId]);
    setSelected(selectedLookFromPreview(preview, snapshot.colorDecision.id));
  };

  const saveSelection = async () => {
    if (!batchState.batch) return;
    const chosenId = selected.lookId ?? batchState.batch.recommendedPreviewId;
    const chosenPreview = previews.find((preview) => preview.stylingSessionId === chosenId && preview.status === "completed" && preview.imageUrl);
    if (!chosenId || !chosenPreview) return;
    const chosen = selected.lookId === chosenId ? selected : selectedLookFromPreview(chosenPreview, snapshot.colorDecision.id);
    setWorking(true);
    setError(null);
    try {
      const decision = chosenId === batchState.batch.recommendedPreviewId ? "accept_recommended" : "customer_override";
      const selectionResponse = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/fashion-batch/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: batchState.batch.id,
          previewId: chosenId,
          decision,
          expectedRevision: batchState.batch.revision,
        }),
      });
      const selectionData = (await selectionResponse.json().catch(() => ({}))) as BatchState & { error?: string };
      if (!selectionResponse.ok || !selectionData.batch) throw new Error(selectionData.error || "AI 권장안 선택을 저장하지 못했습니다.");
      setBatchState((current) => ({
        ...selectionData,
        adaptiveEnabled: current.adaptiveEnabled,
      }));
      const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/fashion-previews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `fashion:${snapshot.sessionId}:${snapshot.version}:${chosenId}`,
        },
        body: JSON.stringify({
          stylingSessionIds: [chosenId],
          selectedStylingSessionId: chosenId,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        previewSet?: FashionPreviewSetV2;
        error?: string;
      };
      if (!response.ok || !data.previewSet) throw new Error(data.error || "최종 패션 룩을 저장하지 못했습니다.");
      await mutate({
        fashion: {
          ...chosen,
          shortlistIds: [chosenId],
          directionSnapshot: data.previewSet.directionSnapshot,
          selectedAt: chosen.selectedAt || new Date().toISOString(),
          sourceColorSelectionId: snapshot.colorDecision.id,
          staleReason: null,
        },
        completeStage: "fashion",
        currentStage: "fashion",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "최종 패션 룩을 저장하지 못했습니다.");
    } finally {
      setWorking(false);
    }
  };

  const completed = previews.filter((preview) => preview.status === "completed" && preview.imageUrl);
  const visibleBatchStatus = batchStatusCopy(batchState.batch);
  const visibleSlotCount = batchState.batch?.requestedCount ?? (batchState.adaptiveEnabled === false ? 9 : 3);
  const visibleSlots = SLOTS.slice(0, visibleSlotCount);

  if (interviewEnabled && !batchState.batch && !fashionIsStale) {
    return (
      <FashionDirectionInterview
        consultationId={snapshot.sessionId}
        direction={direction}
        selectedHair={style?.label || "확정한 헤어"}
        personalColor={`${snapshot.personalColor.season} · ${snapshot.personalColor.confidence}`}
        discoveryAvoid={snapshot.discovery.avoid}
        saving={saving}
        disabled={!profileReady || working}
        onAutosave={async (nextDirection) => {
          setDirection(nextDirection);
          return (await mutate(
            {
              fashion: {
                ...snapshot.fashion,
                directionSnapshot: nextDirection,
              },
              currentStage: "fashion",
            },
            { navigate: false },
          )) as { ok?: boolean; conflict?: boolean };
        }}
        onConfirm={prepareBatch}
      />
    );
  }

  return (
    <WorkbenchGrid
      input={
        <div className="grid gap-5">
          {fashionIsStale ? (
            <Panel className="grid gap-3 border-[var(--app-warning)] p-5" role="status">
              <strong>확정 헤어 컬러가 변경되어 기존 패션 결과는 이전 컬러 기준입니다.</strong>
              <p className="text-sm text-[var(--app-muted)]">기존 결과는 보존됩니다. 새 컬러를 반영한 기본 3개 룩부터 새 배치로 생성합니다.</p>
              <Button
                type="button"
                variant="secondary"
                loading={working}
                onClick={() => {
                  setBatchState({
                    batch: null,
                    stylingSessionIds: [],
                    adaptiveEnabled: batchState.adaptiveEnabled,
                  });
                  setPreviews([]);
                  setShortlist([]);
                  setSelected({
                    ...snapshot.fashion,
                    lookId: null,
                    shortlistIds: [],
                    selectedAt: null,
                    staleReason: "color-selection-changed",
                  });
                  void prepareBatch(direction);
                }}
              >
                새 컬러로 패션 다시 생성
              </Button>
            </Panel>
          ) : null}
          <Panel className="grid gap-5 p-5 sm:p-7">
            <div>
              <p className="app-kicker">확정한 헤어와 어울리는 패션</p>
              <h2 className="mt-2 text-xl font-black">{style?.label || "확정한 헤어"}에서 AI 권장 룩부터 준비합니다</h2>
              <p className="mt-2 text-sm text-[var(--app-muted)]">기본 3개를 먼저 생성하고 원하면 6개·9개까지 확장합니다. 이미 생성된 결과는 하나도 숨기거나 교체하지 않습니다.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-black">
                계절
                <select
                  value={direction.season}
                  onChange={(event) =>
                    setDirection({
                      ...direction,
                      season: event.target.value as FashionDirectionSnapshot["season"],
                    })
                  }
                  className="app-input min-h-11 px-3"
                >
                  <option value="spring">봄</option>
                  <option value="summer">여름</option>
                  <option value="autumn">가을</option>
                  <option value="winter">겨울</option>
                  <option value="all-season">사계절</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-black">
                핏
                <select
                  value={direction.fit}
                  onChange={(event) =>
                    setDirection({
                      ...direction,
                      fit: event.target.value as FashionDirectionSnapshot["fit"],
                    })
                  }
                  className="app-input min-h-11 px-3"
                >
                  <option value="slim">슬림</option>
                  <option value="regular">레귤러</option>
                  <option value="relaxed">여유 있게</option>
                  <option value="oversized">오버사이즈</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-black">
                노출·넥라인
                <select
                  value={direction.exposure}
                  onChange={(event) =>
                    setDirection({
                      ...direction,
                      exposure: event.target.value as FashionDirectionSnapshot["exposure"],
                    })
                  }
                  className="app-input min-h-11 px-3"
                >
                  <option value="low">노출 적게</option>
                  <option value="balanced">균형 있게</option>
                  <option value="bold">과감하게</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-black">
                예산
                <input value={direction.budget} onChange={(event) => setDirection({ ...direction, budget: event.target.value })} className="app-input min-h-11 px-3 font-normal" />
              </label>
            </div>
            <label className="grid gap-2 text-sm font-black">
              회피 아이템
              <input
                value={direction.avoidItems.join(", ")}
                onChange={(event) =>
                  setDirection({
                    ...direction,
                    avoidItems: event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
                className="app-input min-h-11 px-3 font-normal"
              />
            </label>
            {profileReady === false ? (
              <p className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">
                {personalizationRequired ? "지속 패션 개인화 기준을 먼저 확정해 주세요." : "전신 사진과 바디 프로필이 필요합니다."}{" "}
                <Link href={personalizationRequired ? `/onboarding/fashion-personalization?returnTo=${encodeURIComponent(`/consulting/${snapshot.sessionId}/fashion`)}` : "/mypage"} className="font-black underline">
                  {personalizationRequired ? "개인화 기준 완성" : "프로필 완성"}
                </Link>
              </p>
            ) : null}
            <Button type="button" loading={working} disabled={!profileReady || Boolean(batchState.batch && ["approved", "generating", "partial", "ready"].includes(batchState.batch.state))} onClick={() => void prepareBatch(direction)}>
              {batchState.adaptiveEnabled === false ? "이 방향으로 9개 룩 준비" : "AI 권장 3개 룩 준비"}
            </Button>
          </Panel>
          {batchState.batch && ["approved", "partial", "failed"].includes(batchState.batch.state) ? (
            <Button type="button" variant="secondary" loading={working} onClick={() => void resumeIncomplete()}>
              미완료 슬롯 다시 시도
            </Button>
          ) : null}
          {needsPurchase ? (
            <p className="border border-[var(--app-border)] bg-[var(--app-surface)] p-3 text-sm">
              인터뷰 답변은 저장되어 있습니다.{" "}
              <Link href="/billing" className="font-black underline">
                이용 상품을 선택한 뒤 이어서 진행
              </Link>
              할 수 있습니다.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">
              {error}
            </p>
          ) : null}
          {completed.length >= 1 ? (
            <SaveStageButton loading={saving || working} disabled={!selected.lookId && !batchState.batch?.recommendedPreviewId} onClick={() => void saveSelection()}>
              {!selected.lookId || selected.lookId === batchState.batch?.recommendedPreviewId ? "AI 권장 룩 확정" : "선택한 패션 룩 확정"}
            </SaveStageButton>
          ) : null}
        </div>
      }
      output={
        <>
          <SurfaceCard className="p-5" data-fashion-batch-status={visibleBatchStatus.key} aria-live="polite">
            <p className="app-kicker">생성 진행 상태</p>
            <h2 className="mt-2 text-xl font-black">{visibleBatchStatus.title}</h2>
            <p className="mt-2 text-sm text-[var(--app-muted)]">{visibleBatchStatus.detail}</p>
            {batchState.batch?.lastHeartbeatAt ? <p className="mt-3 text-xs text-[var(--app-muted)]">최근 서버 확인 · {stableUtcTime(batchState.batch.lastHeartbeatAt)}</p> : null}
            {batchState.adaptiveEnabled !== false && batchState.batch && batchState.batch.terminalCount === batchState.batch.requestedCount && batchState.batch.requestedCount < 9 ? (
              <Button type="button" variant="secondary" loading={working} onClick={() => void expandBatch()} className="mt-4">
                3개 더 생성해서 모두 보기
              </Button>
            ) : null}
          </SurfaceCard>
          <SurfaceCard className="p-5">
            <p className="app-kicker">준비 중인 패션 제안</p>
            <h2 className="mt-2 text-xl font-black">요청한 {visibleSlotCount}개 결과를 모두 표시합니다</h2>
            <p className="mt-2 text-sm text-[var(--app-muted)]">완성된 결과와 다시 준비할 결과를 구분해 빠짐없이 보여드립니다.</p>
          </SurfaceCard>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-fashion-generated-gallery="all-generated" data-fashion-board-size={visibleSlotCount}>
            {visibleSlots.map((slot) => {
              const preview = previews.find((item) => item.slotId === slot.id);
              const final = Boolean(preview && selected.lookId === preview.stylingSessionId);
              const recommended = Boolean(preview && batchState.batch?.recommendedPreviewId === preview.stylingSessionId);
              const runtime = batchState.batch?.slotProgress[slot.id];
              const slotStatus = generationStatusLabel(preview?.status ?? runtime?.status ?? "idle");
              return (
                <SurfaceCard key={slot.id} className="overflow-hidden p-0" data-fashion-slot-id={slot.id} data-fashion-slot-role={batchState.batch?.slotRoles[slot.id] ?? "legacy"} data-fashion-slot-status={runtime?.status ?? preview?.status ?? "idle"}>
                  <div className="aspect-[3/4] bg-[var(--app-surface-muted)]">{preview?.imageUrl ? <img src={preview.imageUrl} alt={`${slot.label} AI 패션 프리뷰`} className="h-full w-full object-cover" loading="lazy" decoding="async" /> : <div className="grid h-full place-items-center p-5 text-center text-sm font-black text-[var(--app-muted)]">{slotStatus}</div>}</div>
                  <div className="grid gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="app-kicker">패션 제안</p>
                        <h3 className="mt-1 font-black">{preview?.headline || slot.label}</h3>
                      </div>
                      {recommended ? <span className="border border-[var(--app-accent)] px-2 py-1 text-xs font-black">AI 권장</span> : null}
                    </div>
                    <div>
                      <p className="text-xs text-[var(--app-muted)]">{preview?.summary || "헤어·컬러·바디 조건을 연결해 생성합니다."}</p>
                      {runtime ? (
                        <p className="mt-2 text-xs text-[var(--app-muted)]">
                          {generationStatusLabel(runtime.status)}
                          {runtime.attemptCount > 1 ? ` · 다시 준비 ${runtime.attemptCount - 1}회` : ""}
                          {runtime.errorMessage ? ` · ${runtime.errorMessage}` : ""}
                        </p>
                      ) : null}
                    </div>
                    {preview?.status === "completed" ? (
                      <Button type="button" variant={final ? "primary" : "secondary"} onClick={() => selectFinal(preview)}>
                        {final ? (recommended ? "AI 권장안 선택됨" : "선택됨") : "이 룩으로 변경"}
                      </Button>
                    ) : null}
                    {preview?.errorMessage ? <p className="text-xs text-[var(--app-danger)]">{preview.errorMessage}</p> : null}
                  </div>
                </SurfaceCard>
              );
            })}
          </div>
          <ConsultationSystemData snapshot={snapshot} />
        </>
      }
    />
  );
}
