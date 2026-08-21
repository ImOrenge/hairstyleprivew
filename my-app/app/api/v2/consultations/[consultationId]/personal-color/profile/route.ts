import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getConsultationPersonalColorProfileV2 } from "../../../../../../../lib/personal-color-profile-v2";
import { isHairfitV2Enabled } from "../../../../../../../lib/v2/feature-flags";
import { v2Failure } from "../../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isHairfitV2Enabled("PERSONAL_COLOR_V2_READ")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { consultationId } = await params;
  try {
    const profile = await getConsultationPersonalColorProfileV2(userId, consultationId);
    return profile ? NextResponse.json({ profile, drapeEnabled: isHairfitV2Enabled("PERSONAL_COLOR_DRAPE_V1") }) : NextResponse.json({ error: "프로필이 아직 준비되지 않았습니다." }, { status: 404 });
  } catch (error) {
    return v2Failure(error);
  }
}
