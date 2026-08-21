import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createMakeupBriefShare } from "../../../../../../lib/makeup/makeup-artifacts-server";
import { isHairfitV2Enabled } from "../../../../../../lib/v2/feature-flags";
import { v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ sessionId: string }> }
export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isHairfitV2Enabled("MAKEUP_DIRECTION_V1")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { hours?: unknown; includeSourcePhoto?: unknown };
  const hours = body.hours === 720 ? 720 : body.hours === 168 ? 168 : 24;
  const { sessionId } = await params;
  try { return NextResponse.json(await createMakeupBriefShare(userId, sessionId, { hours, includeSourcePhoto: body.includeSourcePhoto === true }), { status: 201 }); }
  catch (error) { return v2Failure(error); }
}
