import { NextResponse } from "next/server";
import { readPublicCustomerStylebookShareV2 } from "../../../../lib/v2/customer-stylebook-actions-server";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const share = await readPublicCustomerStylebookShareV2((await params).token);
  if (!share) return NextResponse.json({ error: "공유 링크가 만료되었거나 해제되었습니다." }, { status: 404 });
  return NextResponse.json(share, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
