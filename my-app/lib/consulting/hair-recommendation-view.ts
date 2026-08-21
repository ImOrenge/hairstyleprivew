import type { HairRecommendationDecisionV1 } from "@hairfit/shared/consulting/hair-recommendation";
import type { PreviewBoard } from "./preview-board-client";

export type HairConsultantViewState =
  | "preparing-nine"
  | "generating-nine"
  | "recovering-slots"
  | "ranking-nine"
  | "primary-review"
  | "adjustment-capture"
  | "confirming"
  | "handoff"
  | "blocked";

export function deriveHairConsultantViewState(input: {
  board: PreviewBoard | null;
  decision: HairRecommendationDecisionV1 | null;
  adjusting?: boolean;
  confirming?: boolean;
}): HairConsultantViewState {
  if (input.confirming) return "confirming";
  if (input.adjusting) return "adjustment-capture";
  if (input.decision?.state === "confirmed") return "handoff";
  if (input.board?.state === "failed" || input.decision?.state === "failed") return "blocked";
  if (!input.board) return "preparing-nine";
  if (input.board.acceptedCount < 9) {
    const rejectedOrFailed = input.board.variants.some((variant) => variant.attempts.some((attempt) => attempt.status === "rejected" || attempt.status === "failed"));
    return rejectedOrFailed ? "recovering-slots" : "generating-nine";
  }
  if (!input.decision || ["planning-nine", "preview-batch-generating", "ranking"].includes(input.decision.state)) return "ranking-nine";
  if (["primary-ready", "clarification-required"].includes(input.decision.state)) return "primary-review";
  if (input.decision.state === "adjustment-requested") return "adjustment-capture";
  return "blocked";
}

const REASON_LABELS: Record<string, string> = {
  "catalog-linked": "현재 상담 조건과 카탈로그 설계를 함께 반영했어요.",
  "catalog-fallback": "카탈로그 범위 안에서 가장 가까운 안전한 방향을 사용했어요.",
  "accepted-quality-gate": "얼굴 보존과 이미지 품질 검사를 통과했어요.",
};

export function customerHairReasonLabel(reasonCode: string) {
  if (reasonCode.startsWith("bucket:face_balance")) return "얼굴 비율과 헤어라인 균형을 우선했어요.";
  if (reasonCode.startsWith("bucket:image_change")) return "원하는 이미지 변화가 보이도록 설계했어요.";
  if (reasonCode.startsWith("bucket:manageability")) return "평소 관리 가능한 범위를 우선했어요.";
  if (reasonCode.startsWith("clarification:")) return "추가로 확인한 답변을 추천 순위에 반영했어요.";
  if (reasonCode.startsWith("intent:")) return "각기 다른 설계 의도를 비교해 가장 적합한 안을 골랐어요.";
  return REASON_LABELS[reasonCode] ?? "상담 입력과 분석 근거를 함께 확인했어요.";
}
