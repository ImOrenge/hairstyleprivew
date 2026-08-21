import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isOnboardingFashionPersonalizationEnabled } from "../../../../../../../lib/consulting/feature-flag";
import { createFashionPersonalizationSnapshotV2 } from "../../../../../../../lib/consulting/fashion-personalization-server";
import { v2Failure } from "../../../../../../../lib/v2/http";
interface Params { params: Promise<{ consultationId: string }> }

export async function POST(_request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isOnboardingFashionPersonalizationEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { consultationId } = await params;
  try { return NextResponse.json(await createFashionPersonalizationSnapshotV2(userId, consultationId), { status: 201 }); }
  catch (error) { return v2Failure(error); }
}
