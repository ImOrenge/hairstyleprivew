import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { MakeupContextProfile } from "@hairfit/shared/makeup";
import { saveMakeupContext } from "../../../../../../lib/makeup/makeup-direction-server";
import { isHairfitV2Enabled } from "../../../../../../lib/v2/feature-flags";
import { v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ sessionId: string }> }
export async function PUT(request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isHairfitV2Enabled("MAKEUP_DIRECTION_V1")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const context = (await request.json().catch(() => null)) as MakeupContextProfile | null;
  if (!context) return NextResponse.json({ error: "메이크업 컨텍스트가 필요합니다." }, { status: 400 });
  const { sessionId } = await params;
  try { return NextResponse.json(await saveMakeupContext(userId, sessionId, context)); }
  catch (error) { return v2Failure(error); }
}
