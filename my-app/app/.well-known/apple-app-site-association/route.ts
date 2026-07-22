import { NextResponse } from "next/server";
import { buildAppleAppSiteAssociation } from "../../../lib/app-link-association";

export async function GET() {
  const association = buildAppleAppSiteAssociation(process.env.HAIRFIT_APPLE_TEAM_ID);
  if (!association) {
    return NextResponse.json(
      { error: "HAIRFIT_APPLE_TEAM_ID is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(association, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
