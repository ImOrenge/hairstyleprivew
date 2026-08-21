import "server-only";

import { randomUUID } from "node:crypto";
import {
  assertPersonalColorDrapeSessionV2,
  assertPersonalColorProfileV2,
  type PersonalColorDrapeAnswerV2,
  type PersonalColorDrapePreferenceV2,
  type PersonalColorDrapeResponseV2,
  type PersonalColorDrapeSessionV2,
  type PersonalColorProfileV2,
} from "@hairfit/shared/personal-color-v2";
import { HairfitV2Error } from "./v2/errors";
import { getSupabaseAdminClient } from "./supabase";
import {
  buildDrapePairCatalogV2,
  deriveDrapeHarmonyV2,
  deriveDrapePreferenceV2,
  drapeStopReasonV2,
  nextDrapePairV2,
  updateDrapePosteriorV2,
} from "./personal-color-drape-policy";
import { hashPersonalColorProjection } from "./personal-color-projection";
import { projectLegacyPersonalColorV2 } from "./personal-color-profile-v2";

type SessionRow = Record<string, unknown>;

function mapAnswer(row: SessionRow): PersonalColorDrapeAnswerV2 {
  return {
    id: String(row.id), pairId: String(row.pair_id), revision: Number(row.response_revision),
    response: String(row.response) as PersonalColorDrapeResponseV2,
    preference: (row.preference ?? null) as PersonalColorDrapePreferenceV2,
    supersedesResponseId: typeof row.supersedes_response_id === "string" ? row.supersedes_response_id : null,
    createdAt: String(row.created_at),
  };
}

async function mapSession(row: SessionRow): Promise<PersonalColorDrapeSessionV2> {
  const responseResult = await getSupabaseAdminClient().from("personal_color_drape_responses")
    .select("id,pair_id,response_revision,response,preference,supersedes_response_id,created_at")
    .eq("session_id", String(row.id)).order("created_at", { ascending: true });
  if (responseResult.error) throw new Error(responseResult.error.message);
  const session = {
    schemaVersion: "personal-color-drape-session-v2",
    id: String(row.id), consultationId: String(row.consultation_id), personalColorProfileId: String(row.personal_color_profile_id),
    sourceProfileVersion: Number(row.source_profile_version), status: String(row.status), revision: Number(row.revision),
    posteriorBefore: row.posterior_before, posteriorAfter: row.posterior_after, pairs: row.pairs,
    responses: (responseResult.data ?? []).map((answer) => mapAnswer(answer as unknown as SessionRow)),
    harmony: row.harmony, preference: row.preference, stopReason: row.stop_reason ?? null,
    createdAt: String(row.created_at), completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
  } as PersonalColorDrapeSessionV2;
  assertPersonalColorDrapeSessionV2(session);
  return session;
}

async function activeProfile(userId: string, consultationId: string) {
  const db = getSupabaseAdminClient();
  const active = await db.from("active_personal_color_profiles_v2").select("profile_id")
    .eq("user_id", userId).eq("consultation_id", consultationId).maybeSingle();
  if (active.error) throw new Error(active.error.message);
  const profileId = (active.data as { profile_id?: string } | null)?.profile_id;
  if (!profileId) throw new HairfitV2Error("PERSONAL_COLOR_PROFILE_REQUIRED", 409, "퍼스널 컬러 프로필이 먼저 필요합니다.");
  const profile = await db.from("personal_color_profiles_v2").select("id,profile,observation_bundle_id")
    .eq("id", profileId).eq("user_id", userId).eq("consultation_id", consultationId).maybeSingle();
  if (profile.error) throw new Error(profile.error.message);
  if (!profile.data) throw new HairfitV2Error("PERSONAL_COLOR_PROFILE_REQUIRED", 409, "활성 퍼스널 컬러 프로필을 찾지 못했습니다.");
  const row = profile.data as unknown as { id: string; profile: PersonalColorProfileV2; observation_bundle_id: string };
  assertPersonalColorProfileV2(row.profile);
  return row;
}

export async function createOrResumePersonalColorDrapeSession(userId: string, consultationId: string) {
  const db = getSupabaseAdminClient();
  const profile = await activeProfile(userId, consultationId);
  const existing = await db.from("personal_color_drape_sessions").select("*")
    .eq("user_id", userId).eq("consultation_id", consultationId).eq("personal_color_profile_id", profile.id)
    .in("status", ["active", "paused", "sufficient_confidence"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) {
    const session = await mapSession(existing.data as unknown as SessionRow);
    return { session, nextPair: nextDrapePairV2(session.pairs, session.responses), resumed: true };
  }
  const id = randomUUID();
  const pairs = buildDrapePairCatalogV2(id);
  const inserted = await db.from("personal_color_drape_sessions").insert({
    id, consultation_id: consultationId, user_id: userId, personal_color_profile_id: profile.id,
    source_profile_version: profile.profile.version, source_observation_bundle_id: profile.observation_bundle_id,
    status: "active", posterior_before: profile.profile.seasonalPosterior,
    posterior_after: profile.profile.seasonalPosterior, pairs,
  }).select("*").single();
  if (inserted.error) throw new Error(inserted.error.message);
  const session = await mapSession(inserted.data as unknown as SessionRow);
  return { session, nextPair: nextDrapePairV2(session.pairs, session.responses), resumed: false };
}

export async function readPersonalColorDrapeSession(userId: string, consultationId: string, sessionId: string) {
  const result = await getSupabaseAdminClient().from("personal_color_drape_sessions").select("*")
    .eq("id", sessionId).eq("consultation_id", consultationId).eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? mapSession(result.data as unknown as SessionRow) : null;
}

export async function answerPersonalColorDrape(input: {
  userId: string;
  consultationId: string;
  sessionId: string;
  expectedRevision: number;
  pairId: string;
  response: PersonalColorDrapeResponseV2;
  preference: PersonalColorDrapePreferenceV2;
}) {
  const session = await readPersonalColorDrapeSession(input.userId, input.consultationId, input.sessionId);
  if (!session) throw new HairfitV2Error("DRAPE_SESSION_NOT_FOUND", 404, "드레이프 검증 세션을 찾지 못했습니다.");
  const previous = session.responses.filter((answer) => answer.pairId === input.pairId).sort((a, b) => b.revision - a.revision)[0];
  const answer: PersonalColorDrapeAnswerV2 = {
    id: randomUUID(), pairId: input.pairId, revision: (previous?.revision ?? 0) + 1,
    response: input.response, preference: input.preference, supersedesResponseId: previous?.id ?? null,
    createdAt: new Date().toISOString(),
  };
  const projectedAnswers = [...session.responses, answer];
  const posterior = updateDrapePosteriorV2(session.posteriorBefore, session.pairs, projectedAnswers);
  const harmony = deriveDrapeHarmonyV2(session.pairs, projectedAnswers);
  const preference = deriveDrapePreferenceV2(session.pairs, projectedAnswers);
  const stopReason = drapeStopReasonV2(posterior, projectedAnswers);
  const applied = await getSupabaseAdminClient().rpc("append_personal_color_drape_response", {
    p_user_id: input.userId, p_session_id: input.sessionId, p_expected_revision: input.expectedRevision,
    p_pair_id: input.pairId, p_response: input.response, p_preference: input.preference,
    p_posterior_after: posterior, p_harmony: harmony, p_preference_profile: preference, p_terminal_reason: stopReason,
  });
  if (applied.error) throw new Error(applied.error.message);
  const state = applied.data as { state?: string } | null;
  if (state?.state === "conflict") throw new HairfitV2Error("DRAPE_REVISION_CONFLICT", 409, "다른 화면에서 응답이 변경되었습니다. 다시 불러와 주세요.");
  if (state?.state === "invalidated") throw new HairfitV2Error("DRAPE_PROFILE_INVALIDATED", 409, "퍼스널 컬러 원본 프로필이 변경되어 검증을 다시 시작해야 합니다.");
  const updated = await readPersonalColorDrapeSession(input.userId, input.consultationId, input.sessionId);
  if (!updated) throw new Error("DRAPE_SESSION_DISAPPEARED");
  return { session: updated, nextPair: nextDrapePairV2(updated.pairs, updated.responses) };
}

async function confirmDerivedProfile(userId: string, session: PersonalColorDrapeSessionV2) {
  const db = getSupabaseAdminClient();
  const sourceResult = await db.from("personal_color_profiles_v2").select("profile,observation_bundle_id")
    .eq("id", session.personalColorProfileId).eq("user_id", userId).maybeSingle();
  if (sourceResult.error) throw new Error(sourceResult.error.message);
  if (!sourceResult.data) throw new Error("DRAPE_SOURCE_PROFILE_MISSING");
  const source = (sourceResult.data as unknown as { profile: PersonalColorProfileV2; observation_bundle_id: string }).profile;
  const versionResult = await db.from("personal_color_profiles_v2").select("profile_version")
    .eq("consultation_id", session.consultationId).eq("user_id", userId)
    .order("profile_version", { ascending: false }).limit(1).maybeSingle();
  if (versionResult.error) throw new Error(versionResult.error.message);
  const now = new Date().toISOString();
  const profile: PersonalColorProfileV2 = {
    ...source,
    id: randomUUID(),
    version: Number((versionResult.data as { profile_version?: number } | null)?.profile_version ?? source.version) + 1,
    status: "confirmed",
    seasonalPosterior: session.posteriorAfter,
    preferenceProfile: session.preference,
    confidence: {
      ...source.confidence,
      overall: Math.min(1, (source.confidence.overall + (session.posteriorAfter[0]?.probability ?? 0)) / 2),
      typeConfidence: session.posteriorAfter[0]?.probability ?? 0,
    },
    modelManifest: { ...source.modelManifest, posteriorVersion: `${source.modelManifest.posteriorVersion}+drape-likelihood-v1`, createdAt: now },
    drapeValidatedAt: now,
    confirmedAt: now,
    createdAt: now,
    legacyProjectionHash: null,
  };
  const projection = projectLegacyPersonalColorV2(profile);
  profile.legacyProjectionHash = hashPersonalColorProjection(projection);
  assertPersonalColorProfileV2(profile);
  const inserted = await db.from("personal_color_profiles_v2").insert({
    id: profile.id, consultation_id: session.consultationId, user_id: userId,
    observation_bundle_id: sourceResult.data.observation_bundle_id,
    profile_version: profile.version, status: profile.status, capture_mode: profile.captureMode,
    profile, legacy_projection: projection, legacy_projection_hash: profile.legacyProjectionHash,
    profile_model: profile.modelManifest.profileModel, axis_policy_version: profile.modelManifest.axisPolicyVersion,
    posterior_version: profile.modelManifest.posteriorVersion, palette_version: profile.modelManifest.paletteVersion,
    drape_validated_at: now, confirmed_at: now, created_at: now,
  });
  if (inserted.error) throw new Error(inserted.error.message);
  const activated = await db.rpc("activate_personal_color_profile_v2", { p_user_id: userId, p_profile_id: profile.id });
  if (activated.error) throw new Error(activated.error.message);
  return profile;
}

export async function completePersonalColorDrape(input: {
  userId: string;
  consultationId: string;
  sessionId: string;
  expectedRevision: number;
  abandon: boolean;
}) {
  const completed = await getSupabaseAdminClient().rpc("complete_personal_color_drape_session", {
    p_user_id: input.userId, p_session_id: input.sessionId,
    p_expected_revision: input.expectedRevision, p_abandon: input.abandon,
  });
  if (completed.error) throw new Error(completed.error.message);
  const state = completed.data as { state?: string; idempotentReplay?: boolean } | null;
  if (state?.state === "conflict") throw new HairfitV2Error("DRAPE_REVISION_CONFLICT", 409, "드레이프 응답이 변경되었습니다. 다시 불러와 주세요.");
  if (state?.state === "invalidated") throw new HairfitV2Error("DRAPE_PROFILE_INVALIDATED", 409, "원본 프로필이 변경되어 이 세션을 확정할 수 없습니다.");
  const session = await readPersonalColorDrapeSession(input.userId, input.consultationId, input.sessionId);
  if (!session) throw new Error("DRAPE_SESSION_DISAPPEARED");
  if (state?.idempotentReplay) return { session, profile: null };
  const profile = input.abandon ? null : await confirmDerivedProfile(input.userId, session);
  return { session, profile };
}
