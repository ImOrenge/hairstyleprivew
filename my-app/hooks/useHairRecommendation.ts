"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HairAdjustmentAspect, HairRecommendationDecisionV1 } from "@hairfit/shared/consulting/hair-recommendation";
import type { PreviewBoard } from "../lib/consulting/preview-board-client";

type HairRecommendationResponse = {
  decision?: HairRecommendationDecisionV1 | null;
  board?: PreviewBoard | null;
  recommendedRoute?: string;
  error?: string;
};

export function useHairRecommendation(sessionId: string, pollingEnabled = true) {
  const [decision, setDecision] = useState<HairRecommendationDecisionV1 | null>(null);
  const [board, setBoard] = useState<PreviewBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const evaluating = useRef(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/v2/consultations/${encodeURIComponent(sessionId)}/hair-recommendation`, { cache: "no-store" });
    const data = await response.json().catch(() => ({})) as HairRecommendationResponse;
    if (data.board) setBoard(data.board);
    if (data.decision) setDecision(data.decision);
    const needsEvaluation = data.board?.state === "ready"
      && (!data.decision || data.decision.previewBatch.batchId !== data.board.id);
    if (needsEvaluation && !evaluating.current) {
      evaluating.current = true;
      try {
        const evaluate = await fetch(`/api/v2/consultations/${encodeURIComponent(sessionId)}/hair-recommendation/evaluate`, { method: "POST" });
        const evaluated = await evaluate.json().catch(() => ({})) as HairRecommendationResponse;
        if (!evaluate.ok || !evaluated.decision) throw new Error(evaluated.error || "AI 추천 평가를 완료하지 못했습니다.");
        setDecision(evaluated.decision);
        setError(null);
        return { ...evaluated, board: data.board };
      } finally {
        evaluating.current = false;
        setLoading(false);
      }
    }
    if (response.ok) {
      setError(null);
      setLoading(false);
      return data;
    }
    setLoading(false);
    if (response.status !== 404) setError(data.error || "헤어 추천 상태를 불러오지 못했습니다.");
    return data;
  }, [sessionId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void refresh().catch((cause) => {
        if (!active) return;
        setLoading(false);
        setError(cause instanceof Error ? cause.message : "헤어 추천 상태를 불러오지 못했습니다.");
      });
    });
    if (!pollingEnabled) return () => { active = false; };
    const timer = window.setInterval(() => void refresh(), 4_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [pollingEnabled, refresh]);

  const post = useCallback(async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(`/api/v2/consultations/${encodeURIComponent(sessionId)}/hair-recommendation/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({})) as HairRecommendationResponse;
    if (!response.ok) throw new Error(data.error || "헤어 추천 요청을 처리하지 못했습니다.");
    if (data.decision) setDecision(data.decision);
    return data;
  }, [sessionId]);

  return {
    board,
    decision,
    loading,
    error,
    refresh,
    answerClarification: (answer: string) => post("clarification", { expectedRevision: decision?.revision, answer }),
    confirm: (selectedPreviewId: string) => post("confirm", { expectedRevision: decision?.revision, selectedPreviewId }),
    adjust: (aspects: Array<{ aspect: HairAdjustmentAspect; value: string }>) => post("adjust", {
      expectedRevision: decision?.revision,
      aspects,
      idempotencyKey: `${sessionId}:hair-adjust:${decision?.revision}:${Date.now()}`,
    }),
  };
}
