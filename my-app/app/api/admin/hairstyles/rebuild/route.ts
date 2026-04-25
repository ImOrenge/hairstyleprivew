import { NextResponse } from "next/server";
import {
  isAuthorizedAdminRequest,
  rebuildWeeklyHairstyleCatalog,
  type CatalogRebuildMode,
} from "../../../../../lib/hairstyle-catalog";

interface RebuildCatalogRequest {
  mode?: string | null;
}

function isCatalogRebuildMode(value: string): value is CatalogRebuildMode {
  return value === "auto" || value === "researched" || value === "seeded";
}

export async function POST(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RebuildCatalogRequest;
  const requestedMode = typeof body.mode === "string" ? body.mode.trim() : "";
  const mode = requestedMode ? requestedMode : "auto";

  if (!isCatalogRebuildMode(mode)) {
    return NextResponse.json({ error: "Invalid rebuild mode" }, { status: 400 });
  }

  try {
    const result = await rebuildWeeklyHairstyleCatalog(mode);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected rebuild error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
