import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isOnboardingFashionPersonalizationEnabled } from "../../../../../../../lib/consulting/feature-flag";
import { addFashionPreferenceFeedbackV2 } from "../../../../../../../lib/consulting/fashion-personalization-server";
import { v2Failure } from "../../../../../../../lib/v2/http";
interface Params { params: Promise<{ consultationId: string }> }

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isOnboardingFashionPersonalizationEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { consultationId } = await params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!["offer","look","direction"].includes(String(body.targetType)) || !["like","dislike"].includes(String(body.sentiment)) || typeof body.targetId !== "string" || typeof body.personalizationSnapshotId !== "string") {
    return NextResponse.json({ error: "feedback payload가 유효하지 않습니다." }, { status: 400 });
  }
  try {
    return NextResponse.json({ feedback: await addFashionPreferenceFeedbackV2({
      userId, consultationId, personalizationSnapshotId: body.personalizationSnapshotId,
      targetType: body.targetType as "offer" | "look" | "direction", targetId: body.targetId,
      sentiment: body.sentiment as "like" | "dislike",
      reasonCodes: Array.isArray(body.reasonCodes) ? body.reasonCodes.filter((v): v is string => typeof v === "string") : [],
    }) }, { status: 201 });
  } catch (error) { return v2Failure(error); }
}
