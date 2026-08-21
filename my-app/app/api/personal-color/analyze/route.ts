import { auth } from "@clerk/nextjs/server";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { runPersonalColorCapability } from "../../../../lib/capabilities/personal-color-service";
import {
  ensureCurrentUserProfile,
  type ServerSupabaseLike,
} from "../../../../lib/style-profile-server";
import { getSupabaseAdminClient } from "../../../../lib/supabase";
import { buildLegacyPersonalColorSuccessResponse, validateLegacyPersonalColorAnalyzeRequest } from "../../../../lib/personal-color-legacy-contract";
import { comparePersonalColorProjectionHashes } from "../../../../lib/personal-color-projection";
import { materializeLegacyPersonalColorCapture } from "../../../../lib/personal-color-capture";
import { isHairfitV2Enabled } from "../../../../lib/v2/feature-flags";
import { recordV2Event } from "../../../../lib/v2/observability";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const validation = validateLegacyPersonalColorAnalyzeRequest(await request.json().catch(() => ({})));
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
  const { referenceImageDataUrl } = validation;

  const supabase = getSupabaseAdminClient() as unknown as ServerSupabaseLike;
  const ensured = await ensureCurrentUserProfile(userId, supabase);
  if (ensured.error) {
    return NextResponse.json({ error: ensured.error.message }, { status: 500 });
  }

  try {
    const sourceImageFingerprint = createHash("sha256").update(referenceImageDataUrl).digest("hex");
    if (isHairfitV2Enabled("PERSONAL_COLOR_V2_WRITE")) {
      const materialized = await materializeLegacyPersonalColorCapture(userId, referenceImageDataUrl);
      await recordV2Event({
        userId,
        eventType: "personal_color.legacy_capture_materialized",
        payload: {
          state: materialized.asset.status,
          receiptState: materialized.idempotentReplay ? "replayed" : "created",
          coverageCount: Object.values(materialized.asset.quality?.usableAxes ?? {}).filter(Boolean).length,
          rejectionCodes: materialized.asset.quality?.blockers.map((item) => item.code) ?? [],
        },
      });
    }
    const capability = await runPersonalColorCapability({
      consultationId: `legacy-personal-color:${userId}`,
      idempotencyKey: request.headers.get("Idempotency-Key")?.trim() || `personal-color:${userId}:${sourceImageFingerprint}`,
      referenceImageDataUrl,
      sourceImageFingerprint,
    });
    if (!capability.output || capability.failure) {
      return NextResponse.json({ error: capability.failure?.message || "Personal color analysis failed" }, { status: 502 });
    }
    const personalColor = capability.output;
    const { error } = await supabase
      .from("user_style_profiles")
      .upsert(
        {
          user_id: userId,
          personal_color_tone: personalColor.tone,
          personal_color_contrast: personalColor.contrast,
          personal_color_result: personalColor,
          personal_color_model: personalColor.model,
          personal_color_diagnosed_at: personalColor.diagnosedAt,
        },
        { onConflict: "user_id" },
      )
      .select("user_id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (isHairfitV2Enabled("PERSONAL_COLOR_V2_WRITE")) {
      const comparison = comparePersonalColorProjectionHashes(personalColor, null);
      await recordV2Event({
        userId,
        eventType: "personal_color.legacy_projection_recorded",
        payload: { ...comparison, projectionHash: comparison.legacyProjectionHash, schemaVersion: "legacy-personal-color-v1" },
      });
    }

    return NextResponse.json(buildLegacyPersonalColorSuccessResponse(personalColor, capability), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Personal color analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
