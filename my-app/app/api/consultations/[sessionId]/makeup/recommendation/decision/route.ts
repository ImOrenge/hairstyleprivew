import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { decideMakeupRecommendation } from "../../../../../../../lib/makeup/makeup-interview-server";
import { v2Failure } from "../../../../../../../lib/v2/http";
interface Params { params: Promise<{ sessionId: string }> }
export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null) as { expectedRevision?: number; decision?: "accept_adjustment" | "keep_selection" } | null;
  if (!body || typeof body.expectedRevision !== "number" || !["accept_adjustment", "keep_selection"].includes(body.decision ?? "")) return NextResponse.json({ error: "추천 결정이 필요합니다." }, { status: 400 });
  try { return NextResponse.json(await decideMakeupRecommendation({ userId, consultationId: (await params).sessionId, expectedRevision: body.expectedRevision, decision: body.decision! })); }
  catch (error) { return v2Failure(error); }
}
