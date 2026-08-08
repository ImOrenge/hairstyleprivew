import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { ConsultationKindV2 } from "@hairfit/shared/v2";
import { createConsultationV2 } from "../../../../lib/v2/consultation-server";
import { isHairfitV2Enabled } from "../../../../lib/v2/feature-flags";
import { v2Failure } from "../../../../lib/v2/http";

const KINDS: ConsultationKindV2[] = ["hair_decision", "full_style", "seasonal_update"];

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isHairfitV2Enabled("CONSULTATION_SESSION_V2_ENABLED")) {
    return NextResponse.json({ error: "V2 consultations are disabled." }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const sessionKind = KINDS.includes(body.sessionKind as ConsultationKindV2)
    ? body.sessionKind as ConsultationKindV2
    : "hair_decision";
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ||
    (typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "");
  try {
    const session = await createConsultationV2({
      userId,
      sessionKind,
      idempotencyKey,
      preferences: body.preferences && typeof body.preferences === "object" ? body.preferences as Record<string, unknown> : {},
      planSnapshot: body.planSnapshot && typeof body.planSnapshot === "object" ? body.planSnapshot as Record<string, unknown> : {},
    });
    return NextResponse.json({ consultation: session }, { status: 201 });
  } catch (error) { return v2Failure(error); }
}
