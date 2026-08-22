import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getLatestAftercareStateV2, recordActualServiceAndAftercareV2, updateAftercareProgramV2 } from "../../../../../../lib/v2/outputs-server";
import { getAftercareEmailPreference } from "../../../../../../lib/aftercare-email-server";
import { v2Disabled, v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }
export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "SALON_BRIEF_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  try {
    const state = await getLatestAftercareStateV2(userId, consultationId);
    const notification = state.program?.actualServiceId
      ? await getAftercareEmailPreference(userId, state.program.actualServiceId)
      : null;
    return NextResponse.json({ ...state, notification });
  }
  catch (error) { return v2Failure(error); }
}

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "SALON_BRIEF_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || "";
  const body = (await request.json().catch(() => ({}))) as { services?: unknown; serviceDate?: unknown; designerNotes?: unknown; today?: unknown; checkpoints?: unknown; concerns?: unknown; satisfaction?: unknown };
  if (!Array.isArray(body.services) || !body.services.every((item) => typeof item === "string") || typeof body.serviceDate !== "string") {
    return NextResponse.json({ error: "services와 serviceDate를 확인해 주세요." }, { status: 400 });
  }
  try {
    return NextResponse.json({ program: await recordActualServiceAndAftercareV2({
      userId, consultationId, idempotencyKey, services: body.services as string[], serviceDate: body.serviceDate,
      designerNotes: typeof body.designerNotes === "string" ? body.designerNotes : "",
      today: body.today,
      checkpoints: body.checkpoints,
      concerns: body.concerns,
      satisfaction: body.satisfaction,
    }) }, { status: 201 });
  } catch (error) { return v2Failure(error); }
}

export async function PATCH(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "SALON_BRIEF_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || "";
  const body = (await request.json().catch(() => ({}))) as { actualServiceId?: unknown; expectedVersion?: unknown; today?: unknown; checkpoints?: unknown; concerns?: unknown; satisfaction?: unknown };
  try {
    return NextResponse.json({ program: await updateAftercareProgramV2({
      userId,
      consultationId,
      actualServiceId: typeof body.actualServiceId === "string" ? body.actualServiceId : "",
      expectedVersion: typeof body.expectedVersion === "number" ? body.expectedVersion : -1,
      idempotencyKey,
      today: body.today,
      checkpoints: body.checkpoints,
      concerns: body.concerns,
      satisfaction: body.satisfaction,
    }) });
  } catch (error) { return v2Failure(error); }
}
