import { NextResponse } from "next/server";
import { readPublicMakeupBriefShare } from "../../../../../lib/makeup/makeup-artifacts-server";
import { isHairfitV2Enabled } from "../../../../../lib/v2/feature-flags";

interface Params { params: Promise<{ token: string }> }
export async function GET(_request: Request, { params }: Params) {
  if (!isHairfitV2Enabled("MAKEUP_DIRECTION_V1")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { token } = await params; const value = await readPublicMakeupBriefShare(token);
  return value ? NextResponse.json(value) : NextResponse.json({ error: "공유 링크가 만료되었거나 취소되었습니다." }, { status: 404 });
}
