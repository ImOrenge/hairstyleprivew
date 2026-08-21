import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { completePersonalColorDrape } from "../../../../../../../../lib/personal-color-drape-server";
import { isHairfitV2Enabled } from "../../../../../../../../lib/v2/feature-flags";
import { v2Failure } from "../../../../../../../../lib/v2/http";

interface Params { params: Promise<{ sessionId: string; drapeId: string }> }
export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isHairfitV2Enabled("PERSONAL_COLOR_DRAPE_V1")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { sessionId, drapeId } = await params;
  const body = (await request.json().catch(() => null)) as { expectedRevision?: number; abandon?: boolean } | null;
  if (!body || !Number.isInteger(body.expectedRevision) || typeof body.abandon !== "boolean") {
    return NextResponse.json({ error: "완료 요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  try {
    return NextResponse.json(await completePersonalColorDrape({
      userId, consultationId: sessionId, sessionId: drapeId,
      expectedRevision: body.expectedRevision!, abandon: body.abandon,
    }));
  } catch (error) { return v2Failure(error); }
}
