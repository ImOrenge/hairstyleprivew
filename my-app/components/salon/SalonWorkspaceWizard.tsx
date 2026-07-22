"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  CheckCircle2,
  Scissors,
  UserRound,
  Wand2,
} from "lucide-react";
import { PaidActionQuoteCard } from "../billing/PaidActionQuoteCard";
import { PipelineStatusIndicator } from "../generate/PipelineStatusIndicator";
import { Button } from "../ui/Button";
import { Panel, SurfaceCard } from "../ui/Surface";
import { UploadArea } from "../upload/UploadArea";
import type {
  SalonCustomerStyleTarget,
  SalonServiceType,
} from "../../lib/salon-crm-types";
import { cn } from "../../lib/utils";
import { SalonWorkspaceStepNavigation } from "./SalonWorkspaceStepNavigation";
import { SalonWorkspaceVariantGrid } from "./SalonWorkspaceVariantGrid";
import { useSalonGenerationController } from "./useSalonGenerationController";

const serviceOptions: Array<{ value: SalonServiceType; label: string }> = [
  { value: "cut", label: "커트" },
  { value: "perm", label: "펌" },
  { value: "color", label: "염색" },
  { value: "bleach", label: "탈색" },
  { value: "treatment", label: "클리닉/트리트먼트" },
  { value: "other", label: "기타" },
];

function styleTargetLabel(value: SalonCustomerStyleTarget | null) {
  if (value === "male") return "남성";
  if (value === "female") return "여성";
  return "미선택";
}

export function SalonWorkspaceWizard({ customerId }: { customerId: string }) {
  const {
    canOpenGenerate,
    canOpenProgress,
    canOpenSelect,
    canSubmitGeneration,
    completedCount,
    createAftercare,
    creditReceipt,
    currentStep,
    customer,
    error,
    failedCount,
    generationId,
    generationQuote,
    generationQuoteError,
    generationQuoteLoading,
    gridGenerationProgress,
    handleConfirm,
    handleGenerate,
    handleResetPhoto,
    handleSelectFile,
    isAcceptanceReplay,
    isAdminReadOnly,
    isConfirming,
    isGenerating,
    isUploading,
    memo,
    message,
    nextRecommendedVisitAt,
    photoConsentConfirmed,
    pipelineError,
    pipelineMessage,
    pipelineStage,
    prepareGenerationQuote,
    previewUrl,
    progress,
    readyCount,
    recommendationGrid,
    salonBillingHref,
    selectedVariant,
    selectedVariantId,
    serviceDate,
    serviceType,
    setCreateAftercare,
    setCurrentStep,
    setMemo,
    setNextRecommendedVisitAt,
    setPhotoConsentConfirmed,
    setSelectedVariantId,
    setServiceDate,
    setServiceType,
    setStyleTarget,
    styleTarget,
  } = useSalonGenerationController({ customerId });

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pb-20 pt-6 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-[var(--app-border)] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href={`/salon/customers/${customerId}`} className="inline-flex items-center gap-2 text-sm font-bold text-[var(--app-muted)] hover:text-[var(--app-text)]">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            고객 상세
          </Link>
          <p className="app-kicker mt-4">살롱 헤어 워크스페이스</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--app-text)]">
            {customer?.name || "고객"} 헤어 상담 보드
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
            고객 사진 기반으로 헤어 후보를 만들고 선택 결과를 CRM 상담/시술 기록에 저장합니다.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-[420px]">
          <SurfaceCard className="px-3 py-2">
            <p className="text-xs text-[var(--app-muted)]">고객 타깃</p>
            <p className="mt-1 text-lg font-black text-[var(--app-text)]">{styleTargetLabel(styleTarget || null)}</p>
          </SurfaceCard>
          <SurfaceCard className="px-3 py-2">
            <p className="text-xs text-[var(--app-muted)]">완료</p>
            <p className="mt-1 text-lg font-black text-[var(--app-text)]">{completedCount}</p>
          </SurfaceCard>
          <SurfaceCard className="px-3 py-2">
            <p className="text-xs text-[var(--app-muted)]">대기/실패</p>
            <p className="mt-1 text-lg font-black text-[var(--app-text)]">{readyCount}/{failedCount}</p>
          </SurfaceCard>
        </div>
      </header>

      {isAdminReadOnly ? (
        <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          Admin read-only mode: 살롱 오너 계정에서 생성과 저장을 진행해 주세요.
        </div>
      ) : null}
      {error ? <div role="alert" className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div> : null}
      {message ? <div role="status" aria-live="polite" className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div> : null}

      <SalonWorkspaceStepNavigation
        canOpenGenerate={canOpenGenerate}
        canOpenProgress={canOpenProgress}
        canOpenSelect={canOpenSelect}
        currentStep={currentStep}
        onStepChange={setCurrentStep}
      />

      {currentStep === "upload" ? (
        <Panel as="section" className="grid gap-5 p-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:p-5">
          <div className="space-y-4">
            <div>
              <p className="app-kicker">1단계</p>
              <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">사진, 타깃, 동의 확인</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
                살롱 고객용 보드는 헤어 추천만 생성하며 패션/퍼스널컬러 단계로 이동하지 않습니다.
              </p>
            </div>
            <fieldset disabled={isAdminReadOnly} className="grid gap-4 disabled:opacity-70">
              <div className="grid gap-2">
                <p className="text-sm font-black text-[var(--app-text)]">고객 스타일 타깃</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["male", "female"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStyleTarget(value)}
                      className={cn(
                        "min-h-11 rounded-[var(--app-radius-control)] border px-4 py-2 text-sm font-black transition",
                        styleTarget === value
                          ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]"
                          : "border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] hover:border-[var(--app-border-strong)]",
                      )}
                    >
                      {styleTargetLabel(value)}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-start gap-3 border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3 text-sm leading-6 text-[var(--app-text)]">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={photoConsentConfirmed}
                  onChange={(event) => setPhotoConsentConfirmed(event.target.checked)}
                />
                <span>
                  고객에게 사진을 AI 헤어스타일 생성과 CRM 상담 기록 저장에 사용하는 것에 대한 동의를 확인했습니다.
                  {customer?.photoGenerationConsentAt ? (
                    <span className="mt-1 block text-xs text-[var(--app-muted)]">
                      기존 동의 기록: {new Date(customer.photoGenerationConsentAt).toLocaleString("ko-KR")}
                    </span>
                  ) : null}
                </span>
              </label>

              {previewUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleResetPhoto}
                >
                  사진 다시 선택
                </Button>
              ) : null}
            </fieldset>
          </div>

          <div className="mx-auto w-full max-w-xl">
            <UploadArea
              onSelectFile={handleSelectFile}
              onRejectFile={handleSelectFile}
              disabled={isUploading || isAdminReadOnly}
              previewUrl={previewUrl}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={() => setCurrentStep("generate")} disabled={!canOpenGenerate}>
                생성 접수로 이동
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      {currentStep === "generate" || currentStep === "progress" ? (
        <Panel as="section" className="overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <div className="relative min-h-[560px] bg-[var(--app-surface-muted)] lg:min-h-[640px]">
              {previewUrl ? (
                <Image src={previewUrl} alt="업로드한 고객 정면 사진" fill unoptimized className="object-contain" />
              ) : (
                <div className="flex min-h-[560px] items-center justify-center px-6 text-center text-sm text-[var(--app-muted)] lg:min-h-[640px]">
                  먼저 고객 사진을 업로드해 주세요.
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
                <p className="app-kicker">{currentStep === "progress" ? "3단계 · 생성 진행" : "2단계"}</p>
                <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">
                  {currentStep === "progress" ? "백그라운드 생성 진행" : "생성 접수"}
                </h2>
                <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
                  {currentStep === "progress"
                    ? "접수된 살롱 상담용 헤어 후보를 서버에서 생성하고 있습니다."
                    : "선택한 고객 타깃과 사진 분석 결과로 살롱 상담용 헤어 후보 생성을 접수합니다."}
                </p>
                {generationId ? (
                  <SurfaceCard className="mt-4 p-4" role="status" aria-live="polite">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-black text-[var(--app-text)]">백그라운드 생성이 시작되었습니다</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">
                          살롱 생성 작업 접수가 완료되었습니다. 이제 다른 페이지로 이동하거나 브라우저를 닫아도 계속 진행되며, 완료 시 살롱 계정 이메일로 알려드립니다.
                        </p>
                      </div>
                    </div>
                  </SurfaceCard>
                ) : (
                  <p className="mt-2 text-sm font-semibold leading-6 text-[var(--app-text)]">
                    “백그라운드 생성 시작” 안내가 표시될 때까지 이 화면을 유지해 주세요.
                  </p>
                )}
                {!generationId && !isAcceptanceReplay ? (
                  <div className="mt-5">
                    <PaidActionQuoteCard
                      billingHref={salonBillingHref}
                      error={generationQuoteError}
                      loading={generationQuoteLoading}
                      onRefresh={() => void prepareGenerationQuote().catch(() => undefined)}
                      payerLabel="살롱 계정"
                      quote={generationQuote}
                    />
                  </div>
                ) : null}
                {creditReceipt ? (
                  <SurfaceCard
                    className="mt-3 space-y-2 px-4 py-3"
                    role="status"
                    aria-live="polite"
                  >
                    <p className="text-[11px] font-bold uppercase text-[var(--app-muted)]">
                      살롱 크레딧 처리 상태
                    </p>
                    <p className="text-xs font-semibold text-[var(--app-text)]">
                      {creditReceipt.state === "reserved"
                        ? `${creditReceipt.reservedCredits}크레딧 예약됨`
                        : creditReceipt.state === "charged"
                          ? `${creditReceipt.chargedCredits}크레딧 차감 완료`
                          : `${creditReceipt.refundedCredits}크레딧 복구 완료`}
                    </p>
                    <p className="text-xs leading-5 text-[var(--app-muted)]">
                      고객 크레딧은 차감되지 않습니다. 전체 실패 시 살롱 계정으로 전액 자동 복구됩니다.
                    </p>
                  </SurfaceCard>
                ) : null}
                <SurfaceCard className="mt-3 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase text-[var(--app-muted)]">보드 진행률</p>
                      <p className="mt-1 text-2xl font-black text-[var(--app-text)]">{gridGenerationProgress}%</p>
                    </div>
                    <Wand2 className="h-7 w-7 text-[var(--app-accent-strong)]" aria-hidden="true" />
                  </div>
                </SurfaceCard>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={creditReceipt?.state === "refunded" ? () => setCurrentStep("upload") : handleGenerate}
                  disabled={
                    creditReceipt?.state === "refunded"
                      ? !canOpenGenerate || isGenerating || isAdminReadOnly
                      : !canSubmitGeneration
                  }
                >
                  {isGenerating
                    ? "접수 후 생성 상태 확인 중"
                    : creditReceipt?.state === "refunded"
                      ? "새 사진으로 다시 생성"
                    : generationId
                      ? "접수 상태 다시 확인"
                      : generationQuoteLoading
                        ? "살롱 견적 확인 중"
                        : generationQuote
                          ? `생성 접수 · ${generationQuote.costCredits}크레딧 예약`
                          : "살롱 견적 확인 필요"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setCurrentStep("upload")}>
                  사진/타깃 변경
                </Button>
                {canOpenSelect ? (
                  <Button type="button" variant="ghost" onClick={() => setCurrentStep("select")}>
                    후보 보기
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </Panel>
      ) : null}

      {currentStep === "select" ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <SalonWorkspaceVariantGrid
            canSubmitGeneration={canSubmitGeneration}
            isConfirming={isConfirming}
            onCheckGeneration={handleGenerate}
            onMoveToGeneration={() =>
              setCurrentStep(previewUrl ? "generate" : "upload")
            }
            onSelectVariant={setSelectedVariantId}
            recommendationGrid={recommendationGrid}
            selectedVariantId={selectedVariantId}
          />

          <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            <Panel as="section" className="p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] text-[var(--app-text)]">
                  {selectedVariant ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <UserRound className="h-5 w-5" aria-hidden="true" />}
                </span>
                <div>
                  <p className="text-sm font-black text-[var(--app-text)]">
                    {selectedVariant ? selectedVariant.label : "선택한 헤어가 없습니다"}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-[var(--app-muted)]">
                    {selectedVariant ? selectedVariant.reason : "완료된 후보를 선택하면 CRM 저장 폼이 활성화됩니다."}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-sm font-bold text-[var(--app-text)]">
                  시술 종류
                  <select
                    value={serviceType}
                    onChange={(event) => setServiceType(event.target.value as SalonServiceType)}
                    className="app-input h-11 px-3"
                  >
                    {serviceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-bold text-[var(--app-text)]">
                  시술/상담일
                  <input
                    type="date"
                    value={serviceDate}
                    onChange={(event) => setServiceDate(event.target.value)}
                    className="app-input h-11 px-3"
                  />
                </label>
                <label className="grid gap-1 text-sm font-bold text-[var(--app-text)]">
                  다음 추천 연락
                  <input
                    type="datetime-local"
                    value={nextRecommendedVisitAt}
                    onChange={(event) => setNextRecommendedVisitAt(event.target.value)}
                    className="app-input h-11 px-3"
                  />
                </label>
                <label className="grid gap-1 text-sm font-bold text-[var(--app-text)]">
                  내부 메모
                  <textarea
                    value={memo}
                    onChange={(event) => setMemo(event.target.value)}
                    rows={4}
                    className="app-input px-3 py-2"
                    placeholder="상담 중 확인한 요청사항"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm font-bold text-[var(--app-text)]">
                  <input
                    type="checkbox"
                    checked={createAftercare}
                    onChange={(event) => setCreateAftercare(event.target.checked)}
                  />
                  다음 추천 연락으로 사후관리 생성
                </label>

                {generationId && selectedVariantId ? (
                  <Link
                    href={`/result/${generationId}?variant=${encodeURIComponent(selectedVariantId)}`}
                    className="inline-flex min-h-10 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-text)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-muted)]"
                  >
                    결과 페이지 보기
                  </Link>
                ) : null}
                <Button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!generationId || !selectedVariantId || isConfirming || isAdminReadOnly}
                >
                  <Scissors className="mr-2 h-4 w-4" aria-hidden="true" />
                  {isConfirming ? "저장 중" : "CRM 기록 저장"}
                </Button>
              </div>
            </Panel>
          </aside>
        </section>
      ) : null}
    </div>
  );
}
