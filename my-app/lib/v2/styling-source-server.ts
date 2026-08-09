import "server-only";

import type { StyleSelectionSnapshotV2 } from "@hairfit/shared/v2";
import type { GeneratedVariant, RecommendationSet } from "../recommendation-types";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "./errors";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeRecommendationSet(raw: unknown): RecommendationSet | null {
  if (!object(raw).analysis || !Array.isArray(object(raw).variants)) return null;
  const value = object(raw);
  return {
    generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : new Date().toISOString(),
    analysis: value.analysis as RecommendationSet["analysis"],
    variants: value.variants as GeneratedVariant[],
    selectedVariantId: typeof value.selectedVariantId === "string" ? value.selectedVariantId : null,
    catalogCycleId: typeof value.catalogCycleId === "string" ? value.catalogCycleId : null,
    creditChargedAt: typeof value.creditChargedAt === "string" ? value.creditChargedAt : null,
    creditChargeAmount: typeof value.creditChargeAmount === "number" ? value.creditChargeAmount : null,
  };
}

function sourceVariant(recommendationSet: RecommendationSet, snapshot: StyleSelectionSnapshotV2) {
  return recommendationSet.variants.find((variant) => variant.v2PreviewVariantId === snapshot.previewVariantId) ?? null;
}

export async function loadConfirmedV2StylingSource(input: { userId: string; consultationId: string }) {
  const db = getSupabaseAdminClient();
  const session = await db
    .from("consultation_sessions")
    .select("id,source_generation_id,selected_snapshot_id")
    .eq("id", input.consultationId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (session.error) throw new Error(session.error.message);
  if (!session.data) throw new HairfitV2Error("CONSULTATION_NOT_FOUND", 404, "상담을 찾을 수 없습니다.");
  const sessionRow = session.data as { source_generation_id?: unknown; selected_snapshot_id?: unknown };
  const generationId = typeof sessionRow.source_generation_id === "string" ? sessionRow.source_generation_id : "";
  const selectionSnapshotId = typeof sessionRow.selected_snapshot_id === "string" ? sessionRow.selected_snapshot_id : "";
  if (!generationId || !selectionSnapshotId) {
    throw new HairfitV2Error("SELECTION_NOT_CONFIRMED", 409, "확정된 헤어 선택이 있어야 패션 추천을 만들 수 있습니다.");
  }

  const [selection, generation] = await Promise.all([
    db.from("style_selection_snapshots_v2")
      .select("id,snapshot")
      .eq("id", selectionSnapshotId)
      .eq("consultation_id", input.consultationId)
      .eq("user_id", input.userId)
      .eq("status", "confirmed")
      .maybeSingle(),
    db.from("generations")
      .select("id,user_id,options")
      .eq("id", generationId)
      .eq("user_id", input.userId)
      .maybeSingle(),
  ]);
  if (selection.error) throw new Error(selection.error.message);
  if (generation.error) throw new Error(generation.error.message);
  if (!selection.data || !generation.data) {
    throw new HairfitV2Error("STYLING_SOURCE_NOT_FOUND", 404, "확정한 헤어 이미지 원본을 찾을 수 없습니다.");
  }
  const snapshot = (selection.data as unknown as { snapshot: StyleSelectionSnapshotV2 }).snapshot;
  const generationOptions = object((generation.data as { options?: unknown }).options);
  const recommendationSet = normalizeRecommendationSet(generationOptions.recommendationSet);
  if (!recommendationSet) {
    throw new HairfitV2Error("STYLING_SOURCE_INVALID", 409, "헤어 추천 세트를 다시 불러와 주세요.");
  }
  const selectedVariant = sourceVariant(recommendationSet, snapshot);
  if (!selectedVariant?.outputUrl && !selectedVariant?.generatedImagePath) {
    throw new HairfitV2Error("STYLING_SOURCE_IMAGE_UNAVAILABLE", 409, "확정한 헤어 이미지가 아직 준비되지 않았습니다.");
  }
  return {
    consultationId: input.consultationId,
    selectionSnapshotId,
    generationId,
    selectedVariantId: selectedVariant.id,
    selectedVariant,
    recommendationSet,
    snapshot,
  };
}

export async function resolveV2StylingSessionVariant(input: {
  userId: string;
  session: Record<string, unknown>;
  recommendationSet: RecommendationSet;
}) {
  const consultationId = typeof input.session.consultation_id === "string" ? input.session.consultation_id : "";
  const selectionSnapshotId = typeof input.session.selection_snapshot_id === "string" ? input.session.selection_snapshot_id : "";
  if (!consultationId || !selectionSnapshotId) {
    throw new HairfitV2Error("STYLING_SOURCE_INVALID", 409, "패션 세션의 확정 선택 연결이 없습니다.");
  }
  const selection = await getSupabaseAdminClient()
    .from("style_selection_snapshots_v2")
    .select("snapshot")
    .eq("id", selectionSnapshotId)
    .eq("consultation_id", consultationId)
    .eq("user_id", input.userId)
    .eq("status", "confirmed")
    .maybeSingle();
  if (selection.error) throw new Error(selection.error.message);
  if (!selection.data) {
    throw new HairfitV2Error("SELECTION_NOT_CONFIRMED", 409, "확정 선택이 변경되어 패션 생성을 계속할 수 없습니다.");
  }
  const snapshot = (selection.data as unknown as { snapshot: StyleSelectionSnapshotV2 }).snapshot;
  const selectedVariant = sourceVariant(input.recommendationSet, snapshot);
  if (!selectedVariant || selectedVariant.id !== input.session.selected_variant_id) {
    throw new HairfitV2Error("STYLING_SELECTION_CHANGED", 409, "확정한 헤어스타일이 변경되었습니다.");
  }
  return selectedVariant;
}
