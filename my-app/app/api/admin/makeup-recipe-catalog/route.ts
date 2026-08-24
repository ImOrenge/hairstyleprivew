import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../lib/admin-auth";
import {
  activateMakeupRecipeCatalogCycleAdmin,
  createMakeupRecipeCatalogCycleV1,
  readMakeupRecipeCatalogAdminState,
  validateMakeupRecipeCatalogCycleAdmin,
  type MakeupRecipeDraftV1,
} from "../../../../lib/makeup/makeup-recipe-catalog-server";

export async function GET() {
  const context = await getAdminApiContext();
  if (!context.ok) return context.response;
  try { return NextResponse.json(await readMakeupRecipeCatalogAdminState()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "카탈로그를 불러오지 못했습니다." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const context = await getAdminApiContext();
  if (!context.ok) return context.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action ?? "");
  try {
    if (action === "create") {
      if (!Array.isArray(body.recipes)) return NextResponse.json({ error: "18개 레시피를 모두 제공해 주세요." }, { status: 400 });
      return NextResponse.json(await createMakeupRecipeCatalogCycleV1(context.userId, Number(body.version), body.recipes as MakeupRecipeDraftV1[]), { status: 201 });
    }
    const cycleId = typeof body.cycleId === "string" ? body.cycleId : "";
    if (!cycleId) return NextResponse.json({ error: "카탈로그 사이클을 선택해 주세요." }, { status: 400 });
    if (action === "validate") return NextResponse.json(await validateMakeupRecipeCatalogCycleAdmin(cycleId));
    if (action === "activate" || action === "rollback") return NextResponse.json(await activateMakeupRecipeCatalogCycleAdmin(cycleId, context.userId));
    return NextResponse.json({ error: "지원하지 않는 카탈로그 작업입니다." }, { status: 400 });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "카탈로그 작업을 완료하지 못했습니다." }, { status });
  }
}
