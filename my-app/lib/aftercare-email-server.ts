import "server-only";

import { buildAftercareEmailItems } from "./aftercare-email";
import { getSiteUrl } from "./site-url";
import { getSupabaseAdminClient } from "./supabase";

function emailBaseUrl() {
  const configured = getSiteUrl();
  return /^https:\/\//i.test(configured) ? configured : "https://hairfit.beauty";
}

export async function enqueueAftercareEmailProgram(input: {
  actualServiceId: string;
  consultationId: string;
  programVersion: number;
  serviceDate: string;
  styleName?: string;
  services?: string[];
  today?: unknown;
  checkpoints?: unknown;
  concerns?: unknown;
}) {
  const items = buildAftercareEmailItems({ ...input, baseUrl: emailBaseUrl() });
  const result = await getSupabaseAdminClient().rpc("enqueue_aftercare_email_program", {
    p_actual_service_id: input.actualServiceId,
    p_source_program_version: input.programVersion,
    p_items: items,
  });
  if (result.error) throw new Error(result.error.message);
  return { programId: String(result.data), items };
}

export async function getAftercareEmailPreference(userId: string, actualServiceId: string) {
  const result = await getSupabaseAdminClient()
    .from("aftercare_email_programs")
    .select("status,paused_at,resumed_at,updated_at")
    .eq("user_id", userId)
    .eq("actual_service_id", actualServiceId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? {
    status: result.data.status === "paused" ? "paused" as const : "active" as const,
    pausedAt: typeof result.data.paused_at === "string" ? result.data.paused_at : null,
    resumedAt: typeof result.data.resumed_at === "string" ? result.data.resumed_at : null,
    updatedAt: typeof result.data.updated_at === "string" ? result.data.updated_at : null,
  } : null;
}

export async function setAftercareEmailPreference(input: {
  userId: string;
  actualServiceId: string;
  status: "active" | "paused";
}) {
  const result = await getSupabaseAdminClient().rpc("set_aftercare_email_program_status", {
    p_user_id: input.userId,
    p_actual_service_id: input.actualServiceId,
    p_status: input.status,
  });
  if (result.error) throw new Error(result.error.message);
  return getAftercareEmailPreference(input.userId, input.actualServiceId);
}
