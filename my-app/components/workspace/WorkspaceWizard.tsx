"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { AftercareConfirmDialog } from "../aftercare/AftercareConfirmDialog";
import { UploadArea } from "../upload/UploadArea";
import { ValidationCheck } from "../upload/ValidationCheck";
import { Button } from "../ui/Button";
import { Panel, SurfaceCard } from "../ui/Surface";
import { WorkspaceStepNavigation } from "./WorkspaceStepNavigation";
import type { PersonalColorResult } from "../../lib/fashion-types";
import {
  WorkspaceAcceptedGenerationStatus,
} from "./WorkspaceAcceptedGenerationStatus";
import { WorkspaceGenerationSubmission } from "./WorkspaceGenerationSubmission";
import { WorkspaceVariantSelection } from "./WorkspaceVariantSelection";
import { useCustomerGenerationController } from "./useCustomerGenerationController";

function formatTone(value?: string | null) {
  if (value === "warm") return "웜톤";
  if (value === "cool") return "쿨톤";
  if (value === "neutral") return "뉴트럴";
  return "-";
}

function formatContrast(value?: string | null) {
  if (value === "low") return "낮은 대비";
  if (value === "high") return "높은 대비";
  if (value === "medium") return "중간 대비";
  return "-";
}

function PersonalColorSwatches({ colors }: { colors: PersonalColorResult["bestColors"] }) {
  if (!colors.length) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {colors.slice(0, 5).map((color) => (
        <span
          key={`${color.nameEn}-${color.hex}`}
          className="inline-flex items-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-1 text-xs font-bold text-[var(--app-text)]"
        >
          <span
            aria-hidden="true"
            className="h-4 w-4 rounded-full border border-black/10"
            style={{ backgroundColor: color.hex }}
          />
          {color.nameKo}
        </span>
      ))}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <SurfaceCard className="px-4 py-3">
      <p className="text-[11px] font-bold uppercase text-[var(--app-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-black text-[var(--app-text)]">{value}</p>
    </SurfaceCard>
  );
}

export function WorkspaceWizard() {
  const {
    acceptedGeneration,
    acceptedProgress,
    actionError,
    activeStep,
    analysisSummary,
    canOpenGenerate,
    canOpenProgress,
    canOpenSelect,
    completedCount,
    draftReady,
    draftUploadError,
    draftUploading,
    failedCount,
    generationId,
    generationQuote,
    generationQuoteError,
    generationQuoteLoading,
    gridGenerationProgress,
    handleGenerate,
    handleOpenAftercareConfirm,
    handleRegenerate,
    handleResetPhoto,
    handleSelectFile,
    handleSelectVariant,
    handleStepClick,
    isAdminReadOnly,
    isConfirmOpen,
    isGenerating,
    isLoadingPersonalColor,
    isSavingSelection,
    isUploading,
    mobileStepsOpen,
    personalColor,
    pipelineError,
    pipelineMessage,
    pipelineStage,
    previewUrl,
    progress,
    readyCount,
    recommendationGrid,
    refreshGenerationQuote,
    resultHref,
    retryGenerationDraft,
    selectedVariant,
    selectedVariantId,
    setIsConfirmOpen,
    showAcceptedGeneration,
    showGenerateStep,
    showGenerationEntryStep,
    showHome,
    showSelectStep,
    showUploadStep,
    stylerHref,
    toggleMobileSteps,
    uploadDetails,
    uploadMessage,
    uploadStatus,
  } = useCustomerGenerationController();

  return (
    <>
      <Panel as="section" className="overflow-hidden p-4 sm:p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="app-kicker">헤어 워크스페이스</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl">
              헤어 생성 워크스페이스
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
              사진 업로드부터 생성 접수, 서버 진행 확인, 결과 선택까지 한 흐름에서 진행합니다.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
            <StatTile label="준비" value={readyCount.toLocaleString("ko-KR")} />
            <StatTile label="완료" value={completedCount.toLocaleString("ko-KR")} />
            <StatTile label="실패" value={failedCount.toLocaleString("ko-KR")} />
          </div>
        </div>
      </Panel>

      <WorkspaceStepNavigation
        canOpenGenerate={canOpenGenerate}
        canOpenProgress={canOpenProgress}
        canOpenSelect={canOpenSelect}
        currentStep={activeStep}
        mobileOpen={mobileStepsOpen}
        onStepClick={handleStepClick}
        onToggleMobile={toggleMobileSteps}
      />

      {activeStep === "upload" ? (
        <Panel as="section" className="grid gap-5 p-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:p-5">
          <div className="space-y-4">
            <div>
              <p className="app-kicker">1단계</p>
              <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">사진 업로드/검증</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
                얼굴이 잘 보이는 정면 JPEG·PNG·WebP 사진을 사용하세요. 최대 8MB, 가로·세로 각각 512px 이상이어야 합니다.
              </p>
            </div>
            {isAdminReadOnly ? (
              <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                관리자 읽기 전용 모드입니다. 생성은 고객 계정에서 진행하세요.
              </div>
            ) : null}
            {previewUrl ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" onClick={handleResetPhoto}>
                  사진 다시 선택
                </Button>
              </div>
            ) : null}
          </div>

          <div className="mx-auto w-full max-w-xl">
            <UploadArea
              onSelectFile={handleSelectFile}
              onRejectFile={handleSelectFile}
              disabled={isUploading || isAdminReadOnly}
              previewUrl={previewUrl}
            />
            <div className="mt-4">
              <ValidationCheck
                status={uploadStatus}
                message={uploadMessage}
                details={uploadDetails}
              />
            </div>
            {previewUrl && !isLoadingPersonalColor && !personalColor ? (
              <SurfaceCard className="mt-4 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-[var(--app-text)]">첫 퍼스널컬러 진단</p>
                    <p className="mt-1 text-sm leading-5 text-[var(--app-muted)]">
                      업로드한 얼굴 사진으로 웜/쿨톤과 대비감을 분석해 이후 패션 추천 팔레트에 반영합니다.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href="/personal-color?source=upload&returnTo=%2Fworkspace&nextStep=generate"
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
                      >
                        첫 퍼스널컬러 진단
                      </Link>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={showGenerateStep}
                      >
                        헤어 생성으로 계속
                      </Button>
                    </div>
                  </div>
                </div>
              </SurfaceCard>
            ) : null}
            {previewUrl && personalColor ? (
              <SurfaceCard className="mt-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="app-kicker">퍼스널컬러</p>
                    <p className="mt-1 text-sm font-black text-[var(--app-text)]">
                      {formatTone(personalColor.tone)} · {formatContrast(personalColor.contrast)}
                    </p>
                    <p className="mt-1 text-sm leading-5 text-[var(--app-muted)]">
                      저장된 진단 결과를 스타일 추천에 사용합니다.
                    </p>
                  </div>
                  <span className="rounded-[var(--app-radius-control)] bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                    저장됨
                  </span>
                </div>
                <PersonalColorSwatches colors={personalColor.bestColors} />
                <Button type="button" className="mt-4" onClick={showGenerateStep}>
                  헤어 생성으로 계속
                </Button>
              </SurfaceCard>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {activeStep === "progress" && acceptedGeneration && acceptedProgress ? (
        <WorkspaceAcceptedGenerationStatus
          acceptedProgress={acceptedProgress}
          onResetPhoto={handleResetPhoto}
          onShowHome={showHome}
          onShowStatus={showAcceptedGeneration}
          reservedCredits={acceptedGeneration.reservedCredits}
        />
      ) : null}

      {activeStep === "generate" && !acceptedGeneration ? (
        <WorkspaceGenerationSubmission
          actionError={actionError}
          analysisSummary={analysisSummary}
          canOpenSelect={canOpenSelect}
          draftReady={draftReady}
          draftUploadError={draftUploadError}
          draftUploading={draftUploading}
          generationId={generationId}
          generationQuote={generationQuote}
          generationQuoteError={generationQuoteError}
          generationQuoteLoading={generationQuoteLoading}
          gridGenerationProgress={gridGenerationProgress}
          isAdminReadOnly={isAdminReadOnly}
          isGenerating={isGenerating}
          onChangePhoto={showUploadStep}
          onGenerate={handleGenerate}
          onOpenSelect={showSelectStep}
          onRefreshDraft={retryGenerationDraft}
          onRefreshQuote={refreshGenerationQuote}
          pipelineError={pipelineError}
          pipelineMessage={pipelineMessage}
          pipelineStage={pipelineStage}
          previewUrl={previewUrl}
          progress={progress}
        />
      ) : null}

      {activeStep === "select" ? (
        <WorkspaceVariantSelection
          actionError={actionError}
          generationId={generationId}
          isSavingSelection={isSavingSelection}
          onOpenAftercareConfirm={handleOpenAftercareConfirm}
          onRegenerate={handleRegenerate}
          onSelectVariant={handleSelectVariant}
          onShowGenerationStep={showGenerationEntryStep}
          recommendationGrid={recommendationGrid}
          resultHref={resultHref}
          selectedVariant={selectedVariant}
          selectedVariantId={selectedVariantId}
          stylerHref={stylerHref}
        />
      ) : null}

      {generationId && selectedVariantId ? (
        <AftercareConfirmDialog
          generationId={generationId}
          onOpenChange={setIsConfirmOpen}
          open={isConfirmOpen}
          selectedVariantId={selectedVariantId}
        />
      ) : null}
    </>
  );
}
