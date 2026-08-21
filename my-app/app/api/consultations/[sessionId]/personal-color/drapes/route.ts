import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createOrResumePersonalColorDrapeSession, readPersonalColorDrapeSession } from "../../../../../../lib/personal-color-drape-server";
import { isHairfitV2Enabled } from "../../../../../../lib/v2/feature-flags";
import { v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ sessionId: string }> }
const disabled = () => !isHairfitV2Enabled("PERSONAL_COLOR_DRAPE_V1")
  ? NextResponse.json({ error: "Not found" }, { status: 404 }) : null;

export async function GET(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const off = disabled(); if (off) return off;
  const { sessionId } = await params;
  const drapeId = new URL(request.url).searchParams.get("drapeId");
  if (!drapeId) return NextResponse.json({ error: "drapeId가 필요합니다." }, { status: 400 });
  try {
    const session = await readPersonalColorDrapeSession(userId, sessionId, drapeId);
    return session ? NextResponse.json({ session }) : NextResponse.json({ error: "드레이프 세션을 찾지 못했습니다." }, { status: 404 });
  } catch (error) { return v2Failure(error); }
}

export async function POST(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const off = disabled(); if (off) return off;
  const { sessionId } = await params;
  try { return NextResponse.json(await createOrResumePersonalColorDrapeSession(userId, sessionId)); }
  catch (error) { return v2Failure(error); }
}
