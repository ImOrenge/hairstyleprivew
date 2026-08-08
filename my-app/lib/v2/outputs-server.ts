import "server-only";

import type {
  AftercareProgramV2,
  FashionPreviewSetV2,
  SalonBriefV2,
  StyleSelectionSnapshotV2,
} from "@hairfit/shared/v2";
import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "../supabase";
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
  previewIds: string[];
  personalColorEvidenceId?: string | null;
}) {
  validateIdempotencyKey(input.idempotencyKey);
  const previewIds = [...new Set(input.previewIds.map((item) => item.trim()).filter(Boolean))].slice(0, 20);
  if (!previewIds.length) {
    throw new HairfitV2Error("FASHION_PREVIEW_EMPTY", 400, "연결할 패션 프리뷰가 없습니다.");
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
    previewIds,
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
