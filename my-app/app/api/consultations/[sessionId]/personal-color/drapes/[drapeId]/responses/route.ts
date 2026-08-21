import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { PERSONAL_COLOR_DRAPE_RESPONSES_V2, type PersonalColorDrapePreferenceV2, type PersonalColorDrapeResponseV2 } from "@hairfit/shared/personal-color-v2";
import { answerPersonalColorDrape } from "../../../../../../../../lib/personal-color-drape-server";
import { isHairfitV2Enabled } from "../../../../../../../../lib/v2/feature-flags";
import { v2Failure } from "../../../../../../../../lib/v2/http";

interface Params { params: Promise<{ sessionId: string; drapeId: string }> }
export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isHairfitV2Enabled("PERSONAL_COLOR_DRAPE_V1")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { sessionId, drapeId } = await params;
  const body = (await request.json().catch(() => null)) as { expectedRevision?: number; pairId?: string; response?: PersonalColorDrapeResponseV2; preference?: PersonalColorDrapePreferenceV2 } | null;
  if (!body || !Number.isInteger(body.expectedRevision) || !body.pairId
    || !body.response || !PERSONAL_COLOR_DRAPE_RESPONSES_V2.includes(body.response)
    || ![null, undefined, "left", "right", "neither"].includes(body.preference)) {
    return NextResponse.json({ error: "드레이프 응답 형식이 올바르지 않습니다." }, { status: 400 });
  }
  try {
    return NextResponse.json(await answerPersonalColorDrape({
      userId, consultationId: sessionId, sessionId: drapeId,
      expectedRevision: body.expectedRevision!, pairId: body.pairId,
      response: body.response, preference: body.preference ?? null,
    }));
  } catch (error) { return v2Failure(error); }
}
