import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  assertMakeupContextProfile,
  assertMakeupDirectionSnapshot,
  buildMakeupFoundationSnapshotV1,
  compileMakeupRecommendationRationaleV1,
  MAKEUP_MODULES,
  type MakeupContextProfile,
  type MakeupDirectionSnapshot,
  type MakeupDenseAtlasV3,
  type MakeupModule,
  type MakeupModulePatch,
  type MakeupMode,
  type MakeupRecipeV1,
  type MakeupProtectedRegionV3,
  type MakeupSourceStaleReason,
  validateMakeupModulePatchBounds,
} from "@hairfit/shared/makeup";
import { assertPersonalColorProfileV2, type PersonalColorProfileV2 } from "@hairfit/shared/personal-color-v2";
import { getFaceObservationBundleV2 } from "../personal-color-observation";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "../v2/errors";
import { recordV2Event } from "../v2/observability";
import { ensureMakeupArtifacts } from "./makeup-artifacts-server";
import { isMakeupDenseAtlasV3Enabled, isMakeupRecipeCatalogEnabled, isMakeupRecipeCatalogShadowEnabled, isMakeupSemanticVisionStaffOnly, isMakeupSemanticVisionV3Enabled } from "../consulting/feature-flag";
import { readMakeupSemanticCapability, retryMakeupSemanticCapability, runMakeupSemanticCapability, type MakeupSemanticCapabilityInput } from "../capabilities/makeup-semantic-map-service";
import { readMakeupSourceImageDataUrl } from "./makeup-source-image-server";
import { readActiveMakeupRecipeV1 } from "./makeup-recipe-catalog-server";

type SnapshotRow = {
  id: string; consultation_id: string; user_id: string; snapshot_version: number; revision: number; status: string;
  face_observation_bundle_id: string; personal_color_profile_id: string; selected_style_snapshot_id: string;
  input_profile_revision: number; source_fingerprint: string; context: MakeupContextProfile; modules: MakeupDirectionSnapshot["modules"];
  snapshot: MakeupDirectionSnapshot; confirmed_at: string | null; created_at: string; updated_at: string;
  recipe_catalog_cycle_id?: string | null; recipe_id?: string | null; recipe_fingerprint?: string | null; presentation_family?: string | null;
};

const EDITABLE_STATES = ["context_draft", "geometry_building", "map_ready", "partial_ready", "user_adjusted", "failed_retryable"];
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const emptyModules = () => MAKEUP_MODULES.map((module) => ({
  module, state: "enabled" as const,
  geometry: { coordinateSpace: "normalized_source_image" as const, anchors: [], polygons: [], excludedPolygons: [], vectors: [] },
  direction: { enabled: true, intensity: 0, colorFamily: null, texture: null, evidenceIds: [], reasons: ["context_required"], technical: { kind: module, zonePolicyVersion: "context-required" as const, placement: [], applicationDirection: [], finish: "context_required", technique: "context_required", productAttributes: [], warnings: [], parameters: {} } },
}));

async function assertOwner(userId: string, consultationId: string) {
  const owner = await getSupabaseAdminClient().from("consultation_sessions").select("id")
    .eq("id", consultationId).eq("user_id", userId).maybeSingle();
  if (owner.error) throw new Error(owner.error.message);
  if (!owner.data) throw new HairfitV2Error("CONSULTATION_NOT_FOUND", 404, "상담을 찾지 못했습니다.");
}

async function currentSources(userId: string, consultationId: string) {
  await assertOwner(userId, consultationId);
  const db = getSupabaseAdminClient();
  const [active, selection, observation] = await Promise.all([
    db.from("active_personal_color_profiles_v2").select("profile_id").eq("user_id", userId).eq("consultation_id", consultationId).maybeSingle(),
    db.from("style_selection_snapshots_v2").select("id,snapshot_version,snapshot").eq("user_id", userId).eq("consultation_id", consultationId).eq("status", "confirmed").maybeSingle(),
    getFaceObservationBundleV2(userId, consultationId),
  ]);
  if (active.error) throw new Error(active.error.message);
  if (selection.error) throw new Error(selection.error.message);
  const profileId = (active.data as { profile_id?: string } | null)?.profile_id;
  if (!observation) throw new HairfitV2Error("FACE_OBSERVATION_NOT_READY", 409, "얼굴 관측 데이터가 먼저 필요합니다.");
  if (!profileId) throw new HairfitV2Error("PERSONAL_COLOR_NOT_READY", 409, "퍼스널 컬러 프로필이 먼저 필요합니다.");
  if (!selection.data) throw new HairfitV2Error("SELECTED_STYLE_NOT_READY", 409, "확정한 헤어스타일이 먼저 필요합니다.");
  const profileResult = await db.from("personal_color_profiles_v2").select("profile,observation_bundle_id")
    .eq("id", profileId).eq("user_id", userId).eq("consultation_id", consultationId).maybeSingle();
  if (profileResult.error) throw new Error(profileResult.error.message);
  if (!profileResult.data) throw new HairfitV2Error("PERSONAL_COLOR_NOT_READY", 409, "활성 퍼스널 컬러 프로필을 찾지 못했습니다.");
  const profile = (profileResult.data as unknown as { profile: PersonalColorProfileV2 }).profile;
  assertPersonalColorProfileV2(profile);
  if (profile.observationBundleId !== observation.id) throw new HairfitV2Error("MAKEUP_SOURCE_VERSION_STALE", 409, "퍼스널 컬러와 얼굴 관측 버전이 일치하지 않습니다.");
  const source = {
    faceObservationBundleId: observation.id,
    personalColorProfileId: profile.id,
    selectedStyleId: String(selection.data.id),
    inputProfileRevision: Number(selection.data.snapshot_version),
  };
  const selectionSnapshot = (selection.data as unknown as { snapshot?: { style?: { design?: Record<string, unknown>; color?: Record<string, unknown> | null } } }).snapshot;
  const design = selectionSnapshot?.style?.design ?? {}; const color = selectionSnapshot?.style?.color ?? {};
  const readHint = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
  const hair = {
    colorFamily: readHint(color.colorFamily) ?? readHint(color.family) ?? readHint(color.name),
    fringe: readHint(design.fringe) ?? readHint(design.bangs),
    parting: readHint(design.parting) ?? readHint(design.part),
  };
  return { source, observation, profile, hair, fingerprint: hash(source) };
}

export async function readMakeupRationaleSources(userId: string, consultationId: string) {
  const sources = await currentSources(userId, consultationId);
  return {
    source: sources.source,
    personalColor: {
      label: sources.profile.displayClassification?.label ?? sources.profile.seasonalPosterior[0]?.type ?? "퍼스널 컬러 분석",
      confidence: sources.profile.confidence.overall,
      palette: [...sources.profile.harmonyPalette.best, ...sources.profile.harmonyPalette.accent],
    },
    face: {
      quality: sources.observation.quality.status,
      validSkinPixelRatio: sources.observation.quality.validSkinPixelRatio,
      warnings: sources.observation.quality.warnings.map((item) => item.message),
    },
    hair: sources.hair,
  };
}

function mapRow(row: SnapshotRow) {
  const snapshot = row.snapshot;
  assertMakeupDirectionSnapshot(snapshot);
  return { snapshot, revision: row.revision, sourceFingerprint: row.source_fingerprint };
}

function protectedRegions(atlas: MakeupDenseAtlasV3, observation: Awaited<ReturnType<typeof getFaceObservationBundleV2>>) {
  if (!observation) return [] as MakeupProtectedRegionV3[];
  const regions: MakeupProtectedRegionV3[] = [];
  const maskKind = (kind: string): MakeupProtectedRegionV3["kind"] | null => {
    if (kind === "hair" || kind === "facial_hair" || kind === "eye" || kind === "nostril") return kind;
    if (kind === "lip") return "lip_inner";
    if (kind === "reflection") return "occluded";
    return null;
  };
  for (const mask of observation.masks) {
    const kind = maskKind(mask.kind);
    if (kind && mask.operation === "exclude") regions.push({ id: mask.id, kind, points: mask.points });
  }
  const lines = new Map(atlas.lineSets.map((line) => [line.id, line.points]));
  const contour = (upper: string, lower: string) => {
    const top = lines.get(upper as Parameters<typeof lines.get>[0]) ?? [];
    const bottom = lines.get(lower as Parameters<typeof lines.get>[0]) ?? [];
    return [...top, ...[...bottom].reverse()];
  };
  const leftEye = contour("eye.upper.left", "eye.lower.left");
  const rightEye = contour("eye.upper.right", "eye.lower.right");
  const innerLip = contour("lip.inner.upper", "lip.inner.lower");
  if (leftEye.length >= 3) regions.push({ id: "atlas-eye-left", kind: "eye", points: leftEye });
  if (rightEye.length >= 3) regions.push({ id: "atlas-eye-right", kind: "eye", points: rightEye });
  if (innerLip.length >= 3) regions.push({ id: "atlas-lip-inner", kind: "lip_inner", points: innerLip });
  if (atlas.sourceModel.pointCount >= 478) {
    const ticks = new Map(atlas.precisionTicks.map((tick) => [tick.sourceIndex, tick.point]));
    const iris = (indices: number[]) => indices.map((index) => ticks.get(index)).filter((point): point is NonNullable<typeof point> => Boolean(point));
    const leftIris = iris([469, 470, 471, 472]); const rightIris = iris([474, 475, 476, 477]);
    if (leftIris.length === 4) regions.push({ id: "atlas-iris-left", kind: "iris", points: leftIris });
    if (rightIris.length === 4) regions.push({ id: "atlas-iris-right", kind: "iris", points: rightIris });
  }
  return regions;
}

function semanticInputBase(row: SnapshotRow, sources: Awaited<ReturnType<typeof currentSources>>): Omit<MakeupSemanticCapabilityInput, "sourceImageDataUrl"> | null {
  const atlas = row.snapshot.denseAtlas;
  if (!atlas || atlas.degradedReason) return null;
  const palette = sources.profile.harmonyPalette;
  return {
    sourceFingerprint: hash({ snapshotSourceFingerprint: row.source_fingerprint, sourceImageFingerprint: sources.observation.inputHash }),
    sourceCorrectionRevision: sources.observation.correctionRevision,
    atlas,
    context: {
      presentation: row.snapshot.context.presentation,
      occasions: row.snapshot.context.occasions,
      preparationMinutes: row.snapshot.context.preparationMinutes,
      skillLevel: row.snapshot.context.skillLevel,
      finishPreference: row.snapshot.context.finishPreference,
      exclusions: row.snapshot.context.exclusions,
      facialHair: row.snapshot.context.facialHair,
    },
    modules: row.snapshot.modules.map((item) => ({ module: item.module, enabled: item.state === "enabled" && item.direction.enabled })),
    paletteAttributes: [...new Set([...palette.best, ...palette.base, ...palette.accent, ...palette.challenge, ...palette.metals])],
    protectedRegions: protectedRegions(atlas, sources.observation),
  };
}

async function semanticVisionAllowed(userId: string) {
  if (!isMakeupSemanticVisionV3Enabled()) return false;
  if (!isMakeupSemanticVisionStaffOnly()) return true;
  const role = await getSupabaseAdminClient().from("users").select("account_type").eq("id", userId).maybeSingle();
  if (role.error) throw new Error(role.error.message);
  return (role.data as { account_type?: string | null } | null)?.account_type === "admin";
}

async function latestRow(userId: string, consultationId: string) {
  const result = await getSupabaseAdminClient().from("makeup_direction_snapshots").select("*")
    .eq("user_id", userId).eq("consultation_id", consultationId).neq("status", "superseded")
    .order("snapshot_version", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as unknown as SnapshotRow | null;
}

export async function defaultMakeupContext(userId: string): Promise<MakeupContextProfile> {
  const profile = await getSupabaseAdminClient().from("member_profiles").select("style_target").eq("user_id", userId).maybeSingle();
  if (profile.error) throw new Error(profile.error.message);
  const target = (profile.data as { style_target?: string | null } | null)?.style_target;
  return {
    presentation: "natural_grooming", occasions: ["daily"], preparationMinutes: 10, skillLevel: "basic", finishPreference: "natural",
    exclusions: [], ownedProductTypes: [], ownedToolTypes: [],
    gender: target === "male" || target === "female" ? target : "not_provided",
    facialHair: { type: "none", userWantsCoverage: false },
  };
}

function staleReasons(snapshot: MakeupDirectionSnapshot, current: MakeupDirectionSnapshot["source"]): MakeupSourceStaleReason[] {
  const reasons: MakeupSourceStaleReason[] = [];
  if (snapshot.source.faceObservationBundleId !== current.faceObservationBundleId) reasons.push("face_observation_changed");
  if (snapshot.source.personalColorProfileId !== current.personalColorProfileId) reasons.push("personal_color_changed");
  if (snapshot.source.selectedStyleId !== current.selectedStyleId) reasons.push("selected_style_changed");
  if (snapshot.source.inputProfileRevision !== current.inputProfileRevision) reasons.push("input_profile_changed");
  return reasons;
}

export async function readMakeupDirection(userId: string, consultationId: string) {
  await assertOwner(userId, consultationId);
  const row = await latestRow(userId, consultationId);
  const defaultContext = await defaultMakeupContext(userId);
  if (!row) return { snapshot: null, revision: null, staleSourceReasons: [] as MakeupSourceStaleReason[], defaultContext, semanticMap: null, semanticEnabled: await semanticVisionAllowed(userId), denseAtlasEnabled: isMakeupDenseAtlasV3Enabled() };
  let staleSourceReasons: MakeupSourceStaleReason[] = [];
  let semanticMap = null;
  let semanticEnabled = false;
  try {
    const sources = await currentSources(userId, consultationId);
    staleSourceReasons = staleReasons(row.snapshot, sources.source);
    semanticEnabled = await semanticVisionAllowed(userId);
    const base = semanticEnabled && !staleSourceReasons.length ? semanticInputBase(row, sources) : null;
    if (base) semanticMap = await readMakeupSemanticCapability({ ...base, userId });
  }
  catch (error) { if (error instanceof HairfitV2Error) staleSourceReasons = ["input_profile_changed"]; else throw error; }
  return { ...mapRow(row), staleSourceReasons, defaultContext, semanticMap, semanticEnabled, denseAtlasEnabled: isMakeupDenseAtlasV3Enabled() };
}

export async function saveMakeupContext(userId: string, consultationId: string, context: MakeupContextProfile) {
  try { assertMakeupContextProfile(context); }
  catch { throw new HairfitV2Error("MAKEUP_CONTEXT_INVALID", 400, "메이크업 컨텍스트 형식이 올바르지 않습니다."); }
  const db = getSupabaseAdminClient();
  const sources = await currentSources(userId, consultationId);
  const existingResult = await db.from("makeup_direction_snapshots").select("*")
    .eq("user_id", userId).eq("consultation_id", consultationId).in("status", EDITABLE_STATES)
    .order("snapshot_version", { ascending: false }).limit(1).maybeSingle();
  if (existingResult.error) throw new Error(existingResult.error.message);
  const existing = existingResult.data as unknown as SnapshotRow | null;
  if (existing && existing.source_fingerprint === sources.fingerprint) {
    const snapshot = { ...existing.snapshot, context, status: "context_draft" as const, modules: emptyModules(), confirmedAt: null };
    delete snapshot.recipeBinding;
    const updated = await db.from("makeup_direction_snapshots").update({ context, modules: snapshot.modules, snapshot, status: "context_draft", revision: existing.revision + 1, recipe_catalog_cycle_id: null, recipe_id: null, recipe_fingerprint: null, presentation_family: null, updated_at: new Date().toISOString() })
      .eq("id", existing.id).eq("user_id", userId).eq("revision", existing.revision).select("*").maybeSingle();
    if (updated.error) throw new Error(updated.error.message);
    if (!updated.data) throw new HairfitV2Error("MAKEUP_REVISION_CONFLICT", 409, "메이크업 입력이 변경되었습니다. 다시 불러와 주세요.");
    return mapRow(updated.data as unknown as SnapshotRow);
  }
  if (existing) {
    const superseded = await db.from("makeup_direction_snapshots").update({ status: "superseded", revision: existing.revision + 1, updated_at: new Date().toISOString() }).eq("id", existing.id).eq("revision", existing.revision);
    if (superseded.error) throw new Error(superseded.error.message);
  }
  const versionResult = await db.from("makeup_direction_snapshots").select("snapshot_version").eq("user_id", userId).eq("consultation_id", consultationId).order("snapshot_version", { ascending: false }).limit(1).maybeSingle();
  if (versionResult.error) throw new Error(versionResult.error.message);
  const version = Number((versionResult.data as { snapshot_version?: number } | null)?.snapshot_version ?? 0) + 1;
  const now = new Date().toISOString(); const id = randomUUID();
  const snapshot: MakeupDirectionSnapshot = {
    schemaVersion: "makeup-direction-snapshot-v1", id, consultationId, version, status: "context_draft", source: sources.source, context,
    modules: emptyModules(), modelManifest: { geometryPolicyVersion: "pending-build", directionPolicyVersion: "makeup-foundation-placeholder-v1", routinePolicyVersion: "pending-phase-07", explanationModel: null, createdAt: now }, confirmedAt: null, createdAt: now,
  };
  assertMakeupDirectionSnapshot(snapshot);
  const inserted = await db.from("makeup_direction_snapshots").insert({
    id, consultation_id: consultationId, user_id: userId, snapshot_version: version, revision: 1, status: snapshot.status,
    face_observation_bundle_id: sources.source.faceObservationBundleId, personal_color_profile_id: sources.source.personalColorProfileId,
    selected_style_snapshot_id: sources.source.selectedStyleId, input_profile_revision: sources.source.inputProfileRevision,
    source_fingerprint: sources.fingerprint, context, modules: snapshot.modules, snapshot,
    geometry_policy_version: snapshot.modelManifest.geometryPolicyVersion, direction_policy_version: snapshot.modelManifest.directionPolicyVersion,
  }).select("*").single();
  if (inserted.error) throw new Error(inserted.error.message);
  return mapRow(inserted.data as unknown as SnapshotRow);
}

export async function buildMakeupDirection(userId: string, consultationId: string, expectedRevision: number) {
  const db = getSupabaseAdminClient(); const sources = await currentSources(userId, consultationId); const row = await latestRow(userId, consultationId);
  if (!row) throw new HairfitV2Error("MAKEUP_CONTEXT_REQUIRED", 409, "메이크업 컨텍스트를 먼저 저장해 주세요.");
  if (row.revision !== expectedRevision) throw new HairfitV2Error("MAKEUP_REVISION_CONFLICT", 409, "메이크업 입력이 변경되었습니다. 다시 불러와 주세요.");
  const stale = staleReasons(row.snapshot, sources.source); if (stale.length) throw new HairfitV2Error("MAKEUP_SOURCE_VERSION_STALE", 409, "원본 분석 또는 선택 결과가 바뀌었습니다. 컨텍스트부터 다시 저장해 주세요.");
  const selectedMode = (row.snapshot.rationale?.acceptedMode ?? row.context.makeupMode ?? row.snapshot.interviewProfile?.primaryMode ?? "daily_natural") as MakeupMode;
  let recipe: MakeupRecipeV1 | null = null;
  if (isMakeupRecipeCatalogEnabled() || isMakeupRecipeCatalogShadowEnabled()) {
    try { recipe = await readActiveMakeupRecipeV1(row.context.gender, selectedMode); }
    catch (error) {
      if (isMakeupRecipeCatalogEnabled()) throw error;
      await recordV2Event({ consultationId, userId, eventType: "makeup.recipe_catalog.shadow_failed", payload: { selectedMode, errorCode: error instanceof HairfitV2Error ? error.code : "MAKEUP_RECIPE_SHADOW_FAILED" } });
    }
  }
  const useRecipe = isMakeupRecipeCatalogEnabled() ? recipe : null;
  const snapshot = buildMakeupFoundationSnapshotV1({ id: row.id, consultationId, version: row.snapshot_version, source: sources.source, context: row.context, observation: sources.observation, personalColor: sources.profile, hair: sources.hair, createdAt: row.created_at, recipe: useRecipe });
  snapshot.interviewProfile = row.snapshot.interviewProfile;
  if (row.snapshot.interviewProfile && row.snapshot.rationale) {
    const refreshed = compileMakeupRecommendationRationaleV1({
      profile: row.snapshot.interviewProfile,
      source: sources.source,
      personalColor: {
        label: sources.profile.displayClassification?.label ?? sources.profile.seasonalPosterior[0]?.type ?? "퍼스널 컬러 분석",
        confidence: sources.profile.confidence.overall,
        palette: [...sources.profile.harmonyPalette.best, ...sources.profile.harmonyPalette.accent],
      },
      face: {
        quality: sources.observation.quality.status,
        validSkinPixelRatio: sources.observation.quality.validSkinPixelRatio,
        warnings: sources.observation.quality.warnings.map((item) => item.message),
      },
      hair: sources.hair,
      modules: snapshot.modules,
    });
    snapshot.rationale = { ...refreshed, acceptedMode: row.snapshot.rationale.acceptedMode, decision: row.snapshot.rationale.decision };
  }
  if (!isMakeupDenseAtlasV3Enabled()) {
    delete snapshot.denseAtlas;
    snapshot.modelManifest.geometryPolicyVersion = snapshot.topologyProjection?.degradedReason ? "makeup-geometry-mediapipe-v1-fallback" : "makeup-geometry-mediapipe-v2";
    assertMakeupDirectionSnapshot(snapshot);
  }
  if (recipe && !isMakeupRecipeCatalogEnabled()) {
    const shadow = buildMakeupFoundationSnapshotV1({ id: row.id, consultationId, version: row.snapshot_version, source: sources.source, context: row.context, observation: sources.observation, personalColor: sources.profile, hair: sources.hair, createdAt: row.created_at, recipe });
    await recordV2Event({ consultationId, userId, eventType: "makeup.recipe_catalog.shadow_compared", payload: { cycleId: recipe.cycleId, recipeId: recipe.id, presentationFamily: recipe.presentationFamily, selectedMode, changedModules: shadow.modules.filter((item, index) => item.state !== snapshot.modules[index]?.state || item.direction.intensity !== snapshot.modules[index]?.direction.intensity).map((item) => item.module) } });
  }
  const updated = await db.from("makeup_direction_snapshots").update({ status: snapshot.status, revision: row.revision + 1, modules: snapshot.modules, snapshot, geometry_policy_version: snapshot.modelManifest.geometryPolicyVersion, direction_policy_version: snapshot.modelManifest.directionPolicyVersion, recipe_catalog_cycle_id: snapshot.recipeBinding?.cycleId ?? null, recipe_id: snapshot.recipeBinding?.recipeId ?? null, recipe_fingerprint: snapshot.recipeBinding?.recipeFingerprint ?? null, presentation_family: snapshot.recipeBinding?.presentationFamily ?? null, updated_at: new Date().toISOString() })
    .eq("id", row.id).eq("user_id", userId).eq("revision", row.revision).select("*").maybeSingle();
  if (updated.error) throw new Error(updated.error.message);
  if (!updated.data) throw new HairfitV2Error("MAKEUP_REVISION_CONFLICT", 409, "메이크업 지도가 변경되었습니다. 다시 불러와 주세요.");
  await recordV2Event({ consultationId, userId, eventType: "makeup.zone_map.built", payload: { moduleCount: snapshot.modules.length, presentation: snapshot.context.presentation, presentationFamily: snapshot.recipeBinding?.presentationFamily ?? null, recipeId: snapshot.recipeBinding?.recipeId ?? null, recipeFingerprint: snapshot.recipeBinding?.recipeFingerprint ?? null, preparationMinutes: snapshot.context.preparationMinutes, skillLevel: snapshot.context.skillLevel, directionPolicyVersion: snapshot.modelManifest.directionPolicyVersion } });
  return { ...mapRow(updated.data as unknown as SnapshotRow), semanticMap: null, semanticEnabled: await semanticVisionAllowed(userId), denseAtlasEnabled: isMakeupDenseAtlasV3Enabled() };
}

async function makeupSemanticDispatchInput(userId: string, consultationId: string) {
  if (!await semanticVisionAllowed(userId)) throw new HairfitV2Error("MAKEUP_SEMANTIC_VISION_DISABLED", 404, "AI 정밀 가이드를 사용할 수 없습니다.");
  const row = await latestRow(userId, consultationId);
  if (!row) throw new HairfitV2Error("MAKEUP_SNAPSHOT_NOT_FOUND", 404, "메이크업 지도를 찾지 못했습니다.");
  const sources = await currentSources(userId, consultationId);
  if (staleReasons(row.snapshot, sources.source).length) throw new HairfitV2Error("MAKEUP_SOURCE_VERSION_STALE", 409, "기준 데이터가 변경되어 메이크업 지도를 다시 계산해야 합니다.");
  const base = semanticInputBase(row, sources);
  if (!base) throw new HairfitV2Error("MAKEUP_DENSE_ATLAS_UNAVAILABLE", 409, "정밀 랜드마크 지도가 준비되지 않았습니다.");
  const sourceImageDataUrl = await readMakeupSourceImageDataUrl(userId, consultationId);
  return { ...base, sourceImageDataUrl, userId, consultationId };
}

export async function dispatchMakeupSemanticMap(userId: string, consultationId: string) {
  return runMakeupSemanticCapability(await makeupSemanticDispatchInput(userId, consultationId));
}

export async function retryMakeupSemanticMap(userId: string, consultationId: string) {
  return retryMakeupSemanticCapability(await makeupSemanticDispatchInput(userId, consultationId));
}

function applyModulePatch(snapshot: MakeupDirectionSnapshot, module: MakeupModule, patch: MakeupModulePatch) {
  const next = structuredClone(snapshot); const target = next.modules.find((item) => item.module === module);
  if (!target) throw new HairfitV2Error("MAKEUP_MODULE_INVALID", 400, "메이크업 모듈을 찾지 못했습니다.");
  try { validateMakeupModulePatchBounds(target, patch.geometry ?? {}); }
  catch { throw new HairfitV2Error("MAKEUP_ANCHOR_OUT_OF_BOUNDS", 400, "안전한 조정 범위를 벗어났습니다."); }
  if (patch.state) { target.state = patch.state; target.direction.enabled = patch.state === "enabled"; }
  if (patch.direction) target.direction = { ...target.direction, ...patch.direction };
  for (const item of patch.geometry?.anchors ?? []) {
    if (!target.geometry.anchors[item.index]) throw new HairfitV2Error("MAKEUP_ANCHOR_OUT_OF_BOUNDS", 400, "조정할 기준점이 없습니다.");
    target.geometry.anchors[item.index] = item.point;
  }
  for (const item of patch.geometry?.polygons ?? []) {
    if (!target.geometry.polygons[item.polygonIndex]?.[item.pointIndex]) throw new HairfitV2Error("MAKEUP_ANCHOR_OUT_OF_BOUNDS", 400, "조정할 영역점이 없습니다.");
    target.geometry.polygons[item.polygonIndex][item.pointIndex] = item.point;
  }
  for (const item of patch.geometry?.vectors ?? []) {
    const current = target.geometry.vectors[item.index];
    if (!current) throw new HairfitV2Error("MAKEUP_ANCHOR_OUT_OF_BOUNDS", 400, "조정할 방향 벡터가 없습니다.");
    target.geometry.vectors[item.index] = { origin: item.origin ?? current.origin, dx: item.dx ?? current.dx, dy: item.dy ?? current.dy };
  }
  if (target.state !== "enabled") target.direction.enabled = false;
  next.status = "user_adjusted"; assertMakeupDirectionSnapshot(next); return next;
}

export async function patchMakeupModule(userId: string, consultationId: string, snapshotId: string, module: string, patch: MakeupModulePatch) {
  if (!MAKEUP_MODULES.includes(module as MakeupModule)) throw new HairfitV2Error("MAKEUP_MODULE_INVALID", 400, "메이크업 모듈이 올바르지 않습니다.");
  const row = await latestRow(userId, consultationId); if (!row || row.id !== snapshotId) throw new HairfitV2Error("MAKEUP_SNAPSHOT_NOT_FOUND", 404, "메이크업 지도를 찾지 못했습니다.");
  const next = applyModulePatch(row.snapshot, module as MakeupModule, patch);
  const result = await getSupabaseAdminClient().rpc("patch_makeup_direction_snapshot", { p_user_id: userId, p_snapshot_id: snapshotId, p_expected_revision: patch.expectedRevision, p_module: module, p_patch: patch, p_modules: next.modules, p_snapshot: next });
  if (result.error) throw new Error(result.error.message);
  const state = result.data as { state?: string; revision?: number } | null;
  if (state?.state === "conflict") throw new HairfitV2Error("MAKEUP_REVISION_CONFLICT", 409, "메이크업 지도가 변경되었습니다. 다시 불러와 주세요.");
  if (state?.state === "confirmed") throw new HairfitV2Error("MAKEUP_ALREADY_CONFIRMED", 409, "확정한 메이크업 지도는 변경할 수 없습니다.");
  const revision = Number(state?.revision ?? patch.expectedRevision + 1);
  await recordV2Event({ consultationId, userId, eventType: "makeup.zone.adjusted", payload: { module, revision, state: next.modules.find((item) => item.module === module)?.state, geometryAdjusted: Boolean(patch.geometry), directionAdjusted: Boolean(patch.direction) } });
  return { snapshot: next, revision, sourceFingerprint: row.source_fingerprint };
}

export async function confirmMakeupDirection(userId: string, consultationId: string, snapshotId: string, expectedRevision: number) {
  const row = await latestRow(userId, consultationId); if (!row || row.id !== snapshotId) throw new HairfitV2Error("MAKEUP_SNAPSHOT_NOT_FOUND", 404, "메이크업 지도를 찾지 못했습니다.");
  const sources = await currentSources(userId, consultationId); if (staleReasons(row.snapshot, sources.source).length) throw new HairfitV2Error("MAKEUP_SOURCE_VERSION_STALE", 409, "원본 분석 또는 선택 결과가 바뀌어 다시 계산해야 합니다.");
  const result = await getSupabaseAdminClient().rpc("confirm_makeup_direction_snapshot", { p_user_id: userId, p_snapshot_id: snapshotId, p_expected_revision: expectedRevision });
  if (result.error) throw new Error(result.error.message);
  const state = result.data as { state?: string; revision?: number } | null;
  if (state?.state === "conflict") throw new HairfitV2Error("MAKEUP_REVISION_CONFLICT", 409, "메이크업 지도가 변경되었습니다. 다시 불러와 주세요.");
  const confirmed = await latestRow(userId, consultationId); if (!confirmed) throw new Error("MAKEUP_SNAPSHOT_DISAPPEARED");
  const artifacts = await ensureMakeupArtifacts(userId, consultationId);
  await recordV2Event({ consultationId, userId, eventType: "makeup.direction.confirmed", payload: { snapshotId, revision: Number(state?.revision ?? expectedRevision), moduleCount: confirmed.snapshot.modules.length } });
  return { ...mapRow(confirmed), artifacts };
}
