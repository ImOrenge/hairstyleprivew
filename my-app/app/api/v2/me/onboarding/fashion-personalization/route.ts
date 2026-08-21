import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isOnboardingFashionPersonalizationEnabled } from "../../../../../../lib/consulting/feature-flag";
import { patchUserFashionPolicyV2, readUserFashionPolicyV2 } from "../../../../../../lib/consulting/fashion-personalization-server";
import { v2Failure } from "../../../../../../lib/v2/http";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isOnboardingFashionPersonalizationEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try { return NextResponse.json(await readUserFashionPolicyV2(userId)); }
  catch (error) { return v2Failure(error); }
}

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isOnboardingFashionPersonalizationEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { expectedRevision?: unknown; patch?: unknown };
  if (!Number.isInteger(body.expectedRevision) || !body.patch || typeof body.patch !== "object" || Array.isArray(body.patch)) {
    return NextResponse.json({ error: "expectedRevision과 patch가 필요합니다." }, { status: 400 });
  }
  try { return NextResponse.json(await patchUserFashionPolicyV2(userId, Number(body.expectedRevision), body.patch as Record<string, unknown>)); }
  catch (error) { return v2Failure(error); }
}
