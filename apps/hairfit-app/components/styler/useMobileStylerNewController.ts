import { HairfitApiError } from "@hairfit/api-client";
import {
  isPaidActionQuoteExpired,
  normalizePaidActionQuote,
  type BodyShape,
  type ExposurePreference,
  type FashionGenre,
  type FashionRecommendation,
  type FitPreference,
  type GeneratedVariant,
  type HairstyleGenerationGroup,
  type PaidActionQuote,
  type StyleProfile,
} from "@hairfit/shared";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNativePaidActionQuoteExpired } from "../billing/PaidActionQuoteCard";
import { useHairfitApi } from "../../lib/api";
import { mapMobileUserError } from "../../lib/mobile-user-message";
import { getPhotoLibraryPermissionMessage } from "../../lib/photo-library-permission";
import { usePhotoLibraryPermissionRecovery } from "../../hooks/usePhotoLibraryPermissionRecovery";
import { useNetworkRecovery } from "../app/NetworkRecoveryProvider";
import {
  readFreshStylingQuote,
  readStylingQuoteErrorCode,
  stylingQuoteRefreshMessage,
  stylingQuoteRequestErrorMessage,
} from "../../lib/styling-paid-action";
import {
  buildMobileStylerBillingHref,
  isMobileStylerProfileReady,
  MOBILE_STYLER_GENRES,
  type MobileStylerWizardStep,
} from "./mobileStylerModel";

export function useMobileStylerNewController() {
  const router = useRouter();
  const api = useHairfitApi();
  const { recoveryToken } = useNetworkRecovery();
  const params = useLocalSearchParams<{ generationId?: string; variant?: string }>();
  const initialGenerationId = typeof params.generationId === "string" ? params.generationId : "";
  const initialVariantId = typeof params.variant === "string" ? params.variant : "";

  const mountedRef = useRef(true);
  const profileRequestIdRef = useRef(0);
  const variantRequestIdRef = useRef(0);
  const quoteRequestIdRef = useRef(0);
  const saveProfileRequestIdRef = useRef(0);
  const uploadPhotoRequestIdRef = useRef(0);
  const deletePhotoRequestIdRef = useRef(0);
  const hairListRequestIdRef = useRef(0);
  const recommendRequestIdRef = useRef(0);
  const generateRequestIdRef = useRef(0);
  const [currentStep, setCurrentStep] = useState<MobileStylerWizardStep>(1);
  const [generationId, setGenerationId] = useState(initialGenerationId);
  const [selectedVariantId, setSelectedVariantId] = useState(initialVariantId);
  const [selectedVariant, setSelectedVariant] = useState<GeneratedVariant | null>(null);
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [genre, setGenre] = useState<FashionGenre>("minimal");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<FashionRecommendation | null>(null);
  const [hairGroups, setHairGroups] = useState<HairstyleGenerationGroup[]>([]);
  const [hairModalOpen, setHairModalOpen] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingVariant, setIsLoadingVariant] = useState(Boolean(initialGenerationId && initialVariantId));
  const [isLoadingHairList, setIsLoadingHairList] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
  const [isRecommending, setIsRecommending] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const {
    openPermissionSettings,
    photoPermissionRequiresSettings,
    resolvePhotoLibraryPermission,
  } = usePhotoLibraryPermissionRecovery();
  const [message, setMessage] = useState<string | null>("바디 프로필을 불러오고 있습니다.");
  const [hairListError, setHairListError] = useState<string | null>(null);
  const [quote, setQuote] = useState<PaidActionQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [heightCm, setHeightCm] = useState("");
  const [bodyShape, setBodyShape] = useState<BodyShape>("straight");
  const [topSize, setTopSize] = useState("");
  const [bottomSize, setBottomSize] = useState("");
  const [fitPreference, setFitPreference] = useState<FitPreference>("regular");
  const [colorPreference, setColorPreference] = useState("");
  const [exposurePreference, setExposurePreference] = useState<ExposurePreference>("balanced");
  const [avoidItems, setAvoidItems] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      profileRequestIdRef.current += 1;
      variantRequestIdRef.current += 1;
      quoteRequestIdRef.current += 1;
      saveProfileRequestIdRef.current += 1;
      uploadPhotoRequestIdRef.current += 1;
      deletePhotoRequestIdRef.current += 1;
      hairListRequestIdRef.current += 1;
      recommendRequestIdRef.current += 1;
      generateRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const requestId = ++profileRequestIdRef.current;
    async function loadProfile() {
      setIsLoadingProfile(true);
      try {
        const result = await api.getStyleProfile();
        if (!mountedRef.current || requestId !== profileRequestIdRef.current) return;
        setProfile(result.profile);
        setHeightCm(result.profile.heightCm ? String(result.profile.heightCm) : "");
        setBodyShape(result.profile.bodyShape || "straight");
        setTopSize(result.profile.topSize || "");
        setBottomSize(result.profile.bottomSize || "");
        setFitPreference(result.profile.fitPreference || "regular");
        setColorPreference(result.profile.colorPreference || "");
        setExposurePreference(result.profile.exposurePreference || "balanced");
        setAvoidItems(result.profile.avoidItems.join(", "));
        setMessage(isMobileStylerProfileReady(result.profile)
          ? "바디 프로필이 준비되었습니다. 사용할 헤어스타일을 확인해 주세요."
          : "바디 프로필을 완성하고 사용할 헤어스타일을 선택해 주세요.");
      } catch (error) {
        if (mountedRef.current && requestId === profileRequestIdRef.current) {
          setMessage(mapMobileUserError(error, "바디 프로필을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
        }
      } finally {
        if (mountedRef.current && requestId === profileRequestIdRef.current) setIsLoadingProfile(false);
      }
    }
    void loadProfile();
    return () => {
      profileRequestIdRef.current += 1;
    };
  }, [api, recoveryToken]);

  useEffect(() => {
    const requestId = ++variantRequestIdRef.current;
    async function loadVariant() {
      if (!generationId || !selectedVariantId) {
        setIsLoadingVariant(false);
        return;
      }
      setIsLoadingVariant(true);
      try {
        const result = await api.getGeneration(generationId);
        const variant = result.recommendationSet?.variants.find((item) => item.id === selectedVariantId)
          || (result.selectedVariant as GeneratedVariant | null)
          || null;
        if (!mountedRef.current || requestId !== variantRequestIdRef.current) return;
        setSelectedVariant(variant);
        if (!variant) setMessage("선택한 헤어스타일을 찾지 못했습니다. 최근 결과에서 다른 스타일을 선택해 주세요.");
      } catch (error) {
        if (mountedRef.current && requestId === variantRequestIdRef.current) {
          setMessage(mapMobileUserError(error, "선택한 헤어스타일을 불러오지 못했습니다. 다른 결과를 선택해 주세요."));
        }
      } finally {
        if (mountedRef.current && requestId === variantRequestIdRef.current) setIsLoadingVariant(false);
      }
    }
    void loadVariant();
    return () => {
      variantRequestIdRef.current += 1;
    };
  }, [api, generationId, recoveryToken, selectedVariantId]);

  const stepOneReady = Boolean(isMobileStylerProfileReady(profile) && selectedVariant && generationId && selectedVariantId);
  const stepThreeReady = Boolean(sessionId && recommendation);
  const visibleStep: MobileStylerWizardStep = !stepOneReady ? 1 : currentStep;
  const selectedGenre = useMemo(() => MOBILE_STYLER_GENRES.find((item) => item.value === genre) || MOBILE_STYLER_GENRES[0], [genre]);
  const quoteExpired = useNativePaidActionQuoteExpired(quote);

  const clearRecommendation = useCallback(() => {
    recommendRequestIdRef.current += 1;
    quoteRequestIdRef.current += 1;
    setSessionId(null);
    setRecommendation(null);
    setQuote(null);
    setQuoteError(null);
    setQuoteLoading(false);
    setIsRecommending(false);
  }, []);

  const refreshQuote = useCallback(async (requestedSessionId?: string) => {
    const targetSessionId = requestedSessionId || sessionId;
    if (!targetSessionId) {
      setQuote(null);
      setQuoteError("패션 추천이 준비된 뒤 크레딧 견적을 확인할 수 있습니다.");
      return null;
    }
    const requestId = ++quoteRequestIdRef.current;
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const response = await api.createPaidActionQuote({
        action: "outfit_generation",
        subjectId: targetSessionId,
        billingScope: "customer",
      });
      const normalized = normalizePaidActionQuote(response.quote);
      if (!normalized || normalized.action !== "outfit_generation" || normalized.billingScope !== "customer" || normalized.subjectId !== targetSessionId) {
        throw new Error("QUOTE_CONTEXT_MISMATCH");
      }
      if (!mountedRef.current || requestId !== quoteRequestIdRef.current) return null;
      setQuote(normalized);
      return normalized;
    } catch (error) {
      if (!mountedRef.current || requestId !== quoteRequestIdRef.current) return null;
      setQuoteError(stylingQuoteRequestErrorMessage(error));
      return null;
    } finally {
      if (mountedRef.current && requestId === quoteRequestIdRef.current) setQuoteLoading(false);
    }
  }, [api, sessionId]);

  const saveProfile = useCallback(async () => {
    if (isSavingProfile) return;
    const requestId = ++saveProfileRequestIdRef.current;
    setIsSavingProfile(true);
    setMessage(null);
    try {
      const result = await api.updateStyleProfile({
        heightCm,
        bodyShape,
        topSize,
        bottomSize,
        fitPreference,
        colorPreference,
        exposurePreference,
        avoidItems,
      });
      if (!mountedRef.current || requestId !== saveProfileRequestIdRef.current) return;
      setProfile(result.profile);
      setMessage(isMobileStylerProfileReady(result.profile)
        ? "바디 프로필을 저장했습니다."
        : "바디 프로필을 저장했습니다. 계속하려면 전신 사진을 추가해 주세요.");
    } catch (error) {
      if (mountedRef.current && requestId === saveProfileRequestIdRef.current) {
        setMessage(mapMobileUserError(error, "바디 프로필을 저장하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요."));
      }
    } finally {
      if (mountedRef.current && requestId === saveProfileRequestIdRef.current) setIsSavingProfile(false);
    }
  }, [api, avoidItems, bodyShape, bottomSize, colorPreference, exposurePreference, fitPreference, heightCm, isSavingProfile, topSize]);

  const openBodyPhotoPermissionSettings = useCallback(async () => {
    const opened = await openPermissionSettings();
    setMessage(opened
      ? "앱 설정에서 사진 권한을 허용한 뒤 HairFit으로 돌아와 다시 선택해 주세요."
      : "앱 설정을 열지 못했습니다. 기기 설정에서 HairFit의 사진 권한을 직접 허용해 주세요.");
  }, [openPermissionSettings]);

  const uploadBodyPhoto = useCallback(async () => {
    let permission;
    try {
      permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    } catch (error) {
      setMessage(mapMobileUserError(
        error,
        "사진 보관함 권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      ));
      return;
    }
    const permissionState = resolvePhotoLibraryPermission(permission);
    if (permissionState !== "granted") {
      setMessage(getPhotoLibraryPermissionMessage(permissionState) ?? "사진 보관함 권한이 필요합니다.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [3, 4],
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (result.canceled) {
      setMessage("전신 사진 선택을 취소했습니다.");
      return;
    }
    const asset = result.assets[0];
    if (!asset?.uri) {
      setMessage("선택한 전신 사진을 읽지 못했습니다. 다른 사진으로 다시 시도해 주세요.");
      return;
    }
    const requestId = ++uploadPhotoRequestIdRef.current;
    setIsUploadingPhoto(true);
    setMessage(null);
    try {
      const uploaded = await api.uploadBodyPhoto({
        uri: asset.uri,
        name: asset.fileName || `body-${Date.now()}.jpg`,
        type: asset.mimeType || "image/jpeg",
      });
      if (!mountedRef.current || requestId !== uploadPhotoRequestIdRef.current) return;
      setProfile(uploaded.profile);
      setMessage("전신 사진을 저장했습니다.");
    } catch (error) {
      if (mountedRef.current && requestId === uploadPhotoRequestIdRef.current) {
        setMessage(mapMobileUserError(
          error,
          "전신 사진을 업로드하지 못했습니다. 사진을 확인하고 다시 시도해 주세요.",
          "photo",
        ));
      }
    } finally {
      if (mountedRef.current && requestId === uploadPhotoRequestIdRef.current) setIsUploadingPhoto(false);
    }
  }, [api, resolvePhotoLibraryPermission]);

  const deleteBodyPhoto = useCallback(async () => {
    if (isDeletingPhoto || isUploadingPhoto || !profile?.bodyPhotoPath) return;
    const requestId = ++deletePhotoRequestIdRef.current;
    setIsDeletingPhoto(true);
    setMessage(null);
    try {
      const result = await api.deleteBodyPhoto();
      if (!mountedRef.current || requestId !== deletePhotoRequestIdRef.current) return;
      setProfile(result.profile);
      setMessage("전신 사진을 비공개 저장소에서 삭제했습니다. 룩북을 만들려면 새 사진을 등록해 주세요.");
    } catch (error) {
      if (mountedRef.current && requestId === deletePhotoRequestIdRef.current) {
        setMessage(mapMobileUserError(error, "전신 사진을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.", "photo"));
      }
    } finally {
      if (mountedRef.current && requestId === deletePhotoRequestIdRef.current) setIsDeletingPhoto(false);
    }
  }, [api, isDeletingPhoto, isUploadingPhoto, profile?.bodyPhotoPath]);

  const loadHairList = useCallback(async () => {
    const requestId = ++hairListRequestIdRef.current;
    setIsLoadingHairList(true);
    setMessage(null);
    setHairListError(null);
    try {
      const result = await api.getStylingHairstyles();
      if (!mountedRef.current || requestId !== hairListRequestIdRef.current) return;
      setHairGroups(result.generations);
    } catch (error) {
      if (mountedRef.current && requestId === hairListRequestIdRef.current) {
        const safeMessage = mapMobileUserError(error, "최근 헤어스타일 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setHairListError(safeMessage);
        setMessage(safeMessage);
      }
    } finally {
      if (mountedRef.current && requestId === hairListRequestIdRef.current) setIsLoadingHairList(false);
    }
  }, [api]);

  const openHairModal = useCallback(() => {
    setHairModalOpen(true);
    if (hairGroups.length === 0 && !isLoadingHairList) void loadHairList();
  }, [hairGroups.length, isLoadingHairList, loadHairList]);
  const closeHairModal = useCallback(() => setHairModalOpen(false), []);

  const handleHairSelect = useCallback((nextGenerationId: string, variant: GeneratedVariant) => {
    setGenerationId(nextGenerationId);
    setSelectedVariantId(variant.id);
    setSelectedVariant(variant);
    clearRecommendation();
    setHairModalOpen(false);
    setHairListError(null);
    setCurrentStep(1);
  }, [clearRecommendation]);

  const handleGenreSelect = useCallback((value: FashionGenre) => {
    setGenre(value);
    clearRecommendation();
  }, [clearRecommendation]);

  const handleRecommend = useCallback(async () => {
    if (!stepOneReady || isRecommending) return;
    const requestId = ++recommendRequestIdRef.current;
    setIsRecommending(true);
    setMessage(null);
    try {
      const result = await api.recommendStyling({ generationId, selectedVariantId, genre });
      if (!mountedRef.current || requestId !== recommendRequestIdRef.current) return;
      if (!result.sessionId) throw new Error("STYLING_SESSION_MISSING");
      setSessionId(result.sessionId);
      setRecommendation(result.recommendation);
      setSelectedVariant(result.selectedVariant);
      setProfile(result.profile);
      setCurrentStep(3);
      setMessage("패션 추천이 준비되었습니다. 서버 견적을 확인한 뒤 룩북 생성을 직접 시작해 주세요.");
      await refreshQuote(result.sessionId);
    } catch (error) {
      if (mountedRef.current && requestId === recommendRequestIdRef.current) {
        setMessage(mapMobileUserError(error, "패션 추천을 만들지 못했습니다. 프로필과 헤어스타일을 확인한 뒤 다시 시도해 주세요."));
      }
    } finally {
      if (mountedRef.current && requestId === recommendRequestIdRef.current) setIsRecommending(false);
    }
  }, [api, generationId, genre, isRecommending, refreshQuote, selectedVariantId, stepOneReady]);

  const handleGenerate = useCallback(async () => {
    if (!sessionId || isGenerating || quoteLoading) return;
    if (!quote || quote.subjectId !== sessionId || quote.action !== "outfit_generation" || isPaidActionQuoteExpired(quote)) {
      const wasExpired = Boolean(quote && isPaidActionQuoteExpired(quote));
      const refreshedQuote = await refreshQuote();
      if (refreshedQuote) setMessage(wasExpired ? "견적이 만료되어 최신 견적을 불러왔습니다. 비용을 확인한 뒤 생성 버튼을 다시 눌러 주세요." : "최신 견적을 준비했습니다. 비용을 확인한 뒤 생성 버튼을 다시 눌러 주세요.");
      return;
    }
    if (!quote.isAllowed) {
      setMessage(`크레딧이 ${quote.shortfallCredits} 부족합니다. 충전 후 최신 견적을 다시 확인해 주세요.`);
      return;
    }
    const requestId = ++generateRequestIdRef.current;
    setIsGenerating(true);
    setMessage("룩북 생성을 요청하고 있습니다. 완료 또는 실패 영수증이 확인될 때까지 기다려 주세요.");
    try {
      const result = await api.generateStyling(sessionId, quote.quoteId);
      if (!mountedRef.current || requestId !== generateRequestIdRef.current) return;
      router.push(`/styler/${result.sessionId || sessionId}`);
    } catch (error) {
      if (!mountedRef.current || requestId !== generateRequestIdRef.current) return;
      if (error instanceof HairfitApiError) {
        const code = readStylingQuoteErrorCode(error.payload);
        const freshQuote = readFreshStylingQuote(error.payload, sessionId);
        if (freshQuote) {
          setQuote(freshQuote);
          setQuoteError(null);
          setMessage(stylingQuoteRefreshMessage(code, freshQuote));
          return;
        }
        if (code) {
          const refreshedQuote = await refreshQuote();
          setMessage(refreshedQuote
            ? stylingQuoteRefreshMessage(code, refreshedQuote)
            : mapMobileUserError(error, "최신 견적을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."));
          return;
        }
      }
      setMessage(mapMobileUserError(error, "룩북 이미지 생성 요청에 실패했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      if (mountedRef.current && requestId === generateRequestIdRef.current) setIsGenerating(false);
    }
  }, [api, isGenerating, quote, quoteLoading, refreshQuote, router, sessionId]);

  const openBilling = useCallback(() => {
    if (sessionId) router.push(buildMobileStylerBillingHref(sessionId));
  }, [router, sessionId]);
  const isBackNavigationBlocked =
    isSavingProfile || isUploadingPhoto || isDeletingPhoto || isRecommending || isGenerating;
  const notifyBackNavigationBlocked = useCallback(() => {
    setMessage("현재 스타일링 작업의 안전한 응답을 확인하고 있습니다. 완료 안내가 표시된 뒤 이동해 주세요.");
  }, []);

  return {
    avoidItems,
    bodyShape,
    bottomSize,
    closeHairModal,
    colorPreference,
    exposurePreference,
    fitPreference,
    genre,
    hairListError,
    hairGroups,
    hairModalOpen,
    handleGenerate,
    handleGenreSelect,
    handleHairSelect,
    handleRecommend,
    heightCm,
    isGenerating,
    isBackNavigationBlocked,
    isLoadingHairList,
    isLoadingProfile,
    isLoadingVariant,
    isRecommending,
    isDeletingPhoto,
    isSavingProfile,
    isUploadingPhoto,
    message,
    notifyBackNavigationBlocked,
    openBilling,
    openBodyPhotoPermissionSettings,
    openHairModal,
    photoPermissionRequiresSettings,
    profile,
    quote,
    quoteError,
    quoteExpired,
    quoteLoading,
    recommendation,
    refreshQuote,
    saveProfile,
    selectedGenre,
    selectedVariant,
    selectedVariantId,
    setAvoidItems,
    setBodyShape,
    setBottomSize,
    setColorPreference,
    setCurrentStep,
    setExposurePreference,
    setFitPreference,
    setHeightCm,
    setTopSize,
    stepOneReady,
    stepThreeReady,
    topSize,
    deleteBodyPhoto,
    uploadBodyPhoto,
    visibleStep,
  };
}

export type MobileStylerNewController = ReturnType<typeof useMobileStylerNewController>;
