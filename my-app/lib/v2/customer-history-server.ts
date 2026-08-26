import "server-only";

import type { CustomerStylebookHairEntryV2, CustomerStylebookV2 } from "@hairfit/shared";
import type { AftercareProgramV2, StyleSelectionSnapshotV2 } from "@hairfit/shared/v2";
import {
  createSignedUrl,
  STYLING_RESULTS_BUCKET,
  type ServerSupabaseLike,
} from "../style-profile-server";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../supabase";
import {
  parseCustomerFashionPreviewSetRowV2,
  type FashionPreviewSetRowV2,
  type ParsedCustomerFashionSelectionV2,
} from "./customer-stylebook-parser";
import { attachCustomerStylebookMetadataV2, emptyCustomerStylebookCollectionV2 } from "./customer-stylebook-metadata-server";

export type CustomerStyleRecordV2 = CustomerStylebookHairEntryV2;

export interface CustomerAftercareCheckpointV2 {
  offset: AftercareProgramV2["checkpoints"][number]["offset"];
  action: string;
  complete: boolean;
}

export interface CustomerAftercareProgramV2 {
  version: number;
  today: string[];
  checkpoints: CustomerAftercareCheckpointV2[];
  concerns: string[];
  satisfaction: number | null;
  createdAt: string;
}

export interface CustomerAftercareCheckinV2 {
  id: string;
  slot: number;
  offsetDays: number;
  scheduledFor: string;
  state: "draft" | "preparing" | "ready" | "failed";
  concern: string;
  satisfaction: number | null;
  responseTitle: string | null;
  responseSummary: string | null;
  failureMessage: string | null;
}

export interface CustomerAftercareRecordV2 {
  actualServiceId: string;
  consultationId: string;
  selectionId: string;
  styleName: string;
  recommendationReason: string;
  imageUrl: string | null;
  services: string[];
  serviceDate: string;
  designerNotes: string;
  confirmedAt: string;
  program: CustomerAftercareProgramV2 | null;
  checkins: CustomerAftercareCheckinV2[];
}

type SelectionRow = {
  id: string;
  consultation_id: string;
  preview_variant_id: string;
  snapshot: unknown;
  confirmed_at: string | null;
};

type ActualServiceRow = {
  id: string;
  consultation_id: string;
  selection_snapshot_id: string;
  services: unknown;
  service_date: string;
  designer_notes: string;
  confirmed_at: string;
};

type ProgramRow = {
  actual_service_id: string;
  version: number;
  program: unknown;
  created_at: string;
};

type CheckinRow = {
  id: string;
  actual_service_id: string;
  slot: number;
  offset_days: number;
  scheduled_for: string;
  state: string;
  concern: string;
  satisfaction: number | null;
  response: unknown;
  failure_message: string | null;
};

type StylingSessionRow = {
  id: string;
  consultation_id: string | null;
  selection_snapshot_id: string | null;
  source_mode: string | null;
  status: string;
  generated_image_path: string | null;
};

type ParsedSelection = {
  selectionId: string;
  consultationId: string;
  previewVariantId: string;
  name: string;
  recommendationReason: string;
  imagePath: string | null;
  confirmedAt: string;
  strategyBucket: string;
  length: string;
  bang: string;
  texture: string;
  volume: string[];
  maintenanceLevel: string;
};

const CHECKPOINT_OFFSETS = new Set(["D+1", "D+3", "D+7", "D+30", "D+45", "D+90"]);
const CHECKIN_STATES = new Set(["draft", "preparing", "ready", "failed"]);

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => cleanString(item)).filter(Boolean)
    : [];
}

function toCustomerStyleRecord(
  selection: ParsedSelection,
  imageUrl: string | null,
): CustomerStyleRecordV2 {
  return {
    kind: "hair",
    id: selection.selectionId,
    consultationId: selection.consultationId,
    previewVariantId: selection.previewVariantId,
    title: selection.name,
    description: selection.recommendationReason,
    imageUrl,
    confirmedAt: selection.confirmedAt,
    strategyBucket: selection.strategyBucket,
    length: selection.length,
    bang: selection.bang,
    texture: selection.texture,
    volume: selection.volume,
    maintenanceLevel: selection.maintenanceLevel,
    state: {
      customTitle: null,
      note: "",
      tags: [],
      favorite: false,
      archivedAt: null,
      updatedAt: null,
    },
  };
}

export function parseCustomerSelectionRowV2(row: SelectionRow): ParsedSelection | null {
  const snapshot = objectOrNull(row.snapshot) as StyleSelectionSnapshotV2 | null;
  if (snapshot?.schemaVersion !== "style-selection-snapshot-v1") return null;
  const style = objectOrNull(snapshot?.style);
  const design = objectOrNull(style?.design);
  const preferences = objectOrNull(snapshot?.preferences);
  const maintenance = objectOrNull(preferences?.maintenance);
  const previewImage = objectOrNull(snapshot?.previewImage);
  const confirmedAt = cleanString(row.confirmed_at ?? snapshot?.confirmedAt);
  const name = cleanString(style?.name);
  if (!row.id || !row.consultation_id || !row.preview_variant_id || !confirmedAt || !name) return null;

  return {
    selectionId: row.id,
    consultationId: row.consultation_id,
    previewVariantId: row.preview_variant_id,
    name,
    recommendationReason: cleanString(style?.recommendationReason, "확정한 스타일 방향"),
    imagePath: cleanString(previewImage?.path) || null,
    confirmedAt,
    strategyBucket: cleanString(style?.strategyBucket, "personalized"),
    length: cleanString(design?.lengthBucket, "unknown"),
    bang: cleanString(design?.bangType, "unknown"),
    texture: cleanString(design?.texture, "unknown"),
    volume: stringArray(design?.volumeFocusTags),
    maintenanceLevel: cleanString(maintenance?.maintenanceLevel, "unknown"),
  };
}

export function parseCustomerAftercareProgramV2(row: ProgramRow): CustomerAftercareProgramV2 | null {
  const program = objectOrNull(row.program);
  if (!program || program.schemaVersion !== "aftercare-program-v2") return null;

  const checkpoints = Array.isArray(program.checkpoints)
    ? program.checkpoints.flatMap((value) => {
        const checkpoint = objectOrNull(value);
        const offset = cleanString(checkpoint?.offset);
        const action = cleanString(checkpoint?.action);
        if (!CHECKPOINT_OFFSETS.has(offset) || !action) return [];
        return [{
          offset: offset as CustomerAftercareCheckpointV2["offset"],
          action,
          complete: checkpoint?.complete === true,
        }];
      })
    : [];

  const version = Number(program.version ?? row.version);
  return {
    version: Number.isInteger(version) && version > 0 ? version : row.version,
    today: stringArray(program.today),
    checkpoints,
    concerns: stringArray(program.concerns),
    satisfaction: typeof program.satisfaction === "number" ? program.satisfaction : null,
    createdAt: cleanString(program.createdAt, row.created_at),
  };
}

export function parseCustomerAftercareCheckinV2(row: CheckinRow): CustomerAftercareCheckinV2 | null {
  if (!CHECKIN_STATES.has(row.state) || !row.id || !row.scheduled_for) return null;
  const response = objectOrNull(row.response);
  return {
    id: row.id,
    slot: row.slot,
    offsetDays: row.offset_days,
    scheduledFor: row.scheduled_for,
    state: row.state as CustomerAftercareCheckinV2["state"],
    concern: cleanString(row.concern),
    satisfaction: typeof row.satisfaction === "number" ? row.satisfaction : null,
    responseTitle: cleanString(response?.title) || null,
    responseSummary: cleanString(response?.summary) || null,
    failureMessage: cleanString(row.failure_message) || null,
  };
}

async function signedImageUrls(paths: Array<string | null>, supabase: ServerSupabaseLike) {
  const uniquePaths = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  const entries = await Promise.all(uniquePaths.map(async (path) => [
    path,
    await createSignedUrl(supabase, STYLING_RESULTS_BUCKET, path),
  ] as const));
  return new Map(entries);
}

async function loadFinalConsultationIds(
  userId: string,
  consultationIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(consultationIds.filter(Boolean))];
  if (!ids.length) return new Set();
  const result = await getSupabaseAdminClient()
    .from("consultation_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("lifecycle_state", "completed")
    .eq("current_stage", "result")
    .in("id", ids);
  if (result.error) throw new Error(result.error.message);
  return new Set(((result.data ?? []) as Array<{ id: string }>).map((row) => row.id));
}

export async function loadCustomerStylebookCollectionV2(userId: string): Promise<CustomerStylebookV2> {
  const empty = emptyCustomerStylebookCollectionV2();
  if (!isSupabaseConfigured()) return empty;
  const db = getSupabaseAdminClient();
  const [selectionResult, fashionResult] = await Promise.all([
    db.from("style_selection_snapshots_v2")
      .select("id,consultation_id,preview_variant_id,snapshot,confirmed_at")
      .eq("user_id", userId)
      .eq("status", "confirmed")
      .order("confirmed_at", { ascending: false })
      .limit(100),
    db.from("fashion_preview_sets_v2")
      .select("id,consultation_id,selection_snapshot_id,version,preview_set,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (selectionResult.error) throw new Error(selectionResult.error.message);
  if (fashionResult.error) throw new Error(fashionResult.error.message);

  const selections = ((selectionResult.data ?? []) as unknown as SelectionRow[])
    .map(parseCustomerSelectionRowV2)
    .filter((value): value is ParsedSelection => value !== null);
  const seenFashionConsultations = new Set<string>();
  const fashionSelections = ((fashionResult.data ?? []) as unknown as FashionPreviewSetRowV2[])
    .map(parseCustomerFashionPreviewSetRowV2)
    .filter((value): value is ParsedCustomerFashionSelectionV2 => value !== null)
    .filter((value) => {
      if (seenFashionConsultations.has(value.consultationId)) return false;
      seenFashionConsultations.add(value.consultationId);
      return true;
    });

  const finalConsultationIds = await loadFinalConsultationIds(userId, [
    ...selections.map((selection) => selection.consultationId),
    ...fashionSelections.map((selection) => selection.consultationId),
  ]);
  const finalSelections = selections.filter((selection) => finalConsultationIds.has(selection.consultationId));
  const finalFashionSelections = fashionSelections.filter((selection) => finalConsultationIds.has(selection.consultationId));

  const stylingSessionIds = finalFashionSelections.map((selection) => selection.selectedStylingSessionId);
  let stylingSessions: StylingSessionRow[] = [];
  if (stylingSessionIds.length) {
    const stylingResult = await db.from("styling_sessions")
      .select("id,consultation_id,selection_snapshot_id,source_mode,status,generated_image_path")
      .eq("user_id", userId)
      .in("id", stylingSessionIds);
    if (stylingResult.error) throw new Error(stylingResult.error.message);
    stylingSessions = (stylingResult.data ?? []) as unknown as StylingSessionRow[];
  }

  const validStylingSessionById = new Map(stylingSessions
    .filter((session) => session.source_mode === "v2_selection" && session.status === "completed")
    .map((session) => [session.id, session]));
  const fashionWithImagePaths = finalFashionSelections.flatMap((selection) => {
    const session = validStylingSessionById.get(selection.selectedStylingSessionId);
    const validSession = session
      && session.consultation_id === selection.consultationId
      && session.selection_snapshot_id === selection.selectionSnapshotId;
    const imagePath = validSession ? cleanString(session.generated_image_path) : "";
    return validSession && imagePath ? [{ ...selection, imagePath }] : [];
  });

  const imageUrls = await signedImageUrls([
    ...finalSelections.map((selection) => selection.imagePath),
    ...fashionWithImagePaths.map((selection) => selection.imagePath),
  ], db as unknown as ServerSupabaseLike);
  return attachCustomerStylebookMetadataV2(userId, {
    schemaVersion: "customer-stylebook-v2",
    hair: finalSelections.map((selection) => toCustomerStyleRecord(
      selection,
      selection.imagePath ? imageUrls.get(selection.imagePath) ?? null : null,
    )),
    fashion: fashionWithImagePaths.map(({ imagePath, ...selection }) => ({
      ...selection,
      imageUrl: imagePath ? imageUrls.get(imagePath) ?? null : null,
    })),
    sets: [],
    collections: [],
    wearLogs: [],
    activeShares: [],
    references: [],
    metadataAvailable: false,
  });
}

export async function loadCustomerStylebookV2(userId: string): Promise<CustomerStyleRecordV2[]> {
  return (await loadCustomerStylebookCollectionV2(userId)).hair;
}

export async function loadCustomerStyleResultConsultationV2(
  userId: string,
  selectionId: string,
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const result = await getSupabaseAdminClient()
    .from("style_selection_snapshots_v2")
    .select("consultation_id")
    .eq("id", selectionId)
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return cleanString((result.data as { consultation_id?: unknown } | null)?.consultation_id) || null;
}

export async function loadCustomerAftercareV2(userId: string): Promise<CustomerAftercareRecordV2[]> {
  if (!isSupabaseConfigured()) return [];
  const db = getSupabaseAdminClient();
  const servicesResult = await db
    .from("actual_services_v2")
    .select("id,consultation_id,selection_snapshot_id,services,service_date,designer_notes,confirmed_at")
    .eq("user_id", userId)
    .order("confirmed_at", { ascending: false })
    .limit(50);
  if (servicesResult.error) throw new Error(servicesResult.error.message);
  const actualServices = (servicesResult.data ?? []) as unknown as ActualServiceRow[];
  if (!actualServices.length) return [];

  const actualServiceIds = actualServices.map((service) => service.id);
  const selectionIds = [...new Set(actualServices.map((service) => service.selection_snapshot_id))];
  const [selectionResult, programResult, checkinResult] = await Promise.all([
    db.from("style_selection_snapshots_v2")
      .select("id,consultation_id,preview_variant_id,snapshot,confirmed_at")
      .eq("user_id", userId)
      .in("id", selectionIds),
    db.from("aftercare_programs_v2")
      .select("actual_service_id,version,program,created_at")
      .eq("user_id", userId)
      .in("actual_service_id", actualServiceIds)
      .order("version", { ascending: false }),
    db.from("aftercare_checkins_v2")
      .select("id,actual_service_id,slot,offset_days,scheduled_for,state,concern,satisfaction,response,failure_message")
      .eq("user_id", userId)
      .in("actual_service_id", actualServiceIds)
      .order("slot", { ascending: true }),
  ]);
  if (selectionResult.error) throw new Error(selectionResult.error.message);
  if (programResult.error) throw new Error(programResult.error.message);
  if (checkinResult.error) throw new Error(checkinResult.error.message);

  const selections = ((selectionResult.data ?? []) as unknown as SelectionRow[])
    .map(parseCustomerSelectionRowV2)
    .filter((value): value is ParsedSelection => value !== null);
  const selectionById = new Map(selections.map((selection) => [selection.selectionId, selection]));
  const latestProgramByActualService = new Map<string, CustomerAftercareProgramV2>();
  for (const row of (programResult.data ?? []) as unknown as ProgramRow[]) {
    if (latestProgramByActualService.has(row.actual_service_id)) continue;
    const program = parseCustomerAftercareProgramV2(row);
    if (program) latestProgramByActualService.set(row.actual_service_id, program);
  }
  const checkinsByActualService = new Map<string, CustomerAftercareCheckinV2[]>();
  for (const row of (checkinResult.data ?? []) as unknown as CheckinRow[]) {
    const checkin = parseCustomerAftercareCheckinV2(row);
    if (!checkin) continue;
    const current = checkinsByActualService.get(row.actual_service_id) ?? [];
    current.push(checkin);
    checkinsByActualService.set(row.actual_service_id, current);
  }

  const imageUrls = await signedImageUrls(selections.map((selection) => selection.imagePath), db as unknown as ServerSupabaseLike);
  return actualServices.flatMap((service) => {
    const selection = selectionById.get(service.selection_snapshot_id);
    if (!selection) return [];
    return [{
      actualServiceId: service.id,
      consultationId: service.consultation_id,
      selectionId: service.selection_snapshot_id,
      styleName: selection.name,
      recommendationReason: selection.recommendationReason,
      imageUrl: selection.imagePath ? imageUrls.get(selection.imagePath) ?? null : null,
      services: stringArray(service.services),
      serviceDate: service.service_date,
      designerNotes: cleanString(service.designer_notes),
      confirmedAt: service.confirmed_at,
      program: latestProgramByActualService.get(service.id) ?? null,
      checkins: checkinsByActualService.get(service.id) ?? [],
    }];
  });
}

export async function loadCustomerAftercareRecordV2(userId: string, actualServiceId: string) {
  const records = await loadCustomerAftercareV2(userId);
  return records.find((record) => record.actualServiceId === actualServiceId) ?? null;
}
