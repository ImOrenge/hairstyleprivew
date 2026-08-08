import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { recordActualServiceAndAftercareV2 } from "../../../../../../lib/v2/outputs-server";
import { v2Disabled, v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }
export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "SALON_BRIEF_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || "";
  const body = (await request.json().catch(() => ({}))) as { services?: unknown; serviceDate?: unknown; designerNotes?: unknown };
  if (!Array.isArray(body.services) || !body.services.every((item) => typeof item === "string") || typeof body.serviceDate !== "string") {
    return NextResponse.json({ error: "services와 serviceDate를 확인해 주세요." }, { status: 400 });
  }
  try {
    return NextResponse.json({ program: await recordActualServiceAndAftercareV2({
      userId, consultationId, idempotencyKey, services: body.services as string[], serviceDate: body.serviceDate,
      designerNotes: typeof body.designerNotes === "string" ? body.designerNotes : "",
    }) }, { status: 201 });
  } catch (error) { return v2Failure(error); }
}
