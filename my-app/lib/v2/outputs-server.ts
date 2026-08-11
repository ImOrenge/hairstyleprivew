import "server-only";

import type {
  AftercareProgramV2,
  FashionPreviewCandidateV2,
  FashionPreviewSetV2,
  SalonBriefV2,
  StyleSelectionSnapshotV2,
} from "@hairfit/shared/v2";
import type { FashionCategory, FashionDirectionSnapshot, FashionLookItem } from "@hairfit/shared";
import { randomUUID } from "node:crypto";
import { runAftercareCapability } from "../capabilities/aftercare-service";
import type { ServiceType } from "../hair-care-generator";
import { getSupabaseAdminClient } from "../supabase";
import {
  STYLING_RESULTS_BUCKET,
  createSignedUrl,
  type ServerSupabaseLike,
} from "../style-profile-server";
import { HairfitV2Error } from "./errors";
import { loadConfirmedV2StylingSource } from "./styling-source-server";

type ConfirmedSelection = {
  id: string;
  snapshot: StyleSelectionSnapshotV2;
};

const DEFAULT_FASHION_DIRECTION: FashionDirectionSnapshot = {
  situation: "daily",
  genre: "casual",
  season: "all-season",
  fit: "regular",
  exposure: "balanced",
  budget: "",
  avoidItems: [],
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function fashionCategory(value: unknown, slotId: string): FashionCategory {
  if (value === "DAILY" || value === "WORK" || value === "STATEMENT") return value;
  if (slotId.startsWith("work-")) return "WORK";
  if (slotId.startsWith("statement-")) return "STATEMENT";
  return "DAILY";
}

function fashionDirection(value: unknown, genre: string): FashionDirectionSnapshot {
  const direction = record(value);
  return {
    situation: ["daily", "work", "date", "formal"].includes(String(direction.situation))
      ? direction.situation as FashionDirectionSnapshot["situation"]
      : DEFAULT_FASHION_DIRECTION.situation,
    genre: typeof direction.genre === "string" ? direction.genre : genre,
    season: ["spring", "summer", "autumn", "winter", "all-season"].includes(String(direction.season))
      ? direction.season as FashionDirectionSnapshot["season"]
      : DEFAULT_FASHION_DIRECTION.season,
    fit: ["slim", "regular", "relaxed", "oversized"].includes(String(direction.fit))
      ? direction.fit as FashionDirectionSnapshot["fit"]
      : DEFAULT_FASHION_DIRECTION.fit,
    exposure: ["low", "balanced", "bold"].includes(String(direction.exposure))
      ? direction.exposure as FashionDirectionSnapshot["exposure"]
      : DEFAULT_FASHION_DIRECTION.exposure,
    budget: typeof direction.budget === "string" ? direction.budget : "",
    avoidItems: stringArray(direction.avoidItems),
  };
}

function fashionItems(value: unknown): FashionLookItem[] {
  return Array.isArray(value) ? value.map(record).map((item) => ({
    slot: typeof item.slot === "string" ? item.slot : "item",
    name: typeof item.name === "string" ? item.name : "추천 아이템",
    color: typeof item.color === "string" ? item.color : "",
    fit: typeof item.fit === "string" ? item.fit : "",
    material: typeof item.material === "string" ? item.material : "",
  })) : [];
}

function validateIdempotencyKey(value: string) {
  if (value.trim().length < 8 || value.length > 160) {
    throw new HairfitV2Error("INVALID_IDEMPOTENCY_KEY", 400, "idempotency key 형식이 올바르지 않습니다.");
  }
}

const AFTERCARE_OFFSETS = ["D+3", "W+2", "W+6", "W+10"] as const;

function aftercareServiceType(services: string[]): ServiceType {
  const joined = services.join(" ").toLowerCase();
  if (joined.includes("탈색") || joined.includes("bleach")) return "bleach";
  if (joined.includes("펌") || joined.includes("perm")) return "perm";
  if (joined.includes("염색") || joined.includes("color")) return "color";
  if (joined.includes("클리닉") || joined.includes("트리트먼트") || joined.includes("treatment")) return "treatment";
  if (joined.includes("커트") || joined.includes("cut")) return "cut";
  return "other";
}

function generatedAftercareProgramInput(guide: Awaited<ReturnType<typeof runAftercareCapability>>["output"]) {
  if (!guide) throw new HairfitV2Error("AFTERCARE_PROGRAM_GENERATION_FAILED", 503, "관리 프로그램을 준비하지 못했습니다.");
  const actions = [
    guide.sections.dry.steps,
    guide.sections.treatment.steps,
    guide.sections.styling.steps,
    guide.recommendedNextActions,
  ];
  return {
    today: guide.sections.dry.steps.slice(0, 4),
    checkpoints: AFTERCARE_OFFSETS.map((offset, index) => ({
      offset,
      action: (actions[index].join(" ") || guide.overview.summary).slice(0, 500),
      complete: false,
    })),
    concerns: guide.warnings.slice(0, 10),
    satisfaction: null,
  };
}

function normalizeAftercareProgramInput(input: {
  today: unknown;
  checkpoints: unknown;
  concerns: unknown;
  satisfaction: unknown;
}) {
  const today = [...new Set(stringArray(input.today).map((item) => item.trim()).filter(Boolean))].slice(0, 20);
  const concerns = [...new Set(stringArray(input.concerns).map((item) => item.trim()).filter(Boolean))].slice(0, 20);
  const checkpointRows = Array.isArray(input.checkpoints) ? input.checkpoints.map(record) : [];
  const checkpoints = AFTERCARE_OFFSETS.map((offset) => {
    const checkpoint = checkpointRows.find((item) => item.offset === offset);
    return {
      offset,
      action: typeof checkpoint?.action === "string" && checkpoint.action.trim()
        ? checkpoint.action.trim().slice(0, 500)
        : "상태를 확인하고 필요한 관리만 기록해 주세요.",
      complete: checkpoint?.complete === true,
    };
  });
  const satisfaction = input.satisfaction === null || input.satisfaction === undefined
    ? null
    : Number(input.satisfaction);
  if (!today.length
    || today.some((item) => item.length > 500)
    || concerns.some((item) => item.length > 500)
    || (satisfaction !== null && (!Number.isInteger(satisfaction) || satisfaction < 1 || satisfaction > 5))) {
    throw new HairfitV2Error("AFTERCARE_PROGRAM_INVALID", 400, "오늘 관리, 걱정 기록, 만족도를 확인해 주세요.");
  }
  return { today, checkpoints, concerns, satisfaction };
}

function normalizeStoredAftercareProgram(value: unknown): AftercareProgramV2 {
  const stored = record(value);
  const storedToday = stringArray(stored.today);
  const normalized = normalizeAftercareProgramInput({
    today: storedToday.length ? storedToday : ["디자이너가 안내한 세정·열기구 제한을 우선 적용합니다."],
    checkpoints: stored.checkpoints,
    concerns: stored.concerns,
    satisfaction: stored.satisfaction,
  });
  const version = Number(stored.version);
  return {
    schemaVersion: "aftercare-program-v2",
    consultationId: typeof stored.consultationId === "string" ? stored.consultationId : "",
    selectionSnapshotId: typeof stored.selectionSnapshotId === "string" ? stored.selectionSnapshotId : "",
    actualServiceId: typeof stored.actualServiceId === "string" ? stored.actualServiceId : "",
    version: Number.isInteger(version) && version > 0 ? version : 1,
    ...normalized,
    createdAt: typeof stored.createdAt === "string" ? stored.createdAt : new Date(0).toISOString(),
  };
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
  brief?: unknown;
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
  const stylingSource = await loadConfirmedV2StylingSource({ userId: input.userId, consultationId: input.consultationId });
  const generatedBrief = stylingSource.selectedVariant.designerBrief;
  const version = await nextVersion("salon_brief_versions_v2", "consultation_id", input.consultationId);
  const style = selection.snapshot.style;
  const requested = record(input.brief);
  const audience = requested.audience === "designer" ? "designer" : "customer";
  const summary = typeof requested.summary === "string" ? requested.summary.trim().slice(0, 2000) : "";
  const requestedCut = record(requested.cut);
  const requestedVolumeTexture = record(requested.volumeTexture);
  const requestedColor = requested.color === null ? null : record(requested.color);
  const requestedStyling = stringArray(requested.styling).map((item) => item.trim()).filter(Boolean).slice(0, 20);
  const requestedCautions = stringArray(requested.cautions).map((item) => item.trim()).filter(Boolean).slice(0, 20);
  if (input.brief && (!summary || !Object.keys(requestedCut).length || !Object.keys(requestedVolumeTexture).length || !requestedStyling.length)) {
    throw new HairfitV2Error("SALON_BRIEF_INVALID", 400, "상담 요약, 커트, 볼륨·질감, 스타일링 지시를 확인해 주세요.");
  }
  const brief: SalonBriefV2 = {
    schemaVersion: "salon-brief-v2",
    consultationId: input.consultationId,
    selectionSnapshotId: selection.id,
    version,
    audience,
    summary: summary || generatedBrief?.consultationSummary || `${style.name}: ${style.recommendationReason}`,
    cut: Object.keys(requestedCut).length ? requestedCut : generatedBrief ? { direction: generatedBrief.cutDirection } : style.design,
    volumeTexture: Object.keys(requestedVolumeTexture).length ? requestedVolumeTexture : {
      ...(generatedBrief ? { direction: generatedBrief.volumeTextureDirection } : {}),
      strategyBucket: style.strategyBucket,
      implementationFeasibility: style.implementationFeasibility,
    },
    color: input.brief ? requestedColor : style.color,
    styling: requestedStyling.length ? requestedStyling : generatedBrief ? [generatedBrief.stylingDirection] : ["선택 이미지와 현재 모발 차이를 디자이너와 먼저 확인합니다."],
    cautions: requestedCautions.length ? requestedCautions : generatedBrief?.cautionNotes?.length ? generatedBrief.cautionNotes : ["신원 보존 프리뷰는 시술 결과 보장이 아니며 모질·손상도에 따라 조정해야 합니다."],
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
  if (insert.error?.code === "23505") {
    const racedBrief = await db.from("salon_brief_versions_v2").select("brief")
      .eq("user_id", input.userId).eq("idempotency_key", input.idempotencyKey).single();
    if (racedBrief.error || !(racedBrief.data as { brief?: unknown } | null)?.brief) {
      throw new Error(racedBrief.error?.message || insert.error.message);
    }
    await transitionOutputState(input.userId, input.consultationId, "salon_brief_ready");
    return (racedBrief.data as unknown as { brief: SalonBriefV2 }).brief;
  }
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
  today: unknown;
  checkpoints: unknown;
  concerns: unknown;
  satisfaction: unknown;
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
  if (replay.data) return normalizeStoredAftercareProgram((replay.data as unknown as { program: unknown }).program);
  const selection = await confirmedSelection(input.userId, input.consultationId);
  const serviceIdempotencyKey = `${input.idempotencyKey}:service`;
  const existingActual = await db.from("actual_services_v2").select("id")
    .eq("user_id", input.userId).eq("idempotency_key", serviceIdempotencyKey).maybeSingle();
  if (existingActual.error) throw new Error(existingActual.error.message);
  let actualServiceId = typeof (existingActual.data as { id?: unknown } | null)?.id === "string"
    ? String((existingActual.data as { id: string }).id)
    : randomUUID();
  if (!existingActual.data) {
    const actual = await db.from("actual_services_v2").insert({
      id: actualServiceId,
      consultation_id: input.consultationId,
      selection_snapshot_id: selection.id,
      user_id: input.userId,
      idempotency_key: serviceIdempotencyKey,
      services,
      service_date: input.serviceDate,
      designer_notes: (input.designerNotes ?? "").trim().slice(0, 2000),
    });
    if (actual.error?.code === "23505") {
      const racedActual = await db.from("actual_services_v2").select("id")
        .eq("user_id", input.userId).eq("idempotency_key", serviceIdempotencyKey).single();
      if (racedActual.error || typeof (racedActual.data as { id?: unknown } | null)?.id !== "string") {
        throw new Error(racedActual.error?.message || actual.error.message);
      }
      actualServiceId = String((racedActual.data as { id: string }).id);
    } else if (actual.error) {
      throw new Error(actual.error.message);
    }
  }
  const stylingSource = await loadConfirmedV2StylingSource({ userId: input.userId, consultationId: input.consultationId });
  const guideCapability = await runAftercareCapability({
    userId: input.userId,
    consultationId: input.consultationId,
    idempotencyKey: `${actualServiceId}:aftercare-guide`,
    aftercareInput: {
      styleName: selection.snapshot.style.name,
      serviceType: aftercareServiceType(services),
      serviceDate: input.serviceDate,
      analysis: stylingSource.recommendationSet.analysis,
      designerBrief: stylingSource.selectedVariant.designerBrief,
    },
  });
  if (guideCapability.state !== "completed" || !guideCapability.output) {
    throw new HairfitV2Error("AFTERCARE_PROGRAM_GENERATION_PENDING", 503, guideCapability.failure?.message || "관리 프로그램을 준비하고 있습니다. 실제 시술 기록은 유지됩니다.");
  }
  const suppliedToday = stringArray(input.today).map((item) => item.trim()).filter(Boolean);
  const care = normalizeAftercareProgramInput(suppliedToday.length ? input : generatedAftercareProgramInput(guideCapability.output));
  const version = await nextVersion("aftercare_programs_v2", "actual_service_id", actualServiceId);
  const program: AftercareProgramV2 = {
    schemaVersion: "aftercare-program-v2",
    consultationId: input.consultationId,
    selectionSnapshotId: selection.id,
    actualServiceId,
    version,
    ...care,
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
  if (aftercare.error?.code === "23505") {
    const racedProgram = await db.from("aftercare_programs_v2").select("program")
      .eq("user_id", input.userId).eq("idempotency_key", input.idempotencyKey).single();
    if (racedProgram.error || !(racedProgram.data as { program?: unknown } | null)?.program) {
      throw new Error(racedProgram.error?.message || aftercare.error.message);
    }
    await transitionOutputState(input.userId, input.consultationId, "aftercare_ready");
    return normalizeStoredAftercareProgram((racedProgram.data as { program: unknown }).program);
  }
  if (aftercare.error) {
    throw new Error(aftercare.error.message);
  }
  await transitionOutputState(input.userId, input.consultationId, "aftercare_ready");
  return program;
}

export async function getLatestAftercareStateV2(userId: string, consultationId: string) {
  const db = getSupabaseAdminClient();
  const latest = await db
    .from("aftercare_programs_v2")
    .select("program,actual_service_id")
    .eq("consultation_id", consultationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw new Error(latest.error.message);
  if (!latest.data) return { program: null, actualService: null };
  const row = latest.data as unknown as { program: AftercareProgramV2; actual_service_id: string };
  const actual = await db
    .from("actual_services_v2")
    .select("id,services,service_date,designer_notes,confirmed_at")
    .eq("id", row.actual_service_id)
    .eq("consultation_id", consultationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (actual.error) throw new Error(actual.error.message);
  const actualRow = actual.data as unknown as {
    id: string;
    services: unknown;
    service_date: string;
    designer_notes: string;
    confirmed_at: string;
  } | null;
  return {
    program: normalizeStoredAftercareProgram(row.program),
    actualService: actualRow ? {
      id: actualRow.id,
      services: stringArray(actualRow.services),
      serviceDate: actualRow.service_date,
      designerNotes: actualRow.designer_notes,
      confirmedAt: actualRow.confirmed_at,
    } : null,
  };
}

export async function updateAftercareProgramV2(input: {
  userId: string;
  consultationId: string;
  actualServiceId: string;
  expectedVersion: number;
  idempotencyKey: string;
  today: unknown;
  checkpoints: unknown;
  concerns: unknown;
  satisfaction: unknown;
}) {
  validateIdempotencyKey(input.idempotencyKey);
  if (!input.actualServiceId || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new HairfitV2Error("AFTERCARE_PROGRAM_INVALID", 400, "수정할 실제 시술 관리 기록을 확인해 주세요.");
  }
  const care = normalizeAftercareProgramInput(input);
  const db = getSupabaseAdminClient();
  const replay = await db
    .from("aftercare_programs_v2")
    .select("program")
    .eq("user_id", input.userId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (replay.error) throw new Error(replay.error.message);
  if (replay.data) return normalizeStoredAftercareProgram((replay.data as unknown as { program: unknown }).program);
  const actual = await db
    .from("actual_services_v2")
    .select("id,selection_snapshot_id")
    .eq("id", input.actualServiceId)
    .eq("consultation_id", input.consultationId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (actual.error) throw new Error(actual.error.message);
  if (!actual.data) throw new HairfitV2Error("ACTUAL_SERVICE_NOT_FOUND", 404, "실제 시술 기록을 찾을 수 없습니다.");
  const latest = await db
    .from("aftercare_programs_v2")
    .select("version")
    .eq("actual_service_id", input.actualServiceId)
    .eq("user_id", input.userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw new Error(latest.error.message);
  const currentVersion = Number((latest.data as { version?: number } | null)?.version ?? 0);
  if (currentVersion !== input.expectedVersion) {
    throw new HairfitV2Error("AFTERCARE_VERSION_CONFLICT", 409, "관리 기록이 다른 화면에서 변경되었습니다. 다시 불러와 주세요.");
  }
  const version = currentVersion + 1;
  const program: AftercareProgramV2 = {
    schemaVersion: "aftercare-program-v2",
    consultationId: input.consultationId,
    selectionSnapshotId: String((actual.data as unknown as { selection_snapshot_id: string }).selection_snapshot_id),
    actualServiceId: input.actualServiceId,
    version,
    ...care,
    createdAt: new Date().toISOString(),
  };
  const insert = await db.from("aftercare_programs_v2").insert({
    id: randomUUID(),
    consultation_id: input.consultationId,
    selection_snapshot_id: program.selectionSnapshotId,
    actual_service_id: input.actualServiceId,
    user_id: input.userId,
    idempotency_key: input.idempotencyKey,
    version,
    program,
  });
  if (insert.error?.code === "23505") {
    throw new HairfitV2Error("AFTERCARE_VERSION_CONFLICT", 409, "관리 기록이 다른 화면에서 변경되었습니다. 다시 불러와 주세요.");
  }
  if (insert.error) throw new Error(insert.error.message);
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
    .select("id,selection_snapshot_id,status,generated_image_path,genre,recommendation,fashion_slot_id,fashion_direction")
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
    genre: string;
    recommendation: Record<string, unknown>;
    fashion_slot_id: string | null;
    fashion_direction: Record<string, unknown>;
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
  const selectedSession = completedSessions.find((session) => session.id === input.selectedStylingSessionId);
  if (!selectedSession?.fashion_slot_id) {
    throw new HairfitV2Error("FASHION_SELECTION_INVALID", 400, "9개 패션 보드의 완료된 룩만 선택해 주세요.");
  }
  const selectedRecommendation = record(selectedSession.recommendation);
  const selectedCategory = fashionCategory(selectedRecommendation.consultationCategory, selectedSession.fashion_slot_id);
  const selectedDirection = fashionDirection(selectedSession.fashion_direction, selectedSession.genre);
  const previewSet: FashionPreviewSetV2 = {
    schemaVersion: "fashion-preview-set-v2",
    consultationId: input.consultationId,
    selectionSnapshotId: selection.id,
    personalColorEvidenceId: input.personalColorEvidenceId ?? null,
    selectedHairSnapshotId: selection.id,
    stylingSessionIds,
    selectedStylingSessionId: input.selectedStylingSessionId,
    directionSnapshot: selectedDirection,
    selectedLook: {
      slotId: selectedSession.fashion_slot_id,
      category: selectedCategory,
      genre: selectedSession.genre,
      label: typeof selectedRecommendation.headline === "string" ? selectedRecommendation.headline : "선택한 패션 룩",
      items: fashionItems(selectedRecommendation.items),
      palette: stringArray(selectedRecommendation.palette),
      neckline: typeof selectedRecommendation.neckline === "string" ? selectedRecommendation.neckline : "",
      silhouette: typeof selectedRecommendation.silhouette === "string" ? selectedRecommendation.silhouette : "",
      shoppingKeywords: stringArray(selectedRecommendation.shoppingKeywords),
    },
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
      .select("id,selection_snapshot_id,genre,recommendation,status,generated_image_path,error_message,created_at,updated_at,fashion_slot_id,fashion_direction")
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
      const genre = typeof session.genre === "string" ? session.genre : "unknown";
      const slotId = typeof session.fashion_slot_id === "string"
        ? session.fashion_slot_id
        : typeof recommendation.consultationSlotId === "string" ? recommendation.consultationSlotId : "legacy";
      return {
        stylingSessionId: String(session.id),
        selectionSnapshotId: String(session.selection_snapshot_id),
        slotId,
        category: fashionCategory(recommendation.consultationCategory, slotId),
        genre,
        direction: fashionDirection(session.fashion_direction ?? recommendation.consultationDirection, genre),
        status: typeof session.status === "string" ? session.status : "unknown",
        headline: typeof recommendation.headline === "string" ? recommendation.headline : "패션 프리뷰",
        summary: typeof recommendation.summary === "string" ? recommendation.summary : "",
        palette: stringArray(recommendation.palette),
        silhouette: typeof recommendation.silhouette === "string" ? recommendation.silhouette : "",
        neckline: typeof recommendation.neckline === "string" ? recommendation.neckline : "",
        items: fashionItems(recommendation.items),
        shoppingKeywords: stringArray(recommendation.shoppingKeywords),
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
