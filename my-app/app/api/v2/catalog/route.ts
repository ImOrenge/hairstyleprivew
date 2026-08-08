import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getActiveCatalogV2 } from "../../../../lib/v2/catalog-server";
import { isHairfitV2Enabled } from "../../../../lib/v2/feature-flags";
import { v2Failure } from "../../../../lib/v2/http";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isHairfitV2Enabled("CATALOG_V2_ENABLED")) {
    return NextResponse.json({ error: "V2 catalog is disabled." }, { status: 404 });
  }
  try { return NextResponse.json(await getActiveCatalogV2()); }
  catch (error) { return v2Failure(error); }
}
