import { NextResponse } from "next/server";
import { isAuthorizedAdminRequest, rebuildWeeklyHairstyleCatalog } from "../../../../../lib/hairstyle-catalog";

export async function POST(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await rebuildWeeklyHairstyleCatalog();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected rebuild error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
