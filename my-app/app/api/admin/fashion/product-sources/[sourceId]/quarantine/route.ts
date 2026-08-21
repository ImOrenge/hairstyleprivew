import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../../../lib/admin-auth";
import { quarantineFashionProductSourceV2 } from "../../../../../../../lib/consulting/fashion-product-offer-server";
import { isFashionProductTruthEnabled } from "../../../../../../../lib/consulting/feature-flag";
import { v2Failure } from "../../../../../../../lib/v2/http";

interface Params { params: Promise<{ sourceId: string }> }

export async function POST(request: Request, { params }: Params) {
  const context = await getAdminApiContext();
  if (!context.ok) return context.response;
  if (!isFashionProductTruthEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { sourceId } = await params;
  const body = await request.json().catch(() => ({})) as { reason?: unknown };
  try {
    return NextResponse.json({ source: await quarantineFashionProductSourceV2(sourceId, typeof body.reason === "string" ? body.reason : "") });
  } catch (error) {
    return v2Failure(error);
  }
}
