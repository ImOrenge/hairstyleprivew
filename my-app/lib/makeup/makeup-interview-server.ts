import "server-only";

import {
  MAKEUP_INTERVIEW_REQUIRED_TOPICS,
  MAKEUP_INTERVIEW_TOPICS,
  assertMakeupInterviewProfileV2,
  compileMakeupRecommendationRationaleV1,
  defaultMakeupInterviewProfile,
  isMakeupInterviewComplete,
  makeupContextFromInterview,
  type MakeupInterviewProfileV2,
  type MakeupInterviewTopic,
  type MakeupRecommendationRationaleV1,
} from "@hairfit/shared/makeup";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "../v2/errors";
import { recordV2Event } from "../v2/observability";
import { buildMakeupDirection, defaultMakeupContext, readMakeupRationaleSources, saveMakeupContext } from "./makeup-direction-server";
import { readMakeupRationaleCapability, retryMakeupRationaleCapability, runMakeupRationaleCapability } from "../capabilities/makeup-rationale-service";

type InterviewRow = { revision: number; answers: { profile?: MakeupInterviewProfileV2 }; confirmed_revision: number | null; created_at: string; updated_at: string };
type DirectionRow = { id: string; revision: number; snapshot: { interviewProfile?: MakeupInterviewProfileV2; rationale?: MakeupRecommendationRationaleV1; [key: string]: unknown }; status: string };

async function assertOwner(userId: string, consultationId: string) {
  const result = await getSupabaseAdminClient().from("consultation_sessions").select("id").eq("id", consultationId).eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new HairfitV2Error("CONSULTATION_NOT_FOUND", 404, "상담을 찾지 못했습니다.");
}

async function row(userId: string, consultationId: string) {
  const result = await getSupabaseAdminClient().from("consultation_interview_drafts_v2").select("revision,answers,confirmed_revision,created_at,updated_at")
    .eq("user_id", userId).eq("consultation_id", consultationId).eq("interview_kind", "makeup-direction").maybeSingle();
  if (result.error && result.error.code !== "42P01") throw new Error(result.error.message);
  return result.data as unknown as InterviewRow | null;
}

async function latestDirection(userId: string, consultationId: string) {
  const result = await getSupabaseAdminClient().from("makeup_direction_snapshots").select("id,revision,snapshot,status")
    .eq("user_id", userId).eq("consultation_id", consultationId).neq("status", "superseded").order("snapshot_version", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as unknown as DirectionRow | null;
}

function coverage(profile: MakeupInterviewProfileV2) {
  return MAKEUP_INTERVIEW_TOPICS.map((topic) => ({
    topicId: topic,
    required: MAKEUP_INTERVIEW_REQUIRED_TOPICS.includes(topic),
    status: profile.completedTopics.includes(topic) ? "complete" as const : profile.skippedTopics.includes(topic) ? "skipped" as const : "pending" as const,
  }));
}

export async function readMakeupInterview(userId: string, consultationId: string) {
  await assertOwner(userId, consultationId);
  const [draft, direction, fallback] = await Promise.all([row(userId, consultationId), latestDirection(userId, consultationId), defaultMakeupContext(userId)]);
  const fromSnapshot = direction?.snapshot.interviewProfile;
  const profile = draft?.answers.profile ?? fromSnapshot ?? defaultMakeupInterviewProfile(fallback);
  assertMakeupInterviewProfileV2(profile);
  return { profile, coverage: coverage(profile), complete: isMakeupInterviewComplete(profile), confirmed: profile.confirmedRevision !== null, savedAt: draft?.updated_at ?? null };
}

export async function saveMakeupInterviewTopic(input: { userId: string; consultationId: string; expectedRevision: number; topic: MakeupInterviewTopic; profile: MakeupInterviewProfileV2; skip?: boolean }) {
  await assertOwner(input.userId, input.consultationId);
  if (!MAKEUP_INTERVIEW_TOPICS.includes(input.topic) || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new HairfitV2Error("MAKEUP_INTERVIEW_INPUT_INVALID", 400, "메이크업 인터뷰 입력이 올바르지 않습니다.");
  const existing = await row(input.userId, input.consultationId);
  const currentRevision = existing?.revision ?? 0;
  if (currentRevision !== input.expectedRevision) throw new HairfitV2Error("MAKEUP_INTERVIEW_REVISION_CONFLICT", 409, "다른 화면에서 답변이 변경되었습니다. 다시 불러와 주세요.");
  const completed = new Set(input.profile.completedTopics);
  const skipped = new Set(input.profile.skippedTopics);
  if (input.skip) { skipped.add(input.topic); completed.delete(input.topic); }
  else { completed.add(input.topic); skipped.delete(input.topic); }
  const next: MakeupInterviewProfileV2 = { ...input.profile, revision: currentRevision + 1, confirmedRevision: null, completedTopics: [...completed], skippedTopics: [...skipped] };
  assertMakeupInterviewProfileV2(next);
  const now = new Date().toISOString();
  const values = { answers: { profile: next }, coverage: coverage(next), skips: [...skipped].map((topic) => ({ questionId: topic, reason: "not_applicable", skippedAt: now })), confirmed_revision: null, revision: next.revision, updated_at: now };
  if (existing) {
    const updated = await getSupabaseAdminClient().from("consultation_interview_drafts_v2").update(values).eq("user_id", input.userId).eq("consultation_id", input.consultationId).eq("interview_kind", "makeup-direction").eq("revision", currentRevision).select("revision").maybeSingle();
    if (updated.error) throw new Error(updated.error.message);
    if (!updated.data) throw new HairfitV2Error("MAKEUP_INTERVIEW_REVISION_CONFLICT", 409, "다른 화면에서 답변이 변경되었습니다. 다시 불러와 주세요.");
  } else {
    const inserted = await getSupabaseAdminClient().from("consultation_interview_drafts_v2").insert({ consultation_id: input.consultationId, user_id: input.userId, interview_kind: "makeup-direction", ...values });
    if (inserted.error) throw new Error(inserted.error.message);
  }
  await recordV2Event({ consultationId: input.consultationId, userId: input.userId, eventType: "consultation.interview.topic_confirmed", payload: { interviewKind: "makeup-direction", topicId: input.topic, revision: next.revision, skipped: Boolean(input.skip) } });
  return { profile: next, coverage: coverage(next), complete: isMakeupInterviewComplete(next), confirmed: false, savedAt: now };
}

export async function confirmMakeupInterview(userId: string, consultationId: string, expectedRevision: number) {
  const draft = await row(userId, consultationId);
  const profile = draft?.answers.profile;
  if (!draft || !profile) throw new HairfitV2Error("MAKEUP_INTERVIEW_REQUIRED", 409, "메이크업 인터뷰를 먼저 완료해 주세요.");
  if (draft.revision !== expectedRevision) throw new HairfitV2Error("MAKEUP_INTERVIEW_REVISION_CONFLICT", 409, "답변 버전이 변경되었습니다. 다시 확인해 주세요.");
  if (!isMakeupInterviewComplete(profile)) throw new HairfitV2Error("MAKEUP_INTERVIEW_INCOMPLETE", 409, "필수 메이크업 질문을 완료해 주세요.");
  const confirmed: MakeupInterviewProfileV2 = { ...profile, confirmedRevision: profile.revision };
  const sources = await readMakeupRationaleSources(userId, consultationId);
  const rationale = compileMakeupRecommendationRationaleV1({ profile: confirmed, ...sources });
  const context = makeupContextFromInterview(confirmed, confirmed.primaryMode);
  const direction = await saveMakeupContext(userId, consultationId, context);
  const snapshot = { ...direction.snapshot, interviewProfile: confirmed, rationale };
  const updated = await getSupabaseAdminClient().from("makeup_direction_snapshots").update({ context, snapshot, revision: direction.revision + 1, updated_at: new Date().toISOString() }).eq("id", direction.snapshot.id).eq("user_id", userId).eq("revision", direction.revision).select("revision").maybeSingle();
  if (updated.error) throw new Error(updated.error.message);
  if (!updated.data) throw new HairfitV2Error("MAKEUP_REVISION_CONFLICT", 409, "메이크업 추천이 변경되었습니다. 다시 불러와 주세요.");
  const draftUpdated = await getSupabaseAdminClient().from("consultation_interview_drafts_v2").update({ answers: { profile: confirmed }, confirmed_revision: confirmed.revision, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("consultation_id", consultationId).eq("interview_kind", "makeup-direction").eq("revision", draft.revision);
  if (draftUpdated.error) throw new Error(draftUpdated.error.message);
  await recordV2Event({ consultationId, userId, eventType: "makeup.recommendation.proposed", payload: { requestedMode: rationale.requestedMode, suggestedMode: rationale.suggestedMode, adjustmentRequired: rationale.adjustmentRequired, rationaleRevision: rationale.revision } });
  return { profile: confirmed, rationale, revision: Number((updated.data as { revision: number }).revision) };
}

export async function decideMakeupRecommendation(input: { userId: string; consultationId: string; expectedRevision: number; decision: "accept_adjustment" | "keep_selection" }) {
  const direction = await latestDirection(input.userId, input.consultationId);
  const profile = direction?.snapshot.interviewProfile;
  const rationale = direction?.snapshot.rationale;
  if (!direction || !profile || !rationale) throw new HairfitV2Error("MAKEUP_RECOMMENDATION_REQUIRED", 409, "메이크업 추천을 먼저 준비해 주세요.");
  if (direction.revision !== input.expectedRevision) throw new HairfitV2Error("MAKEUP_REVISION_CONFLICT", 409, "메이크업 추천이 변경되었습니다. 다시 불러와 주세요.");
  const acceptedMode = input.decision === "accept_adjustment" ? rationale.suggestedMode : rationale.requestedMode;
  const nextRationale: MakeupRecommendationRationaleV1 = { ...rationale, acceptedMode, decision: input.decision };
  const context = makeupContextFromInterview(profile, acceptedMode);
  const snapshot = { ...direction.snapshot, context, rationale: nextRationale, status: "context_draft" };
  const updated = await getSupabaseAdminClient().from("makeup_direction_snapshots").update({ context, snapshot, status: "context_draft", revision: direction.revision + 1, updated_at: new Date().toISOString() }).eq("id", direction.id).eq("user_id", input.userId).eq("revision", direction.revision).select("revision").maybeSingle();
  if (updated.error) throw new Error(updated.error.message);
  if (!updated.data) throw new HairfitV2Error("MAKEUP_REVISION_CONFLICT", 409, "메이크업 추천이 변경되었습니다. 다시 불러와 주세요.");
  await recordV2Event({ consultationId: input.consultationId, userId: input.userId, eventType: "makeup.recommendation.decided", payload: { decision: input.decision, requestedMode: rationale.requestedMode, acceptedMode, rationaleRevision: rationale.revision } });
  return buildMakeupDirection(input.userId, input.consultationId, Number((updated.data as { revision: number }).revision));
}

async function currentRationale(userId: string, consultationId: string) {
  await assertOwner(userId, consultationId);
  const direction = await latestDirection(userId, consultationId);
  const rationale = direction?.snapshot.rationale;
  if (!rationale) throw new HairfitV2Error("MAKEUP_RECOMMENDATION_REQUIRED", 409, "메이크업 추천을 먼저 준비해 주세요.");
  return rationale;
}

export async function dispatchMakeupRationale(userId: string, consultationId: string) {
  const rationale = await currentRationale(userId, consultationId);
  return runMakeupRationaleCapability({ userId, consultationId, rationale });
}

export async function readCurrentMakeupRationale(userId: string, consultationId: string) {
  const rationale = await currentRationale(userId, consultationId);
  return readMakeupRationaleCapability({ userId, rationale });
}

export async function retryCurrentMakeupRationale(userId: string, consultationId: string) {
  const rationale = await currentRationale(userId, consultationId);
  return retryMakeupRationaleCapability({ userId, consultationId, rationale });
}
