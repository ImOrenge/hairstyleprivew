import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../../../lib/admin-auth";
import { rebuildFashionProductSourceV2, registerFashionProductSourceV2 } from "../../../../../../../lib/consulting/fashion-product-offer-server";
import { isFashionProductTruthEnabled } from "../../../../../../../lib/consulting/feature-flag";
import { v2Failure } from "../../../../../../../lib/v2/http";

interface Params { params: Promise<{ sourceId: string }> }

export async function POST(request: Request, { params }: Params) {
  const context = await getAdminApiContext();
  if (!context.ok) return context.response;
  if (!isFashionProductTruthEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { sourceId } = await params;
  const body = await request.json().catch(() => ({})) as { source?: unknown; offers?: unknown; idempotencyKey?: unknown };
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8) return NextResponse.json({ error: "Idempotency key required" }, { status: 400 });
  try {
    if (body.source) {
      const source = await registerFashionProductSourceV2(body.source);
      if (source.sourceId !== sourceId) return NextResponse.json({ error: "Source id mismatch" }, { status: 400 });
    }
    const offers = Array.isArray(body.offers) ? body.offers : [];
    return NextResponse.json(await rebuildFashionProductSourceV2({
      sourceId, actorUserId: context.userId, idempotencyKey, offers,
    }), { status: 201 });
  } catch (error) {
    return v2Failure(error);
  }
}
