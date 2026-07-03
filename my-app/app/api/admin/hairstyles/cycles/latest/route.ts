import { NextResponse } from "next/server";
import { getHairstyleCatalogAdminStatus, isAuthorizedAdminRequest } from "../../../../../../lib/hairstyle-catalog";

export async function GET(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const status = await getHairstyleCatalogAdminStatus();
    return NextResponse.json(status, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected cycle lookup error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
