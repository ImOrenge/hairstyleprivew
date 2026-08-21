import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../../../lib/admin-auth";
import { getFashionProductSourceHealthV2 } from "../../../../../../../lib/consulting/fashion-product-offer-server";
import { isFashionProductTruthEnabled } from "../../../../../../../lib/consulting/feature-flag";
import { v2Failure } from "../../../../../../../lib/v2/http";

interface Params { params: Promise<{ sourceId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const context = await getAdminApiContext();
  if (!context.ok) return context.response;
  if (!isFashionProductTruthEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { sourceId } = await params;
  try {
    return NextResponse.json(await getFashionProductSourceHealthV2(sourceId));
  } catch (error) {
    return v2Failure(error);
  }
}
