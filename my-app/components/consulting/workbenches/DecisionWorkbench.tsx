"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClientConsultationTask, type ConsultationPatch, type ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { deriveDecisionSnapshot } from "../../../lib/consulting/decision-derivation";
import { useConsultationTaskRuntime } from "../transition/ConsultationTaskRuntime";
import { consultationStageHrefForPath } from "../../../lib/consulting/routes";
import { ConsultationSystemData, DefinitionRows, Panel, SaveStageButton, SurfaceCard, WorkbenchGrid } from "./shared";

export function DecisionWorkbench({ snapshot, mutate, saving }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">, options?: { navigate?: boolean }) => Promise<unknown>; saving: boolean }) {
  const taskRuntime = useConsultationTaskRuntime();
  const pathname = usePathname();
  const candidate = snapshot.previews.find((item) => item.id === snapshot.finalist.finalistPreviewId) ?? null;
  const decision = deriveDecisionSnapshot(snapshot);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = Boolean(snapshot.selectedStyleHistory.at(-1)?.serviceConfirmedAt);
  const recoveryStage = snapshot.shortlist.previewIds.length >= 2 ? "compare" : "previews";
  const recoveryHref = consultationStageHrefForPath(snapshot.sessionId, recoveryStage, pathname);
  const syncSelectionV2 = async (previewVariantId: string) => {
    const selectionResponse = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/selection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        previewVariantId,
        expectedVersion: snapshot.version,
      }),
    });
    const selectionData = (await selectionResponse.json().catch(() => ({}))) as {
      selection?: { id?: string; previewVariantId?: string; status?: string };
      consultationVersion?: number;
      error?: string;
    };
    if (selectionResponse.status === 404 && selectionData.error === "HairFit V2 feature is disabled.") return;
    if (!selectionResponse.ok || !selectionData.selection?.id || !Number.isInteger(selectionData.consultationVersion)) {
      const latestResponse = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/selection`, { cache: "no-store" });
      const latestData = (await latestResponse.json().catch(() => ({}))) as {
        selection?: { previewVariantId?: string; status?: string };
      };
      if (latestResponse.ok && latestData.selection?.status === "confirmed" && latestData.selection.previewVariantId === previewVariantId) return;
      throw new Error(selectionData.error || "V2 선택 스냅샷을 만들지 못했습니다.");
    }
    const confirmResponse = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        snapshotId: selectionData.selection.id,
        expectedVersion: selectionData.consultationVersion,
      }),
    });
    if (!confirmResponse.ok) {
      const confirmData = (await confirmResponse.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(confirmData.error || "V2 선택을 확정하지 못했습니다.");
    }
  };
  const createAutomaticBrief = async () => {
    const fallback = {
      ...snapshot.salonBrief,
      version: 1,
      summary: candidate ? `${candidate.label}: ${candidate.reason}` : "선택 스타일 브리프",
      cut: decision.services.includes("커트") ? "확정 전략의 길이와 레이어 시작점을 현장에서 조정" : "현재 길이를 우선 유지하고 커트 필요 여부 확인",
      volumeTexture: `정수리 ${snapshot.strategy.crownVolume} · 측면 ${snapshot.strategy.sideVolume} · 질감 ${snapshot.strategy.texture}`,
      styling: decision.maintenance,
      caution: decision.limitations,
      rawFaceIncluded: false as const,
      createdAt: new Date().toISOString(),
    };
    const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/salon-brief`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `${snapshot.sessionId}:auto-brief:${candidate?.id ?? "unknown"}`,
      },
      body: JSON.stringify({}),
    });
    const data = (await response.json().catch(() => ({}))) as {
      brief?: {
        version?: number;
        summary?: string;
        cut?: unknown;
        volumeTexture?: unknown;
        styling?: string[];
        cautions?: string[];
        createdAt?: string;
      };
      error?: string;
    };
    if (response.status === 404 && data.error === "HairFit V2 feature is disabled.") return fallback;
    if (!response.ok || !data.brief) throw new Error(data.error || "자동 살롱 브리프를 만들지 못했습니다.");
    const text = (value: unknown, fallbackValue: string) => {
      if (typeof value === "string" && value.trim()) return value;
      if (value && typeof value === "object") {
        const instruction = (value as { instruction?: unknown }).instruction;
        if (typeof instruction === "string" && instruction.trim()) return instruction;
        return JSON.stringify(value);
      }
      return fallbackValue;
    };
    return {
      ...fallback,
      version: data.brief.version ?? fallback.version,
      summary: data.brief.summary ?? fallback.summary,
      cut: text(data.brief.cut, fallback.cut),
      volumeTexture: text(data.brief.volumeTexture, fallback.volumeTexture),
      styling: data.brief.styling?.join(" · ") || fallback.styling,
      caution: data.brief.cautions ?? fallback.caution,
      createdAt: data.brief.createdAt ?? fallback.createdAt,
    };
  };
  const saveDecision = async () => {
    if (!candidate || locked) return;
    taskRuntime.startTask(
      createClientConsultationTask({
        id: `brief:${snapshot.sessionId}:${candidate.id}`,
        kind: "brief",
        stage: "decision",
        originStage: "decision",
        destinationStage: "salon-brief",
        phaseKey: "summary",
        label: "Salon Brief 구성",
        detail: "선택한 스타일을 시술 가능한 요청서로 정리합니다.",
        completedUnits: 0,
        totalUnits: 3,
      }),
    );
    setSyncing(true);
    setError(null);
    try {
      await syncSelectionV2(candidate.id);
      taskRuntime.updateTask({
        phaseKey: "services",
        phaseIndex: 1,
        completedUnits: 1,
        detail: "확정된 선택과 필요한 시술 항목을 연결했습니다.",
      });
      const salonBrief = await createAutomaticBrief();
      taskRuntime.updateTask({
        phaseKey: "constraints",
        phaseIndex: 2,
        completedUnits: 2,
        partialOutputCount: 2,
        detail: "브리프 초안과 관리·회피 조건을 서버에서 받았습니다.",
      });
      const result = (await mutate(
        {
          selectedStyle: {
            previewId: candidate.id,
            label: candidate.label,
            reason: candidate.reason,
            imageUrl: candidate.imageUrl,
            generatedImagePath: candidate.generatedImagePath,
            feasibility: decision.feasibility,
            currentHairGap: decision.currentHairGap,
            services: decision.services,
            maintenance: decision.maintenance,
            limitations: decision.limitations,
            strategy: snapshot.strategy,
          },
          salonBrief,
          completeStage: "decision",
          currentStage: "salon-brief",
        },
        { navigate: false },
      )) as { ok?: boolean };
      if (!result.ok) throw new Error("선택과 미용실 전달 내용을 상담에 저장하지 못했습니다.");
      taskRuntime.completeTask({
        completedUnits: 3,
        totalUnits: 3,
        partialOutputCount: 3,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "스타일 선택을 저장하지 못했습니다.";
      setError(message);
      taskRuntime.failTask(message);
    } finally {
      setSyncing(false);
    }
  };
  return (
    <WorkbenchGrid
      input={
        <Panel className="grid gap-5 p-5 sm:p-7">
          <div>
            <p className="app-kicker">최종 확인</p>
            <h2 className="mt-2 text-xl font-black">이 스타일을 실제로 구현할 조건</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">현재 모발과 관리 조건을 바탕으로 시술 전 확인할 내용을 정리했습니다. 조건을 바꾸려면 앞 단계에서 수정할 수 있어요.</p>
          </div>
          <DefinitionRows
            items={[
              { label: "실현 가능성", value: decision.feasibility },
              { label: "현재 모발과의 차이", value: decision.currentHairGap },
              {
                label: "필요·허용 시술",
                value: decision.services.join(", ") || "커트·드라이 중심",
              },
              { label: "관리 요구", value: decision.maintenance },
              {
                label: "제약·현장 확인",
                value: decision.limitations.join(", ") || "사진과 현장 모질 차이 확인",
              },
            ]}
          />
          {!candidate ? (
            <SurfaceCard className="grid gap-3 border-[var(--app-warning)] bg-[var(--app-warning-bg)] p-4">
              <div>
                <p className="font-black">확정할 헤어가 아직 없어요</p>
                <p className="mt-1 text-sm leading-6">{recoveryStage === "compare" ? "비교해 둔 후보 중 하나를 최종으로 골라 주세요." : "완성된 헤어 후보를 확인하고 비교할 스타일을 먼저 골라 주세요."}</p>
              </div>
              <Link href={recoveryHref} className="inline-flex min-h-11 items-center justify-center border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-4 text-sm font-black">
                {recoveryStage === "compare" ? "후보 비교로 돌아가기" : "헤어 후보 확인하기"}
              </Link>
            </SurfaceCard>
          ) : null}
          {locked ? <SurfaceCard className="p-4 text-sm font-bold">실제 시술이 확정되어 선택이 잠겼습니다.</SurfaceCard> : null}
          {error ? (
            <p role="alert" className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">
              {error}
            </p>
          ) : null}
          <SaveStageButton loading={saving || syncing} disabled={!candidate || locked} onClick={() => void saveDecision()}>
            최종 스타일 확정
          </SaveStageButton>
        </Panel>
      }
      output={
        <>
          <Panel className="overflow-hidden">
            {candidate?.imageUrl ? (
              <div className="aspect-[4/5] bg-[var(--app-surface-muted)]">
                <img src={candidate.imageUrl} alt={candidate.label} className="h-full w-full object-cover" decoding="async" loading="eager" />
              </div>
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center bg-[var(--app-surface-muted)] text-sm text-[var(--app-muted)]">최종 후보 이미지 없음</div>
            )}
            <div className="p-5">
              <p className="app-kicker">내가 고른 AI 추천</p>
              <h2 className="mt-2 text-2xl font-black">{candidate?.label || "후보를 먼저 선택하세요"}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{candidate?.reason}</p>
              {candidate ? (
                <div className="mt-5">
                  <DefinitionRows
                    items={[
                      { label: "스타일 방향", value: candidate.axis },
                      {
                        label: "준비 상태",
                        value: candidate.status === "accepted" ? "확인 완료" : "확인 중",
                      },
                      {
                        label: "선택 시각",
                        value: snapshot.finalist.decidedAt ? new Date(snapshot.finalist.decidedAt).toLocaleString("ko-KR") : "선택 전",
                      },
                    ]}
                  />
                </div>
              ) : null}
            </div>
          </Panel>
          <ConsultationSystemData snapshot={snapshot} />
        </>
      }
    />
  );
}
