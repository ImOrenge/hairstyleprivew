"use client";

/* eslint-disable @next/next/no-img-element */

import { Check } from "lucide-react";
import Link from "next/link";
import { PaidActionQuoteCard } from "../billing/PaidActionQuoteCard";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { AppPage, Panel, SurfaceCard } from "../ui/Surface";
import type { FashionGenre } from "../../lib/fashion-types";
import {
  formatStylerBodyShape,
  formatStylerExposure,
  formatStylerFit,
  formatStylerFocus,
  formatStylerLength,
  formatStylerPersonalColor,
  STYLER_GENRE_OPTIONS,
  STYLER_STEP_DEFINITIONS,
  type StylerWizardStep,
} from "./stylerNewModel";
import { StylerHairSelectionModal } from "./StylerHairSelectionModal";
import type { StylerNewController } from "./useStylerNewController";
import { useResultTranslations } from "../../hooks/useResultTranslations";

function StylerStepBadge({
  step,
  currentStep,
  enabled,
  onClick,
}: {
  step: (typeof STYLER_STEP_DEFINITIONS)[number];
  currentStep: StylerWizardStep;
  enabled: boolean;
  onClick: (step: StylerWizardStep) => void;
}) {
  const active = currentStep === step.id;
  const complete = currentStep > step.id;
  return (
    <button
      data-pointer-glow={active ? undefined : "surface"}
      className={[
        "border px-4 py-4 text-left transition",
        active ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "app-card",
        complete && !active ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "",
        !enabled ? "cursor-not-allowed opacity-50" : "hover:border-stone-400",
      ].join(" ")}
      disabled={!enabled}
      onClick={() => onClick(step.id)}
      type="button"
    >
      <div className="flex items-center gap-3">
        <span
          className={[
            "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold",
            active ? "bg-white/15 text-white" : complete ? "bg-emerald-600 text-white" : "bg-[var(--app-surface-muted)] text-[var(--app-text)]",
          ].join(" ")}
        >
          {complete ? <Check className="h-4 w-4" /> : step.id}
        </span>
        <div>
          <p className={active ? "text-xs font-bold uppercase text-white/70" : "text-xs font-bold uppercase text-[var(--app-subtle)]"}>
            {step.eyebrow}
          </p>
          <p className="mt-1 text-base font-semibold">{step.title}</p>
        </div>
      </div>
    </button>
  );
}

function StylerOptionCard({
  option,
  selected,
  onSelect,
}: {
  option: { value: FashionGenre; label: string; description: string };
  selected: boolean;
  onSelect: (value: FashionGenre) => void;
}) {
  return (
    <button
      data-pointer-glow={selected ? undefined : "surface"}
      className={[
        "border px-4 py-4 text-left transition",
        selected
          ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)] shadow-[0_16px_40px_rgba(0,0,0,0.08)]"
          : "app-card hover:border-[var(--app-border-strong)]",
      ].join(" ")}
      onClick={() => onSelect(option.value)}
      type="button"
    >
      <p className={selected ? "text-sm font-bold text-white" : "text-sm font-bold text-[var(--app-text)]"}>{option.label}</p>
      <p className={selected ? "mt-2 text-sm leading-5 text-white/80" : "mt-2 text-sm leading-5 text-[var(--app-muted)]"}>
        {option.description}
      </p>
    </button>
  );
}

function StylerFieldLabel({ label, value }: { label: string; value: string }) {
  return (
    <SurfaceCard className="px-4 py-3">
      <p className="app-kicker">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[var(--app-text)]">{value}</p>
    </SurfaceCard>
  );
}

interface StylerNewViewProps {
  controller: StylerNewController;
}

export function StylerNewView({ controller }: StylerNewViewProps) {
  const {
    billingHref,
    closeHairModal,
    generateError,
    genre,
    hairGroups,
    hairListError,
    hairModalOpen,
    handleGenerate,
    handleGenreSelect,
    handleHairSelect,
    handleRecommend,
    handleStepChange,
    isGenerating,
    isLoadingHairList,
    isLoadingProfile,
    isLoadingVariant,
    isRecommending,
    openHairModal,
    profile,
    profileError,
    profileReady,
    quote,
    quoteError,
    quoteExpired,
    quoteLoading,
    recommendation,
    recommendError,
    refreshQuote,
    selectedGenre,
    selectedVariant,
    selectedVariantId,
    sessionId,
    setCurrentStep,
    stepOneReady,
    stepThreeReady,
    visibleStep,
  } = controller;
  const { translate } = useResultTranslations([
    selectedVariant?.label,
    selectedVariant?.reason,
    ...(selectedVariant?.tags || []),
  ]);
  const selectedVariantLabel = selectedVariant
    ? translate(selectedVariant.label, `추천 스타일 ${selectedVariant.rank}`)
    : "선택된 헤어스타일 없음";
  const selectedVariantReason = selectedVariant
    ? translate(selectedVariant.reason, "얼굴형과 전체 균형을 고려한 추천 스타일입니다.")
    : "빈 헤어스타일 영역을 눌러 최근 추천 결과에서 하나를 선택하세요.";

  return (
    <AppPage className="flex flex-col gap-6 pb-20 pt-8">
      <header className="space-y-2">
        <p className="app-kicker">패션 추천</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--app-text)]">헤어스타일에 맞춘 전신 코디 만들기</h1>
        <p className="max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
          먼저 선택한 헤어스타일과 바디 프로필을 확인한 뒤, 원하는 패션 장르를 선택하면 AI 카탈로그 기반 코디와 룩북 이미지를 생성합니다.
        </p>
      </header>

      <Panel as="section" className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="app-kicker">선택한 헤어스타일</p>
            <p className="text-xl font-bold text-[var(--app-text)]">
              {isLoadingVariant ? "헤어스타일을 불러오는 중..." : selectedVariantLabel}
            </p>
            <p className="max-w-2xl text-sm leading-6 text-[var(--app-muted)]">
              {selectedVariantReason}
            </p>
          </div>
          <div className="flex w-full gap-4 lg:w-auto">
            <button
              data-pointer-glow="surface"
              aria-label="헤어스타일 선택 모달 열기"
              className="app-card relative aspect-[4/5] w-28 overflow-hidden transition hover:border-[var(--app-border-strong)]"
              onClick={openHairModal}
              type="button"
            >
              {selectedVariant?.outputUrl ? (
                <img
                  className="h-full w-full object-cover"
                  src={selectedVariant.outputUrl}
                  alt={selectedVariantLabel}
                  decoding="async"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs font-medium text-stone-500">
                  헤어 선택
                </div>
              )}
            </button>
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <StylerFieldLabel label="기장" value={formatStylerLength(selectedVariant?.lengthBucket)} />
              <StylerFieldLabel label="보정 포인트" value={formatStylerFocus(selectedVariant?.correctionFocus)} />
              <div className="sm:col-span-2">
                <Button onClick={openHairModal} type="button" variant="secondary">헤어스타일 선택/변경</Button>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <section className="grid gap-3 md:grid-cols-3">
        {STYLER_STEP_DEFINITIONS.map((step) => (
          <StylerStepBadge
            currentStep={visibleStep}
            enabled={step.id === 1 || (step.id === 2 && stepOneReady) || (step.id === 3 && stepThreeReady)}
            key={step.id}
            onClick={handleStepChange}
            step={step}
          />
        ))}
      </section>

      {visibleStep === 1 ? (
        <Panel as="section" className="p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              <StylerFieldLabel label="키" value={profile?.heightCm ? `${profile.heightCm} cm` : "-"} />
              <StylerFieldLabel label="체형" value={formatStylerBodyShape(profile?.bodyShape)} />
              <StylerFieldLabel label="상의 사이즈" value={profile?.topSize || "-"} />
              <StylerFieldLabel label="하의 사이즈" value={profile?.bottomSize || "-"} />
              <StylerFieldLabel label="선호 핏" value={formatStylerFit(profile?.fitPreference)} />
              <StylerFieldLabel label="노출 선호" value={formatStylerExposure(profile?.exposurePreference)} />
              <StylerFieldLabel label="퍼스널컬러" value={formatStylerPersonalColor(profile)} />
              <StylerFieldLabel label="전신 사진" value={profile?.bodyPhotoPath ? "저장됨" : "필요"} />
              <StylerFieldLabel label="선택 헤어" value={selectedVariant ? selectedVariantLabel : "필요"} />
            </div>
            <div className="w-full max-w-sm space-y-3">
              <SurfaceCard className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="app-kicker">준비 상태</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--app-text)]">
                    {isLoadingProfile ? "프로필 확인 중" : stepOneReady ? "추천 준비 완료" : "추가 설정 필요"}
                  </p>
                </div>
                <span className={["rounded-full px-3 py-1 text-xs font-bold", stepOneReady ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"].join(" ")}>
                  {stepOneReady ? "준비됨" : "필요"}
                </span>
              </SurfaceCard>
              <SurfaceCard className="relative aspect-[4/5] overflow-hidden">
                {profile?.bodyPhotoUrl ? (
                  <img
                    className="h-full w-full object-cover"
                    src={profile.bodyPhotoUrl}
                    alt="저장된 전신 참고 사진"
                    decoding="async"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-stone-500">
                    룩북 생성을 위해 마이페이지에서 전신 참고 사진을 저장해 주세요.
                  </div>
                )}
              </SurfaceCard>
              <SurfaceCard className="space-y-2 px-4 py-4">
                <p className="app-kicker">전신 사진 개인정보 안내</p>
                <p className="text-sm leading-6 text-[var(--app-muted)]">
                  사진은 HairFit 비공개 저장소에 보관되며 패션 추천과 룩북 생성 때만 짧은 시간 동안 안전하게 불러옵니다.
                  새 사진으로 교체하면 이전 파일은 삭제되고, 직접 삭제하기 전까지 바디 프로필에 보관됩니다.
                </p>
                <Link className="inline-flex text-sm font-bold text-[var(--app-text)] underline underline-offset-4" href="/mypage">
                  마이페이지에서 사진 교체·삭제
                </Link>
              </SurfaceCard>
            </div>
          </div>

          {!selectedVariant ? (
            <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              패션 추천을 시작하려면 결과 화면에서 헤어스타일을 먼저 선택해야 합니다.
            </p>
          ) : null}
          {profileError ? (
            <p className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{profileError}</p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            {!profileReady ? <Link href="/mypage"><Button type="button" variant="secondary">바디 프로필 완성하기</Button></Link> : null}
            {!selectedVariant ? <Button onClick={openHairModal} type="button" variant="secondary">선택할 헤어스타일 찾기</Button> : null}
            <Button disabled={!stepOneReady || isLoadingProfile || isLoadingVariant} onClick={() => setCurrentStep(2)} type="button">
              다음: 패션 장르 선택
            </Button>
          </div>
        </Panel>
      ) : null}

      {visibleStep === 2 ? (
        <Panel as="section" className="space-y-6 p-6">
          <div>
            <p className="app-kicker">2단계</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--app-text)]">추천받을 패션 장르를 선택하세요</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
              AI가 저장한 주간 패션 카탈로그에서 선택한 장르에 맞는 코디 방향을 가져옵니다.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {STYLER_GENRE_OPTIONS.map((option) => (
              <StylerOptionCard key={option.value} onSelect={handleGenreSelect} option={option} selected={genre === option.value} />
            ))}
          </div>
          <SurfaceCard className="px-4 py-4">
            <p className="app-kicker">선택한 방향</p>
            <p className="mt-2 text-sm leading-6 text-[var(--app-text)]">{selectedGenre.label}: {selectedGenre.description}</p>
          </SurfaceCard>
          {recommendError ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{recommendError}</p> : null}
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setCurrentStep(1)} type="button" variant="secondary">이전</Button>
            <Button disabled={isRecommending || isGenerating} onClick={handleRecommend} type="button">
              {isRecommending ? "추천 생성 중..." : "패션 추천 만들기"}
            </Button>
          </div>
        </Panel>
      ) : null}

      {visibleStep === 3 ? (
        <Panel as="section" className="space-y-6 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="app-kicker">3단계</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--app-text)]">{recommendation?.headline || "패션 추천 미리보기"}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
                {recommendation?.summary || "패션 추천을 먼저 만든 뒤 룩북 이미지를 생성할 수 있습니다."}
              </p>
            </div>
            <SurfaceCard className="px-4 py-3">
              <p className="app-kicker">장르</p>
              <p className="mt-1 text-sm font-semibold text-[var(--app-text)]">{selectedGenre.label}</p>
            </SurfaceCard>
          </div>

          {stepThreeReady && recommendation ? (
            <>
              <div className="grid gap-4 lg:grid-cols-[0.62fr_1fr]">
                <SurfaceCard className="p-4">
                  <p className="app-kicker">선택한 헤어스타일</p>
                  <div className="mt-4 flex gap-4">
                    <SurfaceCard className="relative aspect-[4/5] w-28 overflow-hidden">
                      {selectedVariant?.outputUrl ? (
                        <img
                          className="h-full w-full object-cover"
                          src={selectedVariant.outputUrl}
                          alt={selectedVariantLabel}
                          decoding="async"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-stone-500">헤어 미리보기</div>
                      )}
                    </SurfaceCard>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--app-text)]">{selectedVariant ? selectedVariantLabel : "-"}</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">{selectedVariant ? selectedVariantReason : "-"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(selectedVariant?.tags || []).slice(0, 4).map((tag, index) => <span className="app-chip px-3 py-1 text-xs font-medium" key={tag}>{translate(tag, `스타일 특징 ${index + 1}`)}</span>)}
                      </div>
                    </div>
                  </div>
                </SurfaceCard>
                <div className="grid gap-4 sm:grid-cols-3">
                  <StylerFieldLabel label="실루엣" value={recommendation.silhouette} />
                  <StylerFieldLabel label="팔레트" value={recommendation.palette.join(", ")} />
                  <StylerFieldLabel label="아이템" value={`${recommendation.items.length}개 구성`} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {recommendation.items.map((item) => (
                  <SurfaceCard as="article" className="p-4" key={item.slot}>
                    <p className="app-kicker">{item.slot}</p>
                    <h3 className="mt-2 text-base font-bold text-[var(--app-text)]">{item.name}</h3>
                    <p className="mt-2 text-sm leading-5 text-[var(--app-muted)]">{item.description}</p>
                    <p className="mt-3 text-xs text-[var(--app-subtle)]">{item.color} · {item.fit} · {item.material}</p>
                  </SurfaceCard>
                ))}
              </div>
              <SurfaceCard className="px-4 py-4">
                <p className="app-kicker">스타일링 메모</p>
                <div className="mt-3 grid gap-2">
                  {recommendation.stylingNotes.map((note) => <p className="text-sm leading-6 text-[var(--app-text)]" key={note}>{note}</p>)}
                </div>
              </SurfaceCard>
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center">
              <p className="text-sm font-semibold text-stone-900">추천이 아직 없습니다</p>
              <p className="mt-2 text-sm leading-6 text-stone-600">2단계에서 패션 장르를 선택하고 추천을 먼저 생성하세요.</p>
            </div>
          )}

          {sessionId ? (
            <div className="space-y-2">
              <PaidActionQuoteCard
                billingHref={billingHref}
                error={quoteError}
                loading={quoteLoading}
                onRefresh={refreshQuote}
                payerLabel="내 HairFit 계정"
                quote={quote}
              />
              <p className="text-xs leading-5 text-[var(--app-muted)]">
                결제나 충전 후에도 룩북은 자동으로 생성되지 않습니다. 최신 견적을 다시 확인하고 생성 버튼을 직접 눌러 주세요.
              </p>
            </div>
          ) : null}
          {generateError ? <InlineAlert title="룩북 이미지를 생성하지 못했습니다" tone="danger">{generateError}</InlineAlert> : null}
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setCurrentStep(2)} type="button" variant="secondary">이전</Button>
            <Button
              disabled={!stepThreeReady || isGenerating || quoteLoading || !quote || quoteExpired || !quote.isAllowed}
              onClick={handleGenerate}
              type="button"
            >
              {isGenerating ? "룩북 생성 요청 처리 중..." : quote ? `${quote.costCredits}크레딧으로 룩북 생성` : "견적 확인 후 룩북 생성"}
            </Button>
          </div>
        </Panel>
      ) : null}

      <StylerHairSelectionModal
        error={hairListError}
        groups={hairGroups}
        isLoading={isLoadingHairList}
        onClose={closeHairModal}
        onSelect={handleHairSelect}
        open={hairModalOpen}
        selectedVariantId={selectedVariantId}
      />
    </AppPage>
  );
}
