import { NextResponse } from "next/server";
import { getMobileApiContext } from "../../../../lib/mobile-auth";

export async function GET() {
  const context = await getMobileApiContext();
  if (!context.ok) {
    return context.response;
  }

  return NextResponse.json(context.bootstrap, { status: 200 });
}
