"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Check, Scissors, X } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { AppPage, Panel, SurfaceCard } from "../../../components/ui/Surface";
import type { FashionGenre, FashionRecommendation, StyleProfile } from "../../../lib/fashion-types";
import type { FaceAnalysisSummary, GeneratedVariant } from "../../../lib/recommendation-types";

interface ProfileResponse {
  profile?: StyleProfile;
  error?: string;
}

interface RecommendResponse {
  sessionId?: string;
  recommendation?: FashionRecommendation;
  selectedVariant?: GeneratedVariant;
  error?: string;
}

interface GenerateResponse {
  sessionId?: string;
  error?: string;
}

interface GenerationResponse {
  selectedVariant?: GeneratedVariant | null;
  recommendationSet?: {
    analysis?: FaceAnalysisSummary;
    variants?: GeneratedVariant[];
  } | null;
  error?: string;
}

interface HairstyleGenerationGroup {
  id: string;
  createdAt: string;
  status: string;
  selectedVariantId: string | null;
  analysis: FaceAnalysisSummary;
  variants: GeneratedVariant[];
}

interface HairstyleListResponse {
  generations?: HairstyleGenerationGroup[];
  error?: string;
}

type WizardStep = 1 | 2 | 3;

const stepDefinitions: Array<{ id: WizardStep; title: string; eyebrow: string }> = [
  { id: 1, title: "프로필 확인", eyebrow: "헤어 + 바디" },
  { id: 2, title: "장르 선택", eyebrow: "패션 방향" },
  { id: 3, title: "추천 확인", eyebrow: "룩북 생성" },
];

const genreOptions: Array<{
  value: FashionGenre;
  label: string;
  description: string;
}> = [
  { value: "minimal", label: "미니멀", description: "색과 디테일을 줄여 헤어와 얼굴을 또렷하게 보여줍니다." },
  { value: "street", label: "스트릿", description: "오버핏과 기능성 디테일로 트렌디한 볼륨을 만듭니다." },
  { value: "casual", label: "캐주얼", description: "반복해서 입기 쉬운 데일리 균형을 우선합니다." },
  { value: "classic", label: "클래식", description: "재킷, 셔츠, 로퍼처럼 오래 가는 구조감을 사용합니다." },
  { value: "office", label: "오피스", description: "출근과 미팅에 맞는 단정한 실루엣을 구성합니다." },
  { value: "date", label: "데이트", description: "얼굴 주변을 부드럽게 살리는 색과 소재를 씁니다." },
  { value: "formal", label: "포멀", description: "행사와 격식 있는 자리에 맞는 절제된 룩입니다." },
  { value: "athleisure", label: "애슬레저", description: "활동성은 유지하고 인상은 깔끔하게 정리합니다." },
];

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLength(value?: string | null) {
  if (value === "short") return "짧은 기장";
  if (value === "medium") return "중간 기장";
  if (value === "long") return "긴 기장";
  return "-";
}

function formatFocus(value?: string | null) {
  if (value === "crown") return "정수리 볼륨";
  if (value === "temple") return "관자/사이드 균형";
  if (value === "jawline") return "턱선 보정";
  return "-";
}

function formatBodyShape(value?: string | null) {
  if (value === "straight") return "스트레이트";
  if (value === "hourglass") return "아워글래스";
  if (value === "triangle") return "트라이앵글";
  if (value === "inverted_triangle") return "역삼각형";
  if (value === "round") return "라운드";
  return "-";
}

function formatFit(value?: string | null) {
  if (value === "regular") return "레귤러";
  if (value === "slim") return "슬림";
  if (value === "relaxed") return "릴랙스";
  if (value === "oversized") return "오버핏";
  return "-";
}

function formatExposure(value?: string | null) {
  if (value === "low") return "낮음";
  if (value === "balanced") return "균형";
  if (value === "bold") return "과감";
  return "-";
}

function isStepComplete(step: WizardStep, currentStep: WizardStep) {
  return currentStep > step;
}

function StepBadge({
  step,
  currentStep,
  enabled,
  onClick,
}: {
  step: (typeof stepDefinitions)[number];
  currentStep: WizardStep;
  enabled: boolean;
  onClick: (step: WizardStep) => void;
}) {
  const active = currentStep === step.id;
  const complete = isStepComplete(step.id, currentStep);

  return (
    <button
      type="button"
      onClick={() => onClick(step.id)}
      disabled={!enabled}
      className={[
        "border px-4 py-4 text-left transition",
        active ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "app-card",
        complete && !active ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "",
        !enabled ? "cursor-not-allowed opacity-50" : "hover:border-stone-400",
      ].join(" ")}
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

function OptionCard<T extends string>({
  option,
  selected,
  onSelect,
}: {
  option: { value: T; label: string; description: string };
  selected: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option.value)}
      className={[
        "border px-4 py-4 text-left transition",
        selected
          ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)] shadow-[0_16px_40px_rgba(0,0,0,0.08)]"
          : "app-card hover:border-[var(--app-border-strong)]",
      ].join(" ")}
    >
      <p className={selected ? "text-sm font-bold text-white" : "text-sm font-bold text-[var(--app-text)]"}>{option.label}</p>
      <p className={selected ? "mt-2 text-sm leading-5 text-white/80" : "mt-2 text-sm leading-5 text-[var(--app-muted)]"}>
        {option.description}
      </p>
    </button>
  );
}

function FieldLabel({ label, value }: { label: string; value: string }) {
  return (
    <SurfaceCard className="px-4 py-3">
      <p className="app-kicker">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[var(--app-text)]">{value}</p>
    </SurfaceCard>
  );
}

function HairSelectionModal({
  open,
  groups,
  isLoading,
  error,
  selectedVariantId,
  onClose,
  onSelect,
}: {
  open: boolean;
  groups: HairstyleGenerationGroup[];
  isLoading: boolean;
  error: string | null;
  selectedVariantId: string;
  onClose: () => void;
  onSelect: (generationId: string, variant: GeneratedVariant) => void;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="hair-selection-title"
        className="app-panel flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase text-stone-400">헤어스타일 선택</p>
            <h2 id="hair-selection-title" className="mt-1 text-xl font-black text-stone-900">
              최근 헤어 추천 결과에서 하나를 선택하세요
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-5">
          {isLoading ? (
            <div className="rounded-2xl bg-stone-50 px-5 py-10 text-center text-sm text-stone-500">
              최근 헤어 추천 결과를 불러오는 중입니다.
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error}
            </div>
          ) : null}

          {!isLoading && groups.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 px-6 py-12 text-center">
              <Scissors className="mx-auto h-8 w-8 text-stone-400" />
              <p className="mt-3 text-base font-bold text-stone-900">선택할 수 있는 헤어 결과가 없습니다.</p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                먼저 얼굴 사진으로 3x3 헤어 추천 보드를 만든 뒤 패션 추천을 이어갈 수 있습니다.
              </p>
              <Link
                href="/upload"
                className="mt-5 inline-flex items-center justify-center rounded-full bg-stone-900 px-5 py-2 text-sm font-bold text-white transition hover:bg-stone-800"
              >
                헤어 추천 만들기
              </Link>
            </div>
          ) : null}

          <div className="grid gap-6">
            {groups.map((group) => (
              <section key={group.id} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-stone-900">{formatDate(group.createdAt)} 생성 결과</p>
                    <p className="text-xs text-stone-500">얼굴형: {group.analysis.faceShape || "-"} · 상태: {group.status}</p>
                  </div>
                  <Link href={`/result/${group.id}`} className="text-sm font-semibold text-stone-600 hover:text-stone-950">
                    결과 보기
                  </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.variants.map((variant) => {
                    const selected = selectedVariantId === variant.id;
                    const selectable = Boolean(variant.outputUrl);

                    return (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => selectable && onSelect(group.id, variant)}
                        disabled={!selectable}
                        className={[
                          "overflow-hidden rounded-2xl border bg-white text-left transition",
                          selected ? "border-stone-900 shadow-[0_18px_45px_-28px_rgba(0,0,0,0.55)]" : "border-stone-200 hover:border-stone-400",
                          !selectable ? "cursor-not-allowed opacity-55" : "",
                        ].join(" ")}
                      >
                        <div className="relative aspect-[4/5] bg-stone-100">
                          {variant.outputUrl ? (
                            <img src={variant.outputUrl} alt={variant.label} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-stone-500">
                              {variant.status === "failed" ? "생성 실패" : "생성 대기 중"}
                            </div>
                          )}
                          {selected ? (
                            <span className="absolute right-3 top-3 rounded-full bg-stone-900 px-3 py-1 text-xs font-bold text-white">
                              선택됨
                            </span>
                          ) : null}
                        </div>
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-base font-bold text-stone-900">{variant.label}</h3>
                            <span className="rounded-full bg-stone-100 px-2 py-1 text-[11px] font-semibold text-stone-600">
                              {formatLength(variant.lengthBucket)}
                            </span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm leading-5 text-stone-600">{variant.reason}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function StylerNewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialGenerationId = searchParams.get("generationId") || "";
  const initialSelectedVariantId = searchParams.get("variant") || "";

  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [generationId, setGenerationId] = useState(initialGenerationId);
  const [selectedVariantId, setSelectedVariantId] = useState(initialSelectedVariantId);
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [genre, setGenre] = useState<FashionGenre>("minimal");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<FashionRecommendation | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<GeneratedVariant | null>(null);
  const [hairGroups, setHairGroups] = useState<HairstyleGenerationGroup[]>([]);
  const [hairModalOpen, setHairModalOpen] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingVariant, setIsLoadingVariant] = useState(Boolean(initialGenerationId && initialSelectedVariantId));
  const [isLoadingHairList, setIsLoadingHairList] = useState(false);
  const [isRecommending, setIsRecommending] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [hairListError, setHairListError] = useState<string | null>(null);
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setIsLoadingProfile(true);
      setProfileError(null);

      const response = await fetch("/api/style-profile", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as ProfileResponse;

      if (!active) {
        return;
      }

      if (response.ok && data.profile) {
        setProfile(data.profile);
      } else {
        setProfileError(data.error || "바디 프로필을 불러오지 못했습니다.");
      }

      setIsLoadingProfile(false);
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSelectedVariant() {
      if (!generationId || !selectedVariantId) {
        setSelectedVariant(null);
        setIsLoadingVariant(false);
        return;
      }

      setIsLoadingVariant(true);
      setProfileError(null);

      const response = await fetch(`/api/generations/${generationId}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as GenerationResponse;

      if (!active) {
        return;
      }

      const variantFromSet =
        data.recommendationSet?.variants?.find((variant) => variant.id === selectedVariantId) || null;

      if (response.ok) {
        setSelectedVariant(variantFromSet || data.selectedVariant || null);
        if (!variantFromSet && !data.selectedVariant) {
          setProfileError("선택한 헤어스타일을 찾지 못했습니다. 헤어 결과에서 다시 선택해 주세요.");
        }
      } else {
        setProfileError(data.error || "선택한 헤어스타일을 불러오지 못했습니다.");
      }

      setIsLoadingVariant(false);
    }

    void loadSelectedVariant();

    return () => {
      active = false;
    };
  }, [generationId, selectedVariantId]);

  const profileReady = useMemo(() => {
    return Boolean(
      profile?.heightCm &&
        profile.bodyShape &&
        profile.topSize &&
        profile.bottomSize &&
        profile.fitPreference &&
        profile.exposurePreference &&
        profile.bodyPhotoPath,
    );
  }, [profile]);

  const stepOneReady = Boolean(profileReady && selectedVariant && generationId && selectedVariantId);
  const stepThreeReady = Boolean(sessionId && recommendation);
  const visibleStep: WizardStep = !stepOneReady ? 1 : currentStep;
  const selectedGenre = genreOptions.find((option) => option.value === genre) || genreOptions[0];

  const clearRecommendationState = () => {
    setSessionId(null);
    setRecommendation(null);
    setRecommendError(null);
    setGenerateError(null);
  };

  const loadHairList = async () => {
    setIsLoadingHairList(true);
    setHairListError(null);

    const response = await fetch("/api/styling/hairstyles", { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as HairstyleListResponse;

    if (response.ok) {
      setHairGroups(data.generations || []);
    } else {
      setHairListError(data.error || "최근 헤어 결과를 불러오지 못했습니다.");
    }

    setIsLoadingHairList(false);
  };

  const openHairModal = () => {
    setHairModalOpen(true);
    if (hairGroups.length === 0 && !isLoadingHairList) {
      void loadHairList();
    }
  };

  const handleHairSelect = (nextGenerationId: string, variant: GeneratedVariant) => {
    setGenerationId(nextGenerationId);
    setSelectedVariantId(variant.id);
    setSelectedVariant(variant);
    clearRecommendationState();
    setHairModalOpen(false);
    setCurrentStep(1);
    router.replace(
      `/styler/new?generationId=${encodeURIComponent(nextGenerationId)}&variant=${encodeURIComponent(variant.id)}`,
      { scroll: false },
    );
  };

  const handleGenreSelect = (value: FashionGenre) => {
    if (genre === value) {
      return;
    }
    setGenre(value);
    clearRecommendationState();
  };

  const handleStepChange = (step: WizardStep) => {
    if (step === 1) {
      setCurrentStep(1);
      return;
    }
    if (step === 2 && stepOneReady) {
      setCurrentStep(2);
      return;
    }
    if (step === 3 && stepThreeReady) {
      setCurrentStep(3);
    }
  };

  const handleRecommend = async () => {
    if (!stepOneReady) {
      return;
    }

    setIsRecommending(true);
    setRecommendError(null);
    setGenerateError(null);

    const response = await fetch("/api/styling/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationId,
        selectedVariantId,
        genre,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as RecommendResponse;

    if (response.ok && data.sessionId && data.recommendation) {
      setSessionId(data.sessionId);
      setRecommendation(data.recommendation);
      if (data.selectedVariant) {
        setSelectedVariant(data.selectedVariant);
      }
      setCurrentStep(3);
    } else {
      setRecommendError(data.error || "패션 추천을 만들지 못했습니다.");
    }

    setIsRecommending(false);
  };

  const handleGenerate = async () => {
    if (!sessionId) {
      return;
    }

    setIsGenerating(true);
    setGenerateError(null);

    const response = await fetch("/api/styling/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const data = (await response.json().catch(() => ({}))) as GenerateResponse;

    if (response.ok) {
      router.push(`/styler/${data.sessionId || sessionId}`);
    } else {
      setGenerateError(data.error || "룩북 이미지를 생성하지 못했습니다.");
    }

    setIsGenerating(false);
  };

  return (
    <AppPage className="flex flex-col gap-6 pb-20 pt-8">
      <header className="space-y-2">
        <p className="app-kicker">패션 추천</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--app-text)]">헤어스타일에 맞춘 전신 코디 만들기</h1>
        <p className="max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
          먼저 헤어스타일과 바디 프로필을 확인한 뒤, 원하는 패션 장르를 선택하면 AI 카탈로그 기반 코디와 룩북 이미지를 생성합니다.
        </p>
      </header>

      <Panel as="section" className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="app-kicker">선택한 헤어스타일</p>
            <p className="text-xl font-bold text-[var(--app-text)]">
              {isLoadingVariant ? "헤어스타일을 불러오는 중..." : selectedVariant?.label || "선택된 헤어스타일 없음"}
            </p>
            <p className="max-w-2xl text-sm leading-6 text-[var(--app-muted)]">
              {selectedVariant?.reason || "빈 헤어스타일 영역을 눌러 최근 추천 결과에서 하나를 선택하세요."}
            </p>
          </div>

          <div className="flex w-full gap-4 lg:w-auto">
            <button
              type="button"
              onClick={openHairModal}
              className="app-card relative aspect-[4/5] w-28 overflow-hidden transition hover:border-[var(--app-border-strong)]"
              aria-label="헤어스타일 선택 모달 열기"
            >
              {selectedVariant?.outputUrl ? (
                <img
                  src={selectedVariant.outputUrl}
                  alt={selectedVariant.label}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs font-medium text-stone-500">
                  헤어 선택
                </div>
              )}
            </button>
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <FieldLabel label="기장" value={formatLength(selectedVariant?.lengthBucket)} />
              <FieldLabel label="보정 포인트" value={formatFocus(selectedVariant?.correctionFocus)} />
              <div className="sm:col-span-2">
                <Button type="button" variant="secondary" onClick={openHairModal}>
                  헤어스타일 선택/변경
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <section className="grid gap-3 md:grid-cols-3">
        {stepDefinitions.map((step) => (
          <StepBadge
            key={step.id}
            step={step}
            currentStep={visibleStep}
            enabled={
              step.id === 1 ||
              (step.id === 2 && stepOneReady) ||
              (step.id === 3 && stepThreeReady)
            }
            onClick={handleStepChange}
          />
        ))}
      </section>

      {visibleStep === 1 ? (
        <Panel as="section" className="p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              <FieldLabel label="키" value={profile?.heightCm ? `${profile.heightCm} cm` : "-"} />
              <FieldLabel label="체형" value={formatBodyShape(profile?.bodyShape)} />
              <FieldLabel label="상의 사이즈" value={profile?.topSize || "-"} />
              <FieldLabel label="하의 사이즈" value={profile?.bottomSize || "-"} />
              <FieldLabel label="선호 핏" value={formatFit(profile?.fitPreference)} />
              <FieldLabel label="노출 선호" value={formatExposure(profile?.exposurePreference)} />
              <FieldLabel label="전신 사진" value={profile?.bodyPhotoPath ? "저장됨" : "필요"} />
              <FieldLabel label="선택 헤어" value={selectedVariant?.label || "필요"} />
            </div>

            <div className="w-full max-w-sm space-y-3">
              <SurfaceCard className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="app-kicker">준비 상태</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--app-text)]">
                    {isLoadingProfile ? "프로필 확인 중" : stepOneReady ? "추천 준비 완료" : "추가 설정 필요"}
                  </p>
                </div>
                <span
                  className={[
                    "rounded-full px-3 py-1 text-xs font-bold",
                    stepOneReady ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
                  ].join(" ")}
                >
                  {stepOneReady ? "준비됨" : "필요"}
                </span>
              </SurfaceCard>

              <SurfaceCard className="relative aspect-[4/5] overflow-hidden">
                {profile?.bodyPhotoUrl ? (
                  <img
                    src={profile.bodyPhotoUrl}
                    alt="저장된 전신 참고 사진"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-stone-500">
                    룩북 생성을 위해 마이페이지에서 전신 참고 사진을 저장해 주세요.
                  </div>
                )}
              </SurfaceCard>
            </div>
          </div>

          {!selectedVariant ? (
            <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              패션 추천을 시작하려면 헤어스타일을 먼저 선택해야 합니다.
            </p>
          ) : null}

          {profileError ? (
            <p className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {profileError}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            {!profileReady ? (
              <Link href="/mypage">
                <Button type="button" variant="secondary">바디 프로필 완성하기</Button>
              </Link>
            ) : null}
            {!selectedVariant ? (
              <Button type="button" variant="secondary" onClick={openHairModal}>
                헤어스타일 선택하기
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={() => setCurrentStep(2)}
              disabled={!stepOneReady || isLoadingProfile || isLoadingVariant}
            >
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
            {genreOptions.map((option) => (
              <OptionCard
                key={option.value}
                option={option}
                selected={genre === option.value}
                onSelect={handleGenreSelect}
              />
            ))}
          </div>

          <SurfaceCard className="px-4 py-4">
            <p className="app-kicker">선택한 방향</p>
            <p className="mt-2 text-sm leading-6 text-[var(--app-text)]">
              {selectedGenre.label}: {selectedGenre.description}
            </p>
          </SurfaceCard>

          {recommendError ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {recommendError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => setCurrentStep(1)}>
              이전
            </Button>
            <Button type="button" onClick={handleRecommend} disabled={isRecommending || isGenerating}>
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
              <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--app-text)]">
                {recommendation?.headline || "패션 추천 미리보기"}
              </h2>
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
                          src={selectedVariant.outputUrl}
                          alt={selectedVariant.label}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-stone-500">
                          헤어 미리보기
                        </div>
                      )}
                    </SurfaceCard>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--app-text)]">{selectedVariant?.label || "-"}</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">{selectedVariant?.reason || "-"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(selectedVariant?.tags || []).slice(0, 4).map((tag) => (
                          <span key={tag} className="app-chip px-3 py-1 text-xs font-medium">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </SurfaceCard>

                <div className="grid gap-4 sm:grid-cols-3">
                  <FieldLabel label="실루엣" value={recommendation.silhouette} />
                  <FieldLabel label="팔레트" value={recommendation.palette.join(", ")} />
                  <FieldLabel label="아이템" value={`${recommendation.items.length}개 구성`} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {recommendation.items.map((item) => (
                  <SurfaceCard as="article" key={item.slot} className="p-4">
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
                  {recommendation.stylingNotes.map((note) => (
                    <p key={note} className="text-sm leading-6 text-[var(--app-text)]">
                      {note}
                    </p>
                  ))}
                </div>
              </SurfaceCard>
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center">
              <p className="text-sm font-semibold text-stone-900">추천이 아직 없습니다</p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                2단계에서 패션 장르를 선택하고 추천을 먼저 생성하세요.
              </p>
            </div>
          )}

          {generateError ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {generateError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => setCurrentStep(2)}>
              이전
            </Button>
            <Button type="button" onClick={handleGenerate} disabled={!stepThreeReady || isGenerating}>
              {isGenerating ? "룩북 생성 중..." : "룩북 이미지 생성"}
            </Button>
          </div>
        </Panel>
      ) : null}

      <HairSelectionModal
        open={hairModalOpen}
        groups={hairGroups}
        isLoading={isLoadingHairList}
        error={hairListError}
        selectedVariantId={selectedVariantId}
        onClose={() => setHairModalOpen(false)}
        onSelect={handleHairSelect}
      />
    </AppPage>
  );
}

export default function StylerNewPage() {
  return (
    <Suspense fallback={<AppPage className="max-w-4xl py-12 text-sm text-[var(--app-muted)]">패션 추천 화면을 불러오는 중입니다...</AppPage>}>
      <StylerNewContent />
    </Suspense>
  );
}
