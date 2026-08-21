import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { selectFashionBatchPreview } from "../../../../../../../lib/consulting/fashion-batch-server";
import { isFashionBatchEnabled } from "../../../../../../../lib/consulting/feature-flag";
import { v2Disabled, v2Failure } from "../../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isFashionBatchEnabled()) return NextResponse.json({ error: "Fashion batch V2 is disabled." }, { status: 404 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "STYLING_LINK_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  const body = await request.json().catch(() => ({})) as { batchId?: unknown; previewId?: unknown; decision?: unknown; expectedRevision?: unknown };
  if (typeof body.batchId !== "string" || typeof body.previewId !== "string" || !["accept_recommended", "customer_override"].includes(String(body.decision)) || typeof body.expectedRevision !== "number") {
    return NextResponse.json({ error: "배치·룩·선택 방식·revision을 확인해 주세요." }, { status: 400 });
  }
  try {
    return NextResponse.json(await selectFashionBatchPreview({ userId, consultationId, batchId: body.batchId, previewId: body.previewId, decision: body.decision as "accept_recommended" | "customer_override", expectedRevision: body.expectedRevision }));
  } catch (error) { return v2Failure(error); }
}
