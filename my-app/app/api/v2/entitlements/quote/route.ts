import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { OfferingKey } from "@hairfit/shared/v2";
import { quoteEntitlementV2 } from "../../../../../lib/v2/entitlement-server";
import { isHairfitV2Enabled } from "../../../../../lib/v2/feature-flags";
import { v2Failure } from "../../../../../lib/v2/http";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isHairfitV2Enabled("ENTITLEMENT_V2_READ_ENABLED")) return NextResponse.json({ error: "V2 entitlement read is disabled." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { offeringKey?: OfferingKey } | null;
  if (!body || typeof body.offeringKey !== "string" || !body.offeringKey.trim()) {
    return NextResponse.json({ error: "offeringKey가 필요합니다." }, { status: 400 });
  }
  try { return NextResponse.json(await quoteEntitlementV2(userId, body.offeringKey)); }
  catch (error) { return v2Failure(error); }
}
