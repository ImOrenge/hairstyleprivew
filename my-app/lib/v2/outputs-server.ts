import "server-only";

import type {
  AftercareProgramV2,
  FashionPreviewCandidateV2,
  FashionPreviewSetV2,
  SalonBriefV2,
  StyleSelectionSnapshotV2,
} from "@hairfit/shared/v2";
import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "../supabase";
import {
  STYLING_RESULTS_BUCKET,
  createSignedUrl,
  type ServerSupabaseLike,
} from "../style-profile-server";
import { HairfitV2Error } from "./errors";

type ConfirmedSelection = {
  id: string;
  snapshot: StyleSelectionSnapshotV2;
};

function validateIdempotencyKey(value: string) {
  if (value.trim().length < 8 || value.length > 160) {
    throw new HairfitV2Error("INVALID_IDEMPOTENCY_KEY", 400, "idempotency key 형식이 올바르지 않습니다.");
  }
}

async function confirmedSelection(userId: string, consultationId: string): Promise<ConfirmedSelection> {
  const { data, error } = await getSupabaseAdminClient()
    .from("style_selection_snapshots_v2")
    .select("id,snapshot")
    .eq("consultation_id", consultationId)
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new HairfitV2Error("SELECTION_NOT_CONFIRMED", 409, "스타일 확정 후에 이용할 수 있습니다.");
  }
  return data as unknown as ConfirmedSelection;
}

async function nextVersion(table: string, column: string, value: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from(table)
    .select("version")
    .eq(column, value)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Number((data as { version?: number } | null)?.version ?? 0) + 1;
}

async function transitionOutputState(
  userId: string,
  consultationId: string,
  nextState: "salon_brief_ready" | "aftercare_ready" | "fashion_ready",
) {
  const db = getSupabaseAdminClient();
  const session = await db
    .from("consultation_sessions")
    .select("version,lifecycle_state")
    .eq("id", consultationId)
    .eq("user_id", userId)
    .single();
  if (session.error) throw new Error(session.error.message);
  const row = session.data as unknown as { version: number; lifecycle_state: string };
  if (row.lifecycle_state === nextState) return;
  const result = await db.rpc("transition_consultation_v2", {
    p_user_id: userId,
    p_consultation_id: consultationId,
    p_expected_version: row.version,
    p_next_state: nextState,
  });
  if (result.error) throw new HairfitV2Error("OUTPUT_STATE_TRANSITION_FAILED", 409, "상담 결과 상태가 변경되어 저장하지 못했습니다.");
}

export async function createSalonBriefV2(input: {
  userId: string;
  consultationId: string;
  idempotencyKey: string;
}) {
  validateIdempotencyKey(input.idempotencyKey);
  const db = getSupabaseAdminClient();
  const replay = await db
    .from("salon_brief_versions_v2")
    .select("brief")
    .eq("user_id", input.userId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (replay.error) throw new Error(replay.error.message);
  if (replay.data) return (replay.data as unknown as { brief: SalonBriefV2 }).brief;
  const selection = await confirmedSelection(input.userId, input.consultationId);
  const version = await nextVersion("salon_brief_versions_v2", "consultation_id", input.consultationId);
  const style = selection.snapshot.style;
  const brief: SalonBriefV2 = {
    schemaVersion: "salon-brief-v2",
    consultationId: input.consultationId,
    selectionSnapshotId: selection.id,
    version,
    summary: `${style.name}: ${style.recommendationReason}`,
    cut: style.design,
    volumeTexture: {
      strategyBucket: style.strategyBucket,
      implementationFeasibility: style.implementationFeasibility,
    },
    color: style.color,
    styling: ["선택 이미지와 현재 모발 차이를 디자이너와 먼저 확인합니다."],
    cautions: ["신원 보존 프리뷰는 시술 결과 보장이 아니며 모질·손상도에 따라 조정해야 합니다."],
    createdAt: new Date().toISOString(),
  };
  const insert = await db.from("salon_brief_versions_v2").insert({
    id: randomUUID(),
    consultation_id: input.consultationId,
    selection_snapshot_id: selection.id,
    user_id: input.userId,
    idempotency_key: input.idempotencyKey,
    version,
    brief,
  });
  if (insert.error) throw new Error(insert.error.message);
  await transitionOutputState(input.userId, input.consultationId, "salon_brief_ready");
  return brief;
}

export async function recordActualServiceAndAftercareV2(input: {
  userId: string;
  consultationId: string;
  idempotencyKey: string;
  services: string[];
  serviceDate: string;
  designerNotes?: string;
}) {
  validateIdempotencyKey(input.idempotencyKey);
  const services = [...new Set(input.services.map((item) => item.trim()).filter(Boolean))].slice(0, 20);
  if (!services.length || !/^\d{4}-\d{2}-\d{2}$/.test(input.serviceDate)) {
    throw new HairfitV2Error("ACTUAL_SERVICE_INVALID", 400, "실제 시술 내용과 날짜를 확인해 주세요.");
  }
  const db = getSupabaseAdminClient();
  const replay = await db
    .from("aftercare_programs_v2")
    .select("program")
    .eq("user_id", input.userId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (replay.error) throw new Error(replay.error.message);
  if (replay.data) return (replay.data as unknown as { program: AftercareProgramV2 }).program;
  const selection = await confirmedSelection(input.userId, input.consultationId);
  const actualServiceId = randomUUID();
  const actual = await db.from("actual_services_v2").insert({
    id: actualServiceId,
    consultation_id: input.consultationId,
    selection_snapshot_id: selection.id,
    user_id: input.userId,
    idempotency_key: `${input.idempotencyKey}:service`,
    services,
    service_date: input.serviceDate,
    designer_notes: (input.designerNotes ?? "").trim().slice(0, 2000),
  });
  if (actual.error) throw new Error(actual.error.message);
  const version = await nextVersion("aftercare_programs_v2", "actual_service_id", actualServiceId);
  const program: AftercareProgramV2 = {
    schemaVersion: "aftercare-program-v2",
    consultationId: input.consultationId,
    selectionSnapshotId: selection.id,
    actualServiceId,
    version,
    today: ["디자이너가 안내한 세정·열기구 제한을 우선 적용합니다."],
    checkpoints: [
      { offset: "D+3", action: "두피와 모발 반응을 확인합니다." },
      { offset: "W+2", action: "형태 유지와 손질 난이도를 확인합니다." },
      { offset: "W+6", action: "볼륨·컬·색 빠짐을 확인합니다." },
      { offset: "W+10", action: "다음 시술 또는 커트 주기를 결정합니다." },
    ],
    createdAt: new Date().toISOString(),
  };
  const aftercare = await db.from("aftercare_programs_v2").insert({
    id: randomUUID(),
    consultation_id: input.consultationId,
    selection_snapshot_id: selection.id,
    actual_service_id: actualServiceId,
    user_id: input.userId,
    idempotency_key: input.idempotencyKey,
    version,
    program,
  });
  if (aftercare.error) {
    await db.from("actual_services_v2").delete().eq("id", actualServiceId).eq("user_id", input.userId);
    throw new Error(aftercare.error.message);
  }
  await transitionOutputState(input.userId, input.consultationId, "aftercare_ready");
  return program;
}

export async function createFashionPreviewSetV2(input: {
  userId: string;
  consultationId: string;
  idempotencyKey: string;
  stylingSessionIds: string[];
  selectedStylingSessionId: string;
  personalColorEvidenceId?: string | null;
}) {
  validateIdempotencyKey(input.idempotencyKey);
  const stylingSessionIds = [...new Set(input.stylingSessionIds.map((item) => item.trim()).filter(Boolean))];
  if (stylingSessionIds.length < 2 || stylingSessionIds.length > 3) {
    throw new HairfitV2Error("FASHION_SHORTLIST_SIZE_INVALID", 400, "완료된 패션 프리뷰를 2~3개 선택해 주세요.");
  }
  if (!stylingSessionIds.includes(input.selectedStylingSessionId)) {
    throw new HairfitV2Error("FASHION_SELECTION_INVALID", 400, "최종 룩은 shortlist 안에서 선택해 주세요.");
  }
  const db = getSupabaseAdminClient();
  const replay = await db
    .from("fashion_preview_sets_v2")
    .select("preview_set")
    .eq("user_id", input.userId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (replay.error) throw new Error(replay.error.message);
  if (replay.data) return (replay.data as unknown as { preview_set: FashionPreviewSetV2 }).preview_set;
  const selection = await confirmedSelection(input.userId, input.consultationId);
  const sessions = await db
    .from("styling_sessions")
    .select("id,selection_snapshot_id,status,generated_image_path")
    .in("id", stylingSessionIds)
    .eq("user_id", input.userId)
    .eq("consultation_id", input.consultationId)
    .eq("selection_snapshot_id", selection.id)
    .eq("source_mode", "v2_selection")
    .eq("status", "completed");
  if (sessions.error) throw new Error(sessions.error.message);
  const completedSessions = (sessions.data ?? []) as unknown as Array<{
    id: string;
    selection_snapshot_id: string;
    status: string;
    generated_image_path: string | null;
  }>;
  if (
    completedSessions.length !== stylingSessionIds.length
    || completedSessions.some((session) => !session.generated_image_path)
  ) {
    throw new HairfitV2Error(
      "FASHION_PREVIEW_NOT_COMPLETED",
      409,
      "현재 확정 헤어를 사용해 생성이 완료된 패션 프리뷰만 선택할 수 있습니다.",
    );
  }
  if (input.personalColorEvidenceId) {
    const color = await db
      .from("personal_color_evidence_v2")
      .select("id")
      .eq("id", input.personalColorEvidenceId)
      .eq("consultation_id", input.consultationId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (color.error) throw new Error(color.error.message);
    if (!color.data) throw new HairfitV2Error("PERSONAL_COLOR_EVIDENCE_INVALID", 400, "퍼스널컬러 근거가 상담과 일치하지 않습니다.");
  }
  const version = await nextVersion("fashion_preview_sets_v2", "consultation_id", input.consultationId);
  const previewSet: FashionPreviewSetV2 = {
    schemaVersion: "fashion-preview-set-v2",
    consultationId: input.consultationId,
    selectionSnapshotId: selection.id,
    personalColorEvidenceId: input.personalColorEvidenceId ?? null,
    selectedHairSnapshotId: selection.id,
    stylingSessionIds,
    selectedStylingSessionId: input.selectedStylingSessionId,
    version,
    createdAt: new Date().toISOString(),
  };
  const inserted = await db.from("fashion_preview_sets_v2").insert({
    id: randomUUID(),
    consultation_id: input.consultationId,
    selection_snapshot_id: selection.id,
    personal_color_evidence_id: input.personalColorEvidenceId ?? null,
    user_id: input.userId,
    idempotency_key: input.idempotencyKey,
    version,
    preview_set: previewSet,
  });
  if (inserted.error) throw new Error(inserted.error.message);
  await transitionOutputState(input.userId, input.consultationId, "fashion_ready");
  return previewSet;
}

export async function getFashionPreviewStateV2(userId: string, consultationId: string) {
  const db = getSupabaseAdminClient();
  const selection = await confirmedSelection(userId, consultationId);
  const [sessions, latestSet] = await Promise.all([
    db
      .from("styling_sessions")
      .select("id,selection_snapshot_id,genre,recommendation,status,generated_image_path,error_message,created_at,updated_at")
      .eq("user_id", userId)
      .eq("consultation_id", consultationId)
      .eq("selection_snapshot_id", selection.id)
      .eq("source_mode", "v2_selection")
      .order("created_at", { ascending: false }),
    db
      .from("fashion_preview_sets_v2")
      .select("preview_set")
      .eq("user_id", userId)
      .eq("consultation_id", consultationId)
      .eq("selection_snapshot_id", selection.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (sessions.error) throw new Error(sessions.error.message);
  if (latestSet.error) throw new Error(latestSet.error.message);

  const signingClient = db as unknown as ServerSupabaseLike;
  const previews: FashionPreviewCandidateV2[] = await Promise.all(
    ((sessions.data ?? []) as unknown as Array<Record<string, unknown>>).map(async (session) => {
      const recommendation = session.recommendation && typeof session.recommendation === "object"
        ? session.recommendation as Record<string, unknown>
        : {};
      const imagePath = typeof session.generated_image_path === "string" ? session.generated_image_path : null;
      return {
        stylingSessionId: String(session.id),
        selectionSnapshotId: String(session.selection_snapshot_id),
        genre: typeof session.genre === "string" ? session.genre : "unknown",
        status: typeof session.status === "string" ? session.status : "unknown",
        headline: typeof recommendation.headline === "string" ? recommendation.headline : "패션 프리뷰",
        summary: typeof recommendation.summary === "string" ? recommendation.summary : "",
        imageUrl: await createSignedUrl(signingClient, STYLING_RESULTS_BUCKET, imagePath),
        errorMessage: typeof session.error_message === "string" ? session.error_message : null,
        createdAt: typeof session.created_at === "string" ? session.created_at : new Date().toISOString(),
        updatedAt: typeof session.updated_at === "string" ? session.updated_at : null,
      };
    }),
  );

  return {
    previews,
    previewSet: latestSet.data
      ? (latestSet.data as unknown as { preview_set: FashionPreviewSetV2 }).preview_set
      : null,
  };
}
