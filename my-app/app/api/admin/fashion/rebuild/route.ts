import { NextResponse } from "next/server";
import { isAuthorizedAdminRequest } from "../../../../../lib/hairstyle-catalog";
import {
  rebuildWeeklyFashionCatalog,
  type FashionCatalogRebuildMode,
} from "../../../../../lib/fashion-catalog";

interface RebuildFashionCatalogRequest {
  mode?: string | null;
}

function isFashionCatalogRebuildMode(value: string): value is FashionCatalogRebuildMode {
  return value === "auto" || value === "researched" || value === "seeded";
}

export async function POST(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RebuildFashionCatalogRequest;
  const requestedMode = typeof body.mode === "string" ? body.mode.trim() : "";
  const mode = requestedMode || "auto";

  if (!isFashionCatalogRebuildMode(mode)) {
    return NextResponse.json({ error: "Invalid rebuild mode" }, { status: 400 });
  }

  try {
    const result = await rebuildWeeklyFashionCatalog(mode);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected rebuild error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
