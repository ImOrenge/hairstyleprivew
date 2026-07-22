"use client";

import {
  normalizePaidActionQuote,
  type PaidActionQuote,
} from "@hairfit/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mapWebResponseError, mapWebUserError } from "../../lib/web-user-message";
import { useAuthenticatedFetch } from "../../hooks/useAuthenticatedFetch";
import { usePaidActionQuoteExpired } from "../billing/PaidActionQuoteCard";
import type {
  FashionGenre,
  FashionRecommendation,
  StyleProfile,
} from "../../lib/fashion-types";
import type { GeneratedVariant } from "../../lib/recommendation-types";
import {
  buildStylerBillingHref,
  buildStylerNewHref,
  isStylerProfileReady,
  STYLER_GENRE_OPTIONS,
  type StylerGenerateResponse,
  type StylerGenerationResponse,
  type StylerHairstyleGenerationGroup,
  type StylerHairstyleListResponse,
  type StylerProfileResponse,
  type StylerQuoteResponse,
  type StylerRecommendResponse,
  type StylerWizardStep,
} from "./stylerNewModel";

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useStylerNewController() {
  const authenticatedFetch = useAuthenticatedFetch();
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialGenerationId = searchParams.get("generationId") || "";
  const initialSelectedVariantId = searchParams.get("variant") || "";

  const quoteRequestSequenceRef = useRef(0);
  const hairListControllerRef = useRef<AbortController | null>(null);
  const recommendControllerRef = useRef<AbortController | null>(null);
  const generateControllerRef = useRef<AbortController | null>(null);
  const [currentStep, setCurrentStep] = useState<StylerWizardStep>(1);
  const [generationId, setGenerationId] = useState(initialGenerationId);
  const [selectedVariantId, setSelectedVariantId] = useState(initialSelectedVariantId);
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [genre, setGenre] = useState<FashionGenre>("minimal");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<FashionRecommendation | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<GeneratedVariant | null>(null);
  const [hairGroups, setHairGroups] = useState<StylerHairstyleGenerationGroup[]>([]);
  const [hairModalOpen, setHairModalOpen] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingVariant, setIsLoadingVariant] = useState(Boolean(initialGenerationId && initialSelectedVariantId));
  const [isLoadingHairList, setIsLoadingHairList] = useState(false);
  const [isRecommending, setIsRecommending] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [quote, setQuote] = useState<PaidActionQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [hairListError, setHairListError] = useState<string | null>(null);
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const quoteExpired = usePaidActionQuoteExpired(quote);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProfile() {
      setIsLoadingProfile(true);
      setProfileError(null);
      try {
        const response = await authenticatedFetch("/api/style-profile", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as StylerProfileResponse;
        if (controller.signal.aborted) return;
        if (response.ok && data.profile) setProfile(data.profile);
        else setProfileError(mapWebResponseError(response.status, "바디 프로필을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
      } catch (error) {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setProfileError("바디 프로필을 불러오지 못했습니다.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoadingProfile(false);
      }
    }

    void loadProfile();
    return () => controller.abort();
  }, [authenticatedFetch]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSelectedVariant() {
      if (!generationId || !selectedVariantId) {
        setSelectedVariant(null);
        setIsLoadingVariant(false);
        return;
      }

      setIsLoadingVariant(true);
      setProfileError(null);
      try {
        const response = await authenticatedFetch(`/api/generations/${generationId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as StylerGenerationResponse;
        if (controller.signal.aborted) return;
        if (response.ok) {
          const savedSelectedVariantId = data.recommendationSet?.selectedVariantId || data.selectedVariant?.id || null;
          if (savedSelectedVariantId !== selectedVariantId) {
            setSelectedVariant(null);
            setProfileError("패션 추천은 결과 화면에서 헤어스타일을 선택한 뒤 시작할 수 있습니다.");
            return;
          }
          const variantFromSet = data.recommendationSet?.variants?.find((variant) => variant.id === selectedVariantId) || null;
          setSelectedVariant(variantFromSet || data.selectedVariant || null);
          if (!variantFromSet && !data.selectedVariant) {
            setProfileError("선택한 헤어스타일을 찾지 못했습니다. 헤어 결과에서 다시 선택해 주세요.");
          }
        } else {
          setProfileError(mapWebResponseError(response.status, "선택한 헤어스타일을 불러오지 못했습니다. 헤어 결과에서 다시 선택해 주세요."));
        }
      } catch (error) {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setProfileError("선택한 헤어스타일을 불러오지 못했습니다.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoadingVariant(false);
      }
    }

    void loadSelectedVariant();
    return () => controller.abort();
  }, [authenticatedFetch, generationId, selectedVariantId]);

  useEffect(() => () => {
    hairListControllerRef.current?.abort();
    recommendControllerRef.current?.abort();
    generateControllerRef.current?.abort();
    quoteRequestSequenceRef.current += 1;
  }, []);

  const profileReady = useMemo(() => isStylerProfileReady(profile), [profile]);
  const stepOneReady = Boolean(profileReady && selectedVariant && generationId && selectedVariantId);
  const stepThreeReady = Boolean(sessionId && recommendation);
  const visibleStep: StylerWizardStep = !stepOneReady ? 1 : currentStep;
  const selectedGenre = STYLER_GENRE_OPTIONS.find((option) => option.value === genre) || STYLER_GENRE_OPTIONS[0];
  const billingHref = useMemo(() => buildStylerBillingHref(sessionId), [sessionId]);

  const loadQuote = useCallback(async (targetSessionId: string, signal?: AbortSignal) => {
    const sequence = quoteRequestSequenceRef.current + 1;
    quoteRequestSequenceRef.current = sequence;
    setQuoteLoading(true);
    setQuote(null);
    setQuoteError(null);
    try {
      const response = await authenticatedFetch("/api/paid-actions/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "outfit_generation",
          subjectId: targetSessionId,
          billingScope: "customer",
        }),
        cache: "no-store",
        signal,
      });
      const data = (await response.json().catch(() => null)) as StylerQuoteResponse | null;
      if (sequence !== quoteRequestSequenceRef.current || signal?.aborted) return;
      const nextQuote = normalizePaidActionQuote(data?.quote);
      if (!response.ok || !nextQuote) throw new Error(data?.error || "최신 룩북 크레딧 견적을 불러오지 못했습니다.");
      setQuote(nextQuote);
    } catch (error) {
      if (sequence !== quoteRequestSequenceRef.current || signal?.aborted || isAbortError(error)) return;
      setQuoteError(mapWebUserError(error, "최신 룩북 크레딧 견적을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      if (sequence === quoteRequestSequenceRef.current && !signal?.aborted) setQuoteLoading(false);
    }
  }, [authenticatedFetch]);

  const clearRecommendationState = useCallback(() => {
    recommendControllerRef.current?.abort();
    quoteRequestSequenceRef.current += 1;
    setSessionId(null);
    setRecommendation(null);
    setQuote(null);
    setQuoteLoading(false);
    setQuoteError(null);
    setRecommendError(null);
    setGenerateError(null);
    setIsRecommending(false);
  }, []);

  const loadHairList = useCallback(async () => {
    hairListControllerRef.current?.abort();
    const controller = new AbortController();
    hairListControllerRef.current = controller;
    setIsLoadingHairList(true);
    setHairListError(null);
    try {
      const response = await authenticatedFetch("/api/styling/hairstyles", {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as StylerHairstyleListResponse;
      if (controller.signal.aborted) return;
      if (response.ok) setHairGroups(data.generations || []);
      else setHairListError(mapWebResponseError(response.status, "최근 헤어 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } catch (error) {
      if (!controller.signal.aborted && !isAbortError(error)) setHairListError("최근 헤어 결과를 불러오지 못했습니다.");
    } finally {
      if (!controller.signal.aborted) setIsLoadingHairList(false);
    }
  }, [authenticatedFetch]);

  const openHairModal = useCallback(() => {
    setHairModalOpen(true);
    if (hairGroups.length === 0 && !isLoadingHairList) void loadHairList();
  }, [hairGroups.length, isLoadingHairList, loadHairList]);

  const closeHairModal = useCallback(() => {
    setHairModalOpen(false);
  }, []);

  const handleHairSelect = useCallback((nextGenerationId: string, variant: GeneratedVariant) => {
    setGenerationId(nextGenerationId);
    setSelectedVariantId(variant.id);
    setSelectedVariant(variant);
    clearRecommendationState();
    setHairModalOpen(false);
    setCurrentStep(1);
    router.replace(buildStylerNewHref(nextGenerationId, variant.id), { scroll: false });
  }, [clearRecommendationState, router]);

  const handleGenreSelect = useCallback((value: FashionGenre) => {
    if (genre === value) return;
    setGenre(value);
    clearRecommendationState();
  }, [clearRecommendationState, genre]);

  const handleStepChange = useCallback((step: StylerWizardStep) => {
    if (step === 1) setCurrentStep(1);
    else if (step === 2 && stepOneReady) setCurrentStep(2);
    else if (step === 3 && stepThreeReady) setCurrentStep(3);
  }, [stepOneReady, stepThreeReady]);

  const handleRecommend = useCallback(async () => {
    if (!stepOneReady || isRecommending) return;
    clearRecommendationState();
    const controller = new AbortController();
    recommendControllerRef.current = controller;
    setIsRecommending(true);
    try {
      const response = await authenticatedFetch("/api/styling/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId, selectedVariantId, genre }),
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as StylerRecommendResponse;
      if (controller.signal.aborted) return;
      if (response.ok && data.sessionId && data.recommendation) {
        setSessionId(data.sessionId);
        setRecommendation(data.recommendation);
        if (data.selectedVariant) setSelectedVariant(data.selectedVariant);
        setCurrentStep(3);
        void loadQuote(data.sessionId, controller.signal);
      } else {
        setRecommendError(mapWebResponseError(response.status, "패션 추천을 만들지 못했습니다. 잠시 후 다시 시도해 주세요."));
      }
    } catch (error) {
      if (!controller.signal.aborted && !isAbortError(error)) setRecommendError("패션 추천을 만들지 못했습니다.");
    } finally {
      if (!controller.signal.aborted) setIsRecommending(false);
    }
  }, [authenticatedFetch, clearRecommendationState, generationId, genre, isRecommending, loadQuote, selectedVariantId, stepOneReady]);

  const handleGenerate = useCallback(async () => {
    if (!sessionId || !quote || quoteExpired || !quote.isAllowed || isGenerating) return;
    generateControllerRef.current?.abort();
    const controller = new AbortController();
    generateControllerRef.current = controller;
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const response = await authenticatedFetch("/api/styling/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, quoteId: quote.quoteId }),
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => null)) as StylerGenerateResponse | null;
      if (controller.signal.aborted) return;
      const refreshedQuote = normalizePaidActionQuote(data?.quote);
      if (refreshedQuote) setQuote(refreshedQuote);
      else if (data?.code?.startsWith("QUOTE_")) setQuote(null);
      if (response.ok) {
        router.push(`/styler/${data?.sessionId || sessionId}`);
        return;
      }
      setGenerateError(mapWebResponseError(response.status, "룩북 이미지를 생성하지 못했습니다. 세션 화면에서 진행 상태를 확인해 주세요."));
    } catch (error) {
      if (!controller.signal.aborted && !isAbortError(error)) {
        setGenerateError("생성 요청의 응답을 확인하지 못했습니다. 세션 화면에서 진행 상태를 확인해 주세요.");
      }
    } finally {
      if (!controller.signal.aborted) setIsGenerating(false);
    }
  }, [authenticatedFetch, isGenerating, quote, quoteExpired, router, sessionId]);

  const refreshQuote = useCallback(() => {
    if (sessionId) void loadQuote(sessionId);
  }, [loadQuote, sessionId]);

  return {
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
  };
}

export type StylerNewController = ReturnType<typeof useStylerNewController>;
