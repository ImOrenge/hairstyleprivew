import { NextResponse } from "next/server";
import { loadPublishedSupportFaqs } from "../../../../lib/support-server";

export async function GET() {
  const faqs = await loadPublishedSupportFaqs();
  return NextResponse.json({ faqs }, { status: 200 });
}
