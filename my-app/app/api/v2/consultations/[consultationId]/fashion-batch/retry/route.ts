import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { retryFashionBatchSlots } from "../../../../../../../lib/consulting/fashion-batch-server";
import { isFashionBatchEnabled } from "../../../../../../../lib/consulting/feature-flag";
import { v2Disabled, v2Failure } from "../../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isFashionBatchEnabled()) return NextResponse.json({ error: "Fashion batch V2 is disabled." }, { status: 404 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "STYLING_LINK_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  const body = await request.json().catch(() => ({})) as { batchId?: unknown; slotIds?: unknown };
  if (typeof body.batchId !== "string" || !Array.isArray(body.slotIds) || !body.slotIds.every((item) => typeof item === "string")) {
    return NextResponse.json({ error: "batchId와 재시도할 slotIds가 필요합니다." }, { status: 400 });
  }
  try {
    return NextResponse.json(await retryFashionBatchSlots({ userId, consultationId, batchId: body.batchId, slotIds: body.slotIds as string[], localBaseUrl: new URL(request.url).origin }), { status: 202 });
  } catch (error) { return v2Failure(error); }
}
