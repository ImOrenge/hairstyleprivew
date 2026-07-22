"use client";

/* eslint-disable @next/next/no-img-element */

import {
  HAIRSTYLE_GENERATION_CREDITS,
  type PaidActionQuote,
} from "@hairfit/shared";
import { Sparkles } from "lucide-react";
import type { FaceAnalysisSummary } from "../../lib/recommendation-types";
import { PaidActionQuoteCard, usePaidActionQuoteExpired } from "../billing/PaidActionQuoteCard";
import { PipelineStatusIndicator } from "../generate/PipelineStatusIndicator";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { Panel, SurfaceCard } from "../ui/Surface";

export interface WorkspaceGenerationSubmissionProps {
  actionError: string | null;
  analysisSummary: FaceAnalysisSummary | null;
  canOpenSelect: boolean;
  draftReady: boolean;
  draftUploadError: string | null;
  draftUploading: boolean;
  generationId: string | null;
  generationQuote: PaidActionQuote | null;
  generationQuoteError: string | null;
  generationQuoteLoading: boolean;
  gridGenerationProgress: number;
  isAdminReadOnly: boolean;
  isGenerating: boolean;
  onChangePhoto: () => void;
  onGenerate: () => void;
  onOpenSelect: () => void;
  onRefreshDraft: () => void;
  onRefreshQuote: () => void;
  pipelineError: string | null;
  pipelineMessage: string;
  pipelineStage: Parameters<typeof PipelineStatusIndicator>[0]["stage"];
  previewUrl: string | null;
  progress: number;
}

export function WorkspaceGenerationSubmission({
  actionError,
  analysisSummary,
  canOpenSelect,
  draftReady,
  draftUploadError,
  draftUploading,
  generationId,
  generationQuote,
  generationQuoteError,
  generationQuoteLoading,
  gridGenerationProgress,
  isAdminReadOnly,
  isGenerating,
  onChangePhoto,
  onGenerate,
  onOpenSelect,
  onRefreshDraft,
  onRefreshQuote,
  pipelineError,
  pipelineMessage,
  pipelineStage,
  previewUrl,
  progress,
}: WorkspaceGenerationSubmissionProps) {
  const generationQuoteExpired = usePaidActionQuoteExpired(generationQuote);

  return (
    <Panel as="section" className="overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div className="relative min-h-[560px] bg-[var(--app-surface-muted)] lg:min-h-[640px]">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="업로드한 정면 사진"
              className="absolute inset-0 h-full w-full object-contain"
              decoding="async"
              loading="eager"
            />
          ) : (
            <div className="flex min-h-[560px] items-center justify-center px-6 text-center text-sm text-[var(--app-muted)] lg:min-h-[640px]">
              먼저 사진을 업로드하세요.
            </div>
          )}
          <div className="absolute inset-x-3 top-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[360px]">
            <PipelineStatusIndicator
              stage={pipelineStage}
              message={pipelineMessage}
              error={pipelineError}
              progress={progress}
              mode="overlay"
            />
          </div>
        </div>

        <div className="flex flex-col justify-between gap-6 border-t border-[var(--app-border)] p-4 lg:border-l lg:border-t-0 lg:p-6">
          <div>
            <p className="app-kicker">2단계</p>
            <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">생성 접수</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
              얼굴형, 밸런스, 볼륨 전략을 분석한 뒤 9가지 헤어 후보를 생성합니다.
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-[var(--app-text)]">
              사진 보안 업로드와 생성 접수가 끝나 “백그라운드 생성 시작” 안내가 표시될 때까지 이 화면을 유지해 주세요.
            </p>
            <SurfaceCard
              className="mt-5 flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <div>
                <p className="text-sm font-black text-[var(--app-text)]">
                  {draftUploading
                    ? "사진 보안 업로드 중"
                    : draftReady
                      ? "접수 준비 완료"
                      : draftUploadError
                        ? "사진 업로드 확인 필요"
                        : "사진 업로드 대기"}
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--app-muted)]">
                  {draftUploading
                    ? "사진을 암호화된 연결로 안전하게 보관하고 있습니다. 이 단계가 끝날 때까지 페이지를 유지해 주세요."
                    : draftReady
                      ? "사진이 안전하게 보관되었습니다. 생성 접수를 시작할 수 있습니다."
                      : draftUploadError ||
                        "사진을 선택하면 접수에 필요한 보안 업로드가 자동으로 시작됩니다."}
                </p>
              </div>
              {draftUploadError && previewUrl && !draftUploading ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onRefreshDraft}
                  disabled={isAdminReadOnly}
                >
                  사진 업로드 다시 시도
                </Button>
              ) : null}
            </SurfaceCard>
            <div className="mt-3">
              <PaidActionQuoteCard
                billingHref="/billing?returnTo=%2Fworkspace%3FnextStep%3Dgenerate"
                error={generationQuoteError}
                loading={generationQuoteLoading}
                onRefresh={onRefreshQuote}
                payerLabel="내 HairFit 계정"
                quote={generationQuote}
              />
            </div>
            {analysisSummary ? (
              <SurfaceCard className="mt-5 p-4">
                <p className="app-kicker">분석 요약</p>
                <h3 className="mt-2 text-xl font-black text-[var(--app-text)]">
                  {analysisSummary.faceShape}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
                  {analysisSummary.summary}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {analysisSummary.volumeFocus.map((item) => (
                    <span key={item} className="app-chip px-3 py-1 text-xs font-bold">
                      {item}
                    </span>
                  ))}
                </div>
              </SurfaceCard>
            ) : null}
          </div>

          <div className="grid gap-3">
            <SurfaceCard className="px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase text-[var(--app-muted)]">보드 진행률</p>
                  <p className="mt-1 text-2xl font-black text-[var(--app-text)]">
                    {gridGenerationProgress}%
                  </p>
                </div>
                <Sparkles
                  className="h-7 w-7 text-[var(--app-accent-strong)]"
                  aria-hidden="true"
                />
              </div>
            </SurfaceCard>
            {actionError ? (
              <InlineAlert title="생성 작업을 진행하지 못했습니다" tone="danger">
                {actionError}
              </InlineAlert>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={onGenerate}
                disabled={
                  !previewUrl ||
                  !draftReady ||
                  draftUploading ||
                  isGenerating ||
                  isAdminReadOnly ||
                  generationQuoteLoading ||
                  generationQuoteExpired ||
                  !generationQuote?.isAllowed
                }
              >
                {draftUploading
                  ? "사진 보안 업로드 중"
                  : isGenerating
                    ? "접수 중"
                    : draftReady
                      ? generationId || generationQuote?.freeReason === "already_accepted"
                        ? "접수 상태 다시 확인"
                        : `생성 접수 · ${generationQuote?.costCredits ?? HAIRSTYLE_GENERATION_CREDITS}크레딧 예약`
                      : "사진 업로드 대기"}
              </Button>
              <Button type="button" variant="secondary" onClick={onChangePhoto}>
                사진 변경
              </Button>
              {canOpenSelect ? (
                <Button type="button" variant="ghost" onClick={onOpenSelect}>
                  후보 보기
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
