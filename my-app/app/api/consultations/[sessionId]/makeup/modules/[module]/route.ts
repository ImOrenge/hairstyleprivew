import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { MakeupModulePatch } from "@hairfit/shared/makeup";
import { patchMakeupModule } from "../../../../../../../lib/makeup/makeup-direction-server";
import { isHairfitV2Enabled } from "../../../../../../../lib/v2/feature-flags";
import { v2Failure } from "../../../../../../../lib/v2/http";

interface Params { params: Promise<{ sessionId: string; module: string }> }
export async function PUT(request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isHairfitV2Enabled("MAKEUP_DIRECTION_V1")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as (MakeupModulePatch & { snapshotId?: string }) | null;
  if (!body?.snapshotId || !Number.isInteger(body.expectedRevision)) return NextResponse.json({ error: "snapshotId와 expectedRevision이 필요합니다." }, { status: 400 });
  const { sessionId, module } = await params;
  try { return NextResponse.json(await patchMakeupModule(userId, sessionId, body.snapshotId, module, body)); }
  catch (error) { return v2Failure(error); }
}
