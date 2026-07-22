import { NextResponse } from "next/server";
import { buildAndroidAssetLinks } from "../../../lib/app-link-association";

export async function GET() {
  const association = buildAndroidAssetLinks(process.env.HAIRFIT_ANDROID_CERT_SHA256);
  if (!association) {
    return NextResponse.json(
      { error: "HAIRFIT_ANDROID_CERT_SHA256 is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(association, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
