import type { ConsultationPreview } from "./contracts";

export type PreviewBoardAttempt = { id: string; status: string; outputUrl: string | null };
export type PreviewBoardVariant = { id: string; slot: number; bucket: "face_balance" | "image_change" | "manageability"; intent: string; status: string; attempts: PreviewBoardAttempt[] };
export type PreviewBoard = { id: string; state: "queued" | "generating" | "ready" | "failed"; acceptedCount: number; variants: PreviewBoardVariant[] };

const PREVIEW_AXIS = { face_balance: "BALANCE", image_change: "IMAGE", manageability: "LIFESTYLE" } as const;

export function mapPreviewBoard(board: PreviewBoard): ConsultationPreview[] {
  return board.variants.map((variant) => {
    const accepted = [...variant.attempts].reverse().find((attempt) => attempt.status === "accepted" && attempt.outputUrl);
    return {
      id: variant.id,
      axis: PREVIEW_AXIS[variant.bucket],
      label: `${PREVIEW_AXIS[variant.bucket]} ${(variant.slot - 1) % 3 + 1}`,
      reason: variant.intent,
      imageUrl: accepted?.outputUrl ?? null,
      generatedImagePath: null,
      status: accepted ? "accepted" : board.state === "failed" ? "failed" : variant.status === "generating" ? "generating" : "pending",
      sourceVariantId: variant.id,
    };
  });
}

export function previewsMatch(left: ConsultationPreview[], right: ConsultationPreview[]) {
  if (left.length !== right.length) return false;
  return left.every((preview, index) => {
    const candidate = right[index];
    return Boolean(candidate)
      && preview.id === candidate.id
      && preview.axis === candidate.axis
      && preview.label === candidate.label
      && preview.reason === candidate.reason
      && preview.imageUrl === candidate.imageUrl
      && preview.generatedImagePath === candidate.generatedImagePath
      && preview.status === candidate.status
      && preview.sourceVariantId === candidate.sourceVariantId;
  });
}
