"use client";

import {
  normalizePaidActionQuote,
  type PaidActionQuote,
} from "@hairfit/shared";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mapWebResponseError, mapWebUserError } from "../../lib/web-user-message";
import { useAuthenticatedFetch } from "../../hooks/useAuthenticatedFetch";
import { usePaidActionQuoteExpired } from "../billing/PaidActionQuoteCard";
import {
  buildWebStylerSessionBillingHref,
  normalizeWebStylerReceipt,
  type WebStylingDetailsResponse,
  type WebStylingGenerateResponse,
  type WebStylingQuoteResponse,
  type WebStylingSessionDetails,
} from "./stylerSessionModel";

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useStylerSessionController() {
  const authenticatedFetch = useAuthenticatedFetch();
  const params = useParams<{ id: string }>();
  const id = params?.id || "";
  const sessionRequestSequenceRef = useRef(0);
  const quoteRequestSequenceRef = useRef(0);
  const generateControllerRef = useRef<AbortController | null>(null);
  const [session, setSession] = useState<WebStylingSessionDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [quote, setQuote] = useState<PaidActionQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const quoteExpired = usePaidActionQuoteExpired(quote);
  const billingHref = useMemo(() => buildWebStylerSessionBillingHref(id), [id]);

  const loadSession = useCallback(async (signal?: AbortSignal, quiet = false) => {
    if (!id) return;
    const sequence = sessionRequestSequenceRef.current + 1;
    sessionRequestSequenceRef.current = sequence;
    if (!quiet) setIsLoading(true);
    try {
      const response = await authenticatedFetch(`/api/styling/${encodeURIComponent(id)}`, {
        cache: "no-store",
        signal,
      });
      const data = (await response.json().catch(() => null)) as WebStylingDetailsResponse | null;
      if (sequence !== sessionRequestSequenceRef.current || signal?.aborted) return;
      if (!response.ok || !data?.session) throw new Error(data?.error || "패션 추천 결과를 불러오지 못했습니다.");
      setSession({
        ...data.session,
        creditsUsed: Number(data.session.creditsUsed || 0),
        creditReceipt: normalizeWebStylerReceipt(data.session.creditReceipt),
      });
      setError(null);
    } catch (loadError) {
      if (sequence !== sessionRequestSequenceRef.current || signal?.aborted || isAbortError(loadError)) return;
      setError(mapWebUserError(loadError, "패션 추천 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      if (sequence === sessionRequestSequenceRef.current && !signal?.aborted) setIsLoading(false);
    }
  }, [authenticatedFetch, id]);

  const loadQuote = useCallback(async (signal?: AbortSignal) => {
    if (!id) return;
    const sequence = quoteRequestSequenceRef.current + 1;
    quoteRequestSequenceRef.current = sequence;
    setQuoteLoading(true);
    setQuote(null);
    setQuoteError(null);
    setActionError(null);
    try {
      const response = await authenticatedFetch("/api/paid-actions/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "outfit_generation",
          subjectId: id,
          billingScope: "customer",
        }),
        cache: "no-store",
        signal,
      });
      const data = (await response.json().catch(() => null)) as WebStylingQuoteResponse | null;
      if (sequence !== quoteRequestSequenceRef.current || signal?.aborted) return;
      const nextQuote = normalizePaidActionQuote(data?.quote);
      if (!response.ok || !nextQuote) throw new Error(data?.error || "최신 룩북 크레딧 견적을 불러오지 못했습니다.");
      setQuote(nextQuote);
    } catch (loadError) {
      if (sequence !== quoteRequestSequenceRef.current || signal?.aborted || isAbortError(loadError)) return;
      setQuoteError(mapWebUserError(loadError, "최신 룩북 크레딧 견적을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      if (sequence === quoteRequestSequenceRef.current && !signal?.aborted) setQuoteLoading(false);
    }
  }, [authenticatedFetch, id]);

  useEffect(() => {
    const controller = new AbortController();
    const loadTimer = window.setTimeout(() => void loadSession(controller.signal), 0);
    return () => {
      window.clearTimeout(loadTimer);
      controller.abort();
      sessionRequestSequenceRef.current += 1;
    };
  }, [loadSession]);

  useEffect(() => {
    if (session?.status !== "generating") return;
    let active = true;
    let timer: number | undefined;
    const controller = new AbortController();
    const scheduleNextPoll = () => {
      timer = window.setTimeout(async () => {
        await loadSession(controller.signal, true);
        if (active && !controller.signal.aborted) scheduleNextPoll();
      }, 3_000);
    };
    scheduleNextPoll();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadSession, session?.status]);

  useEffect(() => {
    if (session?.status !== "recommended" && session?.status !== "failed") return;
    const controller = new AbortController();
    const loadTimer = window.setTimeout(() => void loadQuote(controller.signal), 0);
    return () => {
      window.clearTimeout(loadTimer);
      controller.abort();
      quoteRequestSequenceRef.current += 1;
    };
  }, [loadQuote, session?.status]);

  useEffect(() => () => {
    generateControllerRef.current?.abort();
  }, []);

  const handleGenerate = useCallback(async () => {
    if (
      !session ||
      isGenerating ||
      !quote ||
      quoteExpired ||
      !quote.isAllowed ||
      (session.status !== "recommended" && session.status !== "failed")
    ) return;

    const previousStatus = session.status;
    generateControllerRef.current?.abort();
    const controller = new AbortController();
    generateControllerRef.current = controller;
    setIsGenerating(true);
    setActionError(null);
    setSession((current) => current ? { ...current, status: "generating" } : current);
    try {
      const response = await authenticatedFetch("/api/styling/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, quoteId: quote.quoteId }),
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => null)) as WebStylingGenerateResponse | null;
      if (controller.signal.aborted) return;
      const refreshedQuote = normalizePaidActionQuote(data?.quote);
      const receipt = normalizeWebStylerReceipt(data?.creditReceipt);
      if (refreshedQuote) setQuote(refreshedQuote);
      else if (data?.code?.startsWith("QUOTE_")) setQuote(null);

      if (!response.ok) {
        setSession((current) => current ? {
          ...current,
          status: data?.code === "STYLING_GENERATION_FAILED" ? "failed" : previousStatus,
          errorMessage: data?.code === "STYLING_GENERATION_FAILED"
            ? mapWebResponseError(response.status, "룩북 이미지를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.")
            : current.errorMessage,
          creditReceipt: receipt || current.creditReceipt,
        } : current);
        setActionError(mapWebResponseError(response.status, "룩북 이미지를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요."));
        if (data?.code === "STYLING_GENERATION_FAILED") await loadSession(undefined, true);
        return;
      }

      setQuote(null);
      setSession((current) => current ? {
        ...current,
        status: data?.status || "generating",
        imageUrl: data?.imageUrl ?? current.imageUrl,
        creditReceipt: receipt || current.creditReceipt,
      } : current);
      await loadSession(undefined, true);
    } catch (requestError) {
      if (controller.signal.aborted || isAbortError(requestError)) return;
      setActionError("생성 요청의 응답을 확인하지 못했습니다. 현재 세션 상태를 계속 확인하고 있습니다.");
      await loadSession(undefined, true);
    } finally {
      if (!controller.signal.aborted) setIsGenerating(false);
    }
  }, [authenticatedFetch, isGenerating, loadSession, quote, quoteExpired, session]);

  const refreshQuote = useCallback(() => {
    void loadQuote();
  }, [loadQuote]);

  return {
    actionError,
    billingHref,
    error,
    handleGenerate,
    isGenerating,
    isLoading,
    quote,
    quoteError,
    quoteExpired,
    quoteLoading,
    refreshQuote,
    session,
  };
}

export type StylerSessionController = ReturnType<typeof useStylerSessionController>;
