import { NextResponse } from "next/server";
import { getLatestSuccessfulCatalogCycle, isAuthorizedAdminRequest } from "../../../../../../lib/hairstyle-catalog";

export async function GET(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cycle = await getLatestSuccessfulCatalogCycle();
    if (!cycle) {
      return NextResponse.json({ cycle: null }, { status: 200 });
    }

    return NextResponse.json({ cycle }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected cycle lookup error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
