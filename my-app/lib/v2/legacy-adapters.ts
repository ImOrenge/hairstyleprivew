import "server-only";

import { getSupabaseAdminClient } from "../supabase";
import { isHairfitV2Enabled } from "./feature-flags";
import { recordV2Event } from "./observability";
import { recordActualServiceAndAftercareV2 } from "./outputs-server";
import { confirmStyleSelectionV2, selectStyleV2 } from "./selection-server";

export async function syncLegacyAftercareV2(input: {
  userId: string;
  consultationId: string | null;
  previewVariantId: string | null;
  hairRecordId: string;
  serviceType: string;
  serviceDate: string;
}) {
  if (!input.consultationId || !input.previewVariantId || !isHairfitV2Enabled("CONSULTATION_SESSION_V2_ENABLED")) {
    return { state: "skipped" as const };
  }
  const db = getSupabaseAdminClient();
  try {
    let sessionResult = await db
      .from("consultation_sessions")
      .select("version,lifecycle_state,selected_snapshot_id")
      .eq("id", input.consultationId)
      .eq("user_id", input.userId)
      .single();
    if (sessionResult.error) throw new Error(sessionResult.error.message);
    let session = sessionResult.data as unknown as { version: number; lifecycle_state: string; selected_snapshot_id: string | null };
    if (!session.selected_snapshot_id) {
      await selectStyleV2({
        userId: input.userId,
        consultationId: input.consultationId,
        previewVariantId: input.previewVariantId,
        expectedVersion: session.version,
      });
      sessionResult = await db
        .from("consultation_sessions")
        .select("version,lifecycle_state,selected_snapshot_id")
        .eq("id", input.consultationId)
        .eq("user_id", input.userId)
        .single();
      if (sessionResult.error) throw new Error(sessionResult.error.message);
      session = sessionResult.data as unknown as typeof session;
    }
    if (session.lifecycle_state === "style_selected" && session.selected_snapshot_id) {
      await confirmStyleSelectionV2({
        userId: input.userId,
        consultationId: input.consultationId,
        snapshotId: session.selected_snapshot_id,
        expectedVersion: session.version,
      });
    }
    await recordActualServiceAndAftercareV2({
      userId: input.userId,
      consultationId: input.consultationId,
      idempotencyKey: `legacy-aftercare:${input.hairRecordId}`,
      services: [input.serviceType],
      serviceDate: input.serviceDate,
      designerNotes: "Legacy aftercare confirmation adapter",
      today: ["디자이너가 안내한 세정·열기구 제한을 우선 적용합니다."],
      checkpoints: [
        { offset: "D+1", action: "시술 직후 자극과 세정 주의사항을 확인합니다.", complete: false },
        { offset: "D+3", action: "두피와 모발 반응, 건조 상태를 확인합니다.", complete: false },
        { offset: "D+7", action: "첫 주 손질 난이도와 형태 유지 상태를 확인합니다.", complete: false },
        { offset: "D+30", action: "뿌리 볼륨과 색·질감 변화를 점검합니다.", complete: false },
        { offset: "D+45", action: "보정이 필요한 부분과 다음 관리 시점을 확인합니다.", complete: false },
        { offset: "D+90", action: "다음 시술 또는 커트 계획을 정리합니다.", complete: false },
      ],
      concerns: [],
      satisfaction: null,
    });
    return { state: "synced" as const };
  } catch (error) {
    await recordV2Event({
      userId: input.userId,
      consultationId: input.consultationId,
      eventType: "aftercare.dual_write_failed",
      payload: {
        hairRecordId: input.hairRecordId,
        errorCode: error instanceof Error ? error.name : "unknown",
      },
    });
    return { state: "failed" as const };
  }
}
