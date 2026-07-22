import { HairfitApiError } from "@hairfit/api-client";
import {
  getStylingSessionStatusPresentation,
  isPaidActionQuoteExpired,
  normalizePaidActionQuote,
  type PaidActionQuote,
  type StylingSessionDetails,
} from "@hairfit/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNativePaidActionQuoteExpired } from "../billing/PaidActionQuoteCard";
import { useHairfitApi } from "../../lib/api";
import { mapMobileUserError } from "../../lib/mobile-user-message";
import {
  readFreshStylingQuote,
  readStylingQuoteErrorCode,
  stylingQuoteRefreshMessage,
  stylingQuoteRequestErrorMessage,
} from "../../lib/styling-paid-action";
import { buildMobileStylerBillingHref } from "./mobileStylerModel";
import { getMobileStylerSessionMessage } from "./mobileStylerSessionModel";

export function useMobileStylerSessionController() {
  const router = useRouter();
  const api = useHairfitApi();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = typeof id === "string" ? id : "";
  const [session, setSession] = useState<StylingSessionDetails | null>(null);
  const [message, setMessage] = useState("패션 룩북을 불러오고 있습니다.");
  const [isGenerating, setIsGenerating] = useState(false);
  const [quote, setQuote] = useState<PaidActionQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const sessionRequestIdRef = useRef(0);
  const sessionRequestPendingRef = useRef(false);
  const quoteRequestIdRef = useRef(0);
  const generateRequestIdRef = useRef(0);
  const quoteExpired = useNativePaidActionQuoteExpired(quote);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRequestIdRef.current += 1;
      quoteRequestIdRef.current += 1;
      generateRequestIdRef.current += 1;
      sessionRequestPendingRef.current = false;
    };
  }, []);

  const refreshSession = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!sessionId || sessionRequestPendingRef.current) return null;
    const requestId = ++sessionRequestIdRef.current;
    sessionRequestPendingRef.current = true;
    if (!options.silent) setMessage("패션 룩북 상태를 확인하고 있습니다.");
    try {
      const result = await api.getStylingSession(sessionId);
      if (!mountedRef.current || requestId !== sessionRequestIdRef.current) return null;
      setSession(result.session);
      setMessage(getMobileStylerSessionMessage(result.session.status));
      return result.session;
    } catch (error) {
      if (!mountedRef.current || requestId !== sessionRequestIdRef.current) return null;
      setMessage(mapMobileUserError(error, "패션 룩북을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
      return null;
    } finally {
      if (mountedRef.current && requestId === sessionRequestIdRef.current) sessionRequestPendingRef.current = false;
    }
  }, [api, sessionId]);

  const refreshQuote = useCallback(async () => {
    if (!sessionId) {
      setQuote(null);
      setQuoteError("유효한 패션 추천 세션이 필요합니다.");
      return null;
    }
    const requestId = ++quoteRequestIdRef.current;
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const response = await api.createPaidActionQuote({
        action: "outfit_generation",
        subjectId: sessionId,
        billingScope: "customer",
      });
      const normalized = normalizePaidActionQuote(response.quote);
      if (!normalized || normalized.action !== "outfit_generation" || normalized.billingScope !== "customer" || normalized.subjectId !== sessionId) {
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

  useEffect(() => {
    void refreshSession();
    return () => {
      sessionRequestIdRef.current += 1;
      sessionRequestPendingRef.current = false;
    };
  }, [refreshSession]);

  useEffect(() => {
    const status = getStylingSessionStatusPresentation(session?.status).status;
    if (status !== "generating") return;
    const interval = setInterval(() => void refreshSession({ silent: true }), 3_000);
    return () => clearInterval(interval);
  }, [refreshSession, session?.status]);

  useEffect(() => {
    const status = getStylingSessionStatusPresentation(session?.status).status;
    quoteRequestIdRef.current += 1;
    setQuote(null);
    setQuoteError(null);
    setQuoteLoading(false);
    if (status !== "recommended" && status !== "failed") return;
    void refreshQuote();
    return () => {
      quoteRequestIdRef.current += 1;
    };
  }, [refreshQuote, session?.status]);

  const handleGenerate = useCallback(async () => {
    if (!sessionId || isGenerating || quoteLoading) return;
    if (!quote || quote.action !== "outfit_generation" || quote.subjectId !== sessionId || isPaidActionQuoteExpired(quote)) {
      const wasExpired = Boolean(quote && isPaidActionQuoteExpired(quote));
      const freshQuote = await refreshQuote();
      if (freshQuote) setMessage(wasExpired ? "견적이 만료되어 최신 견적을 불러왔습니다. 비용을 확인한 뒤 생성 버튼을 다시 눌러 주세요." : "최신 견적을 준비했습니다. 비용을 확인한 뒤 생성 버튼을 다시 눌러 주세요.");
      return;
    }
    if (!quote.isAllowed) {
      setMessage(`크레딧이 ${quote.shortfallCredits} 부족합니다. 충전 후 최신 견적을 다시 확인해 주세요.`);
      return;
    }

    const requestId = ++generateRequestIdRef.current;
    setIsGenerating(true);
    setMessage("룩북 생성 요청을 서버에 전달하고 있습니다.");
    try {
      const result = await api.generateStyling(sessionId, quote.quoteId);
      if (!mountedRef.current || requestId !== generateRequestIdRef.current) return;
      setSession((current) => current ? {
        ...current,
        status: result.status || (result.imageUrl ? "completed" : "generating"),
        imageUrl: result.imageUrl ?? current.imageUrl,
        generatedImagePath: result.imagePath ?? current.generatedImagePath,
        creditReceipt: result.creditReceipt ?? current.creditReceipt,
      } : current);
      setQuote(null);
      setQuoteError(null);
      await refreshSession({ silent: true });
    } catch (error) {
      if (!mountedRef.current || requestId !== generateRequestIdRef.current) return;
      if (error instanceof HairfitApiError) {
        const code = readStylingQuoteErrorCode(error.payload);
        const freshQuote = readFreshStylingQuote(error.payload, sessionId);
        if (freshQuote) {
          setQuote(freshQuote);
          setQuoteError(null);
          setMessage(stylingQuoteRefreshMessage(code, freshQuote));
          await refreshSession({ silent: true });
          return;
        }
        if (code) {
          const refreshedQuote = await refreshQuote();
          setMessage(refreshedQuote
            ? stylingQuoteRefreshMessage(code, refreshedQuote)
            : mapMobileUserError(error, "최신 견적을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."));
          await refreshSession({ silent: true });
          return;
        }
      }
      setMessage(mapMobileUserError(error, "룩북 이미지 생성 요청에 실패했습니다. 잠시 후 다시 시도해 주세요."));
      await refreshSession({ silent: true });
    } finally {
      if (mountedRef.current && requestId === generateRequestIdRef.current) setIsGenerating(false);
    }
  }, [api, isGenerating, quote, quoteLoading, refreshQuote, refreshSession, sessionId]);

  const openBilling = useCallback(() => {
    if (sessionId) router.push(buildMobileStylerBillingHref(sessionId));
  }, [router, sessionId]);
  const openHairResult = useCallback(() => {
    if (session) router.push(`/result/${session.generationId}?variant=${encodeURIComponent(session.selectedVariantId)}`);
  }, [router, session]);
  const openNewStyler = useCallback(() => router.push("/styler/new"), [router]);

  return {
    handleGenerate,
    isGenerating,
    message,
    openBilling,
    openHairResult,
    openNewStyler,
    quote,
    quoteError,
    quoteExpired,
    quoteLoading,
    refreshQuote,
    session,
    statusPresentation: getStylingSessionStatusPresentation(session?.status),
  };
}

export type MobileStylerSessionController = ReturnType<typeof useMobileStylerSessionController>;
