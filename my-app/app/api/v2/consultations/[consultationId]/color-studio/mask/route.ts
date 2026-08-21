import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ensureHairMaskArtifactV2 } from "../../../../../../../lib/consulting/color-studio-server";
import { v2Failure } from "../../../../../../../lib/v2/http";
import { isColorStudioEnabled } from "../../../../../../../lib/consulting/feature-flag";

interface Params { params: Promise<{ consultationId: string }> }
export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isColorStudioEnabled()) return NextResponse.json({ error: "Color Studio is disabled." }, { status: 404 });
  const { consultationId } = await params;
  const body = await request.json().catch(() => ({})) as { force?: boolean; maskDataUrl?: string; modelVersion?: string };
  try { return NextResponse.json({ mask: await ensureHairMaskArtifactV2(userId, consultationId, body) }); }
  catch (error) { return v2Failure(error); }
}
