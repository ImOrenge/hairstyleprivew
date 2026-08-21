import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isOnboardingFashionPersonalizationEnabled } from "../../../../../../../lib/consulting/feature-flag";
import { patchConsultationFashionContextV2, readConsultationFashionContextV2 } from "../../../../../../../lib/consulting/fashion-personalization-server";
import { v2Failure } from "../../../../../../../lib/v2/http";
interface Params { params: Promise<{ consultationId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isOnboardingFashionPersonalizationEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { consultationId } = await params;
  try { return NextResponse.json({ context: await readConsultationFashionContextV2(userId, consultationId) }); }
  catch (error) { return v2Failure(error); }
}

export async function PATCH(request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isOnboardingFashionPersonalizationEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { consultationId } = await params;
  const body = await request.json().catch(() => ({})) as { expectedRevision?: unknown; patch?: unknown };
  if (!Number.isInteger(body.expectedRevision) || !body.patch || typeof body.patch !== "object" || Array.isArray(body.patch)) {
    return NextResponse.json({ error: "expectedRevision과 patch가 필요합니다." }, { status: 400 });
  }
  try { return NextResponse.json({ context: await patchConsultationFashionContextV2(userId, consultationId, Number(body.expectedRevision), body.patch as Record<string, unknown>) }); }
  catch (error) { return v2Failure(error); }
}
