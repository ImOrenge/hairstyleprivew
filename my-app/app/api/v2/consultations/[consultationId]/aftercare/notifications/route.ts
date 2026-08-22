import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAftercareEmailPreference, setAftercareEmailPreference } from "../../../../../../../lib/aftercare-email-server";
import { getLatestAftercareStateV2 } from "../../../../../../../lib/v2/outputs-server";
import { v2Disabled, v2Failure } from "../../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }

async function ownedActualService(userId: string, consultationId: string, requested?: string) {
  const state = await getLatestAftercareStateV2(userId, consultationId);
  const actualServiceId = requested || state.program?.actualServiceId || "";
  if (!actualServiceId || state.program?.actualServiceId !== actualServiceId) {
    throw new Error("에프터케어 알림 프로그램을 찾을 수 없습니다.");
  }
  return actualServiceId;
}

export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "SALON_BRIEF_V2_ENABLED");
  if (disabled) return disabled;
  const { consultationId } = await params;
  try {
    const actualServiceId = await ownedActualService(userId, consultationId);
    return NextResponse.json({ notification: await getAftercareEmailPreference(userId, actualServiceId) });
  } catch (error) {
    return v2Failure(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "SALON_BRIEF_V2_ENABLED");
  if (disabled) return disabled;
  const { consultationId } = await params;
  const body = (await request.json().catch(() => ({}))) as { actualServiceId?: unknown; action?: unknown };
  if ((body.action !== "pause" && body.action !== "resume") || typeof body.actualServiceId !== "string") {
    return NextResponse.json({ error: "알림 상태 변경 요청을 확인해 주세요." }, { status: 400 });
  }
  try {
    const actualServiceId = await ownedActualService(userId, consultationId, body.actualServiceId);
    const notification = await setAftercareEmailPreference({
      userId,
      actualServiceId,
      status: body.action === "pause" ? "paused" : "active",
    });
    return NextResponse.json({ notification });
  } catch (error) {
    return v2Failure(error);
  }
}
