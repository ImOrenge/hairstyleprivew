import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "./supabase";
import { HairfitV2Error } from "./v2/errors";
import { recordV2Event } from "./v2/observability";

export const PERSONAL_COLOR_TRAINING_CONSENT_VERSION = "personal-color-training-v1";
const CONSENT_COPY = "HairFit may use explicitly opted-in Personal Color captures and derived evidence to evaluate and improve Personal Color policies. Product diagnosis does not require this consent, and revocation stops future training use.";
const CONSENT_TEXT_HASH = createHash("sha256").update(CONSENT_COPY).digest("hex");

async function assertOwner(userId: string, consultationId: string) {
  const result = await getSupabaseAdminClient().from("consultation_sessions").select("id")
    .eq("id", consultationId).eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new HairfitV2Error("CONSULTATION_NOT_FOUND", 404, "상담을 찾지 못했습니다.");
}

export async function readPersonalColorTrainingConsent(userId: string, consultationId: string) {
  await assertOwner(userId, consultationId);
  const result = await getSupabaseAdminClient().from("personal_color_training_consent_events")
    .select("id,consent_version,action,created_at").eq("user_id", userId).eq("consultation_id", consultationId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  const row = result.data as { id: string; consent_version: string; action: "granted" | "revoked"; created_at: string } | null;
  return {
    consentVersion: PERSONAL_COLOR_TRAINING_CONSENT_VERSION,
    granted: row?.action === "granted",
    lastActionAt: row?.created_at ?? null,
    productUseIndependent: true,
    sourceAssetsEnrolled: false,
  };
}

export async function writePersonalColorTrainingConsent(input: { userId: string; consultationId: string; action: "granted" | "revoked"; consentVersion: string; idempotencyKey: string }) {
  if (input.consentVersion !== PERSONAL_COLOR_TRAINING_CONSENT_VERSION) throw new HairfitV2Error("TRAINING_CONSENT_VERSION_INVALID", 400, "학습 동의 버전이 올바르지 않습니다.");
  if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 160) throw new HairfitV2Error("IDEMPOTENCY_KEY_INVALID", 400, "멱등성 키가 올바르지 않습니다.");
  await assertOwner(input.userId, input.consultationId);
  const current = await readPersonalColorTrainingConsent(input.userId, input.consultationId);
  if (current.granted === (input.action === "granted")) return current;
  const result = await getSupabaseAdminClient().from("personal_color_training_consent_events").insert({
    id: randomUUID(), consultation_id: input.consultationId, user_id: input.userId,
    consent_version: PERSONAL_COLOR_TRAINING_CONSENT_VERSION, consent_text_hash: CONSENT_TEXT_HASH,
    action: input.action, idempotency_key: input.idempotencyKey,
  });
  if (result.error && result.error.code !== "23505") throw new Error(result.error.message);
  await recordV2Event({ consultationId: input.consultationId, userId: input.userId, eventType: `personal_color.training_consent.${input.action}`, payload: { state: input.action, schemaVersion: PERSONAL_COLOR_TRAINING_CONSENT_VERSION } });
  return readPersonalColorTrainingConsent(input.userId, input.consultationId);
}
