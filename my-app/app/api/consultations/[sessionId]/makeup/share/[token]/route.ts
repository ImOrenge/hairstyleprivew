import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { revokeMakeupBriefShare } from "../../../../../../../lib/makeup/makeup-artifacts-server";
import { isHairfitV2Enabled } from "../../../../../../../lib/v2/feature-flags";
import { v2Failure } from "../../../../../../../lib/v2/http";

interface Params { params: Promise<{ sessionId: string; token: string }> }
export async function DELETE(_request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isHairfitV2Enabled("MAKEUP_DIRECTION_V1")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { sessionId, token } = await params;
  try { return NextResponse.json(await revokeMakeupBriefShare(userId, sessionId, token)); }
  catch (error) { return v2Failure(error); }
}
