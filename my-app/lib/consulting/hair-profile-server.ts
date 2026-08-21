import "server-only";

import { randomUUID } from "node:crypto";
import type { CapabilityResult } from "@hairfit/shared/consulting/capability";
import { HAIR_TRAIT_IDS, selectAdaptiveHairQuestions, type DiagnosticQuestionInstanceV1, type HairProfileV2, type HairTraitAnalysisRunV1 } from "@hairfit/shared/consulting/hair-profile";
import { getSupabaseAdminClient } from "../supabase";
import type { HairTraitProviderOutput } from "./hair-trait-provider";
import { HairfitV2Error } from "../v2/errors";
import { isMissingOptionalTableError } from "./supabase-errors";

function now() { return new Date().toISOString(); }

function mapRun(row: Record<string, unknown>): HairTraitAnalysisRunV1 {
  return {
    id: String(row.id), consultationId: String(row.consultation_id), state: row.state as HairTraitAnalysisRunV1["state"],
    sourceFingerprint: String(row.source_fingerprint), sourceAssetIds: (row.source_asset_ids as string[]) ?? [],
    model: (row.model as HairTraitAnalysisRunV1["model"]) ?? null,
    pipeline: row.pipeline as HairTraitAnalysisRunV1["pipeline"], completedTraitCount: Number(row.completed_trait_count ?? 0), totalTraitCount: Number(row.total_trait_count ?? HAIR_TRAIT_IDS.length),
    attemptCount: Number(row.attempt_count ?? 1), leaseOwner: row.lease_owner ? String(row.lease_owner) : null, leaseExpiresAt: row.lease_expires_at ? String(row.lease_expires_at) : null,
    fencingToken: Number(row.fencing_token ?? 0), errorCode: row.error_code ? String(row.error_code) : null, errorMessage: row.error_message ? String(row.error_message) : null,
    startedAt: row.started_at ? String(row.started_at) : null, updatedAt: String(row.updated_at), completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

function mapProfile(row: Record<string, unknown>): HairProfileV2 {
  return {
    schemaVersion: "hair-profile-v2", id: String(row.id), consultationId: String(row.consultation_id), revision: Number(row.revision),
    state: row.state as HairProfileV2["state"], sourceFingerprint: String(row.source_fingerprint), observed: (row.observed as HairProfileV2["observed"]) ?? [],
    reported: (row.reported as HairProfileV2["reported"]) ?? {}, inferred: (row.inferred as HairProfileV2["inferred"]) ?? {}, unknownFieldIds: (row.unknown_field_ids as string[]) ?? [],
    conflicts: (row.conflicts as HairProfileV2["conflicts"]) ?? [], unresolvedFieldIds: (row.unresolved_field_ids as string[]) ?? [],
    questionBudget: (row.question_budget as HairProfileV2["questionBudget"]) ?? { preResultUsed: 0, postResultUsed: 0, maximum: 2 },
    confirmedRevision: row.confirmed_revision == null ? null : Number(row.confirmed_revision), supersedesProfileId: row.supersedes_profile_id ? String(row.supersedes_profile_id) : null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function mapQuestion(row: Record<string, unknown>): DiagnosticQuestionInstanceV1 {
  return {
    id: String(row.id), templateId: String(row.template_id), consultationId: String(row.consultation_id), analysisRunId: String(row.analysis_run_id),
    profileRevision: Number(row.profile_revision), queue: row.queue as DiagnosticQuestionInstanceV1["queue"], state: row.state as DiagnosticQuestionInstanceV1["state"],
    reasonCode: String(row.reason_code), evidenceIds: (row.evidence_ids as string[]) ?? [], prompt: String(row.prompt),
    options: (row.options as DiagnosticQuestionInstanceV1["options"]) ?? [], answer: (row.answer as DiagnosticQuestionInstanceV1["answer"]) ?? null,
    createdAt: String(row.created_at), resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
  };
}

export async function persistHairTraitCapabilityResult(input: {
  userId: string; consultationId: string; sourceAssetId: string; sourceFingerprint: string;
  result: CapabilityResult<HairTraitProviderOutput>;
}) {
  const db = getSupabaseAdminClient();
  const timestamp = now();
  const completed = input.result.state === "completed" ? input.result.output : null;
  const runId = randomUUID();
  const runPayload = {
    id: runId, consultation_id: input.consultationId, user_id: input.userId, capability_task_id: input.result.taskId,
    state: completed ? "completed" : "failed", source_fingerprint: input.sourceFingerprint, source_asset_ids: [input.sourceAssetId],
    model: completed?.model ?? null,
    pipeline: completed
      ? { preflight: "complete", segmentation: "complete", extraction: "complete", reconciliation: "complete" }
      : { preflight: "complete", segmentation: "failed", extraction: "pending", reconciliation: "pending" },
    completed_trait_count: completed?.observations.length ?? 0, total_trait_count: HAIR_TRAIT_IDS.length,
    attempt_count: 1, error_code: input.result.failure?.code ?? null, error_message: input.result.failure?.message ?? null,
    started_at: input.result.createdAt, completed_at: completed ? timestamp : null, updated_at: timestamp,
  };
  const insertedRun = await db.from("hair_trait_analysis_runs_v2").upsert(runPayload, { onConflict: "consultation_id,source_fingerprint" }).select("*").single();
  if (insertedRun.error) throw new Error(insertedRun.error.message);
  const run = mapRun(insertedRun.data as unknown as Record<string, unknown>);
  if (!completed) return { run, profile: null, questions: [] as DiagnosticQuestionInstanceV1[] };

  const existing = await db.from("hair_profiles_v2").select("*").eq("consultation_id", input.consultationId).eq("user_id", input.userId).eq("source_fingerprint", input.sourceFingerprint).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  let profile = existing.data ? mapProfile(existing.data as unknown as Record<string, unknown>) : null;
  if (!profile) {
    const profileId = randomUUID();
    const unknownFieldIds = HAIR_TRAIT_IDS.filter((traitId) => !completed.observations.some((item) => item.traitId === traitId));
    const seed: HairProfileV2 = {
      schemaVersion: "hair-profile-v2", id: profileId, consultationId: input.consultationId, revision: 1,
      state: completed.observations.length ? "clarification_available" : "attention", sourceFingerprint: input.sourceFingerprint,
      observed: completed.observations, reported: {}, inferred: {}, unknownFieldIds, conflicts: [], unresolvedFieldIds: unknownFieldIds,
      questionBudget: { preResultUsed: 0, postResultUsed: 0, maximum: 2 }, confirmedRevision: null, supersedesProfileId: null, createdAt: timestamp, updatedAt: timestamp,
    };
    const created = await db.from("hair_profiles_v2").insert({
      id: seed.id, consultation_id: seed.consultationId, user_id: input.userId, revision: seed.revision, state: seed.state,
      source_fingerprint: seed.sourceFingerprint, observed: seed.observed, reported: seed.reported, inferred: seed.inferred,
      unknown_field_ids: seed.unknownFieldIds, conflicts: seed.conflicts, unresolved_field_ids: seed.unresolvedFieldIds,
      question_budget: seed.questionBudget, confirmed_revision: null, supersedes_profile_id: null, created_at: timestamp, updated_at: timestamp,
    }).select("*").single();
    if (created.error) throw new Error(created.error.message);
    profile = mapProfile(created.data as unknown as Record<string, unknown>);
  }
  const selected = selectAdaptiveHairQuestions({ profile });
  if (selected.length) {
    const rows = selected.map((template) => ({
      id: randomUUID(), template_id: template.id, consultation_id: input.consultationId, user_id: input.userId,
      analysis_run_id: run.id, profile_id: profile!.id, profile_revision: profile!.revision, queue: template.queue, state: "visible",
      reason_code: `missing_or_low_confidence:${template.targetFieldId}`, evidence_ids: [], prompt: template.prompt, options: template.options,
      answer: null, created_at: timestamp, resolved_at: null,
    }));
    const created = await db.from("hair_diagnostic_questions_v2").insert(rows);
    if (created.error && created.error.code !== "23505") throw new Error(created.error.message);
  }
  const state = await readHairDiagnosisState(input.userId, input.consultationId);
  return { run: state.run ?? run, profile: state.profile ?? profile, questions: state.questions };
}

export async function readHairDiagnosisState(userId: string, consultationId: string) {
  const db = getSupabaseAdminClient();
  const [runResult, profileResult, questionResult] = await Promise.all([
    db.from("hair_trait_analysis_runs_v2").select("*").eq("consultation_id", consultationId).eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("hair_profiles_v2").select("*").eq("consultation_id", consultationId).eq("user_id", userId).order("revision", { ascending: false }).limit(1).maybeSingle(),
    db.from("hair_diagnostic_questions_v2").select("*").eq("consultation_id", consultationId).eq("user_id", userId).in("state", ["visible", "answered", "unknown", "skipped", "salon_confirmation"]).order("created_at", { ascending: true }),
  ]);
  if ([runResult, profileResult, questionResult].some((result) => result.error && isMissingOptionalTableError(result.error))) {
    return { run: null, profile: null, questions: [] as DiagnosticQuestionInstanceV1[] };
  }
  for (const result of [runResult, profileResult, questionResult]) if (result.error) throw new Error(result.error.message);
  return {
    run: runResult.data ? mapRun(runResult.data as unknown as Record<string, unknown>) : null,
    profile: profileResult.data ? mapProfile(profileResult.data as unknown as Record<string, unknown>) : null,
    questions: (questionResult.data ?? []).map((row) => mapQuestion(row as unknown as Record<string, unknown>)),
  };
}

export async function answerHairDiagnosticQuestion(input: { userId: string; consultationId: string; questionId: string; expectedRevision: number; value: unknown; state?: "answered" | "unknown" | "skipped" | "salon_confirmation" }) {
  const db = getSupabaseAdminClient();
  const current = await readHairDiagnosisState(input.userId, input.consultationId);
  if (!current.profile || current.profile.revision !== input.expectedRevision) throw new HairfitV2Error("HAIR_PROFILE_REVISION_CONFLICT", 409, "모질 분석 답변 버전이 변경되었습니다. 다시 불러와 주세요.");
  const question = current.questions.find((item) => item.id === input.questionId && item.state === "visible");
  if (!question) throw new HairfitV2Error("HAIR_DIAGNOSTIC_QUESTION_NOT_FOUND", 404, "확인할 질문을 찾을 수 없습니다.");
  const timestamp = now();
  const answer = { value: input.value, answeredAt: timestamp, source: "user" as const };
  const nextState = input.state ?? "answered";
  const mutation = await db.rpc("answer_hair_diagnostic_question_v2", {
    p_user_id: input.userId,
    p_consultation_id: input.consultationId,
    p_question_id: question.id,
    p_expected_revision: input.expectedRevision,
    p_answer: answer,
    p_state: nextState,
  });
  if (mutation.error) {
    if (mutation.error.message.includes("HAIR_PROFILE_REVISION_CONFLICT")) throw new HairfitV2Error("HAIR_PROFILE_REVISION_CONFLICT", 409, "모질 분석 답변 버전이 변경되었습니다. 다시 불러와 주세요.");
    throw new Error(mutation.error.message);
  }
  return readHairDiagnosisState(input.userId, input.consultationId);
}
