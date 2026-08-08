import { NextResponse } from "next/server";
import { readPublicConsultationShare } from "../../../../lib/consulting/share-server";

interface Params { params: Promise<{ token: string }> }
export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const share = await readPublicConsultationShare(token);
  return share ? NextResponse.json({ share }) : NextResponse.json({ error: "공유 링크가 만료되었거나 폐기되었습니다." }, { status: 410 });
}
