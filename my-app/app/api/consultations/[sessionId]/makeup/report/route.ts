import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { readCurrentMakeupProfessionalReport, retryCurrentMakeupProfessionalReport, runCurrentMakeupProfessionalReport } from "../../../../../../lib/makeup/makeup-professional-report-server";
import { isHairfitV2Enabled } from "../../../../../../lib/v2/feature-flags";
import { v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ sessionId: string }> }

async function owner({ params }: Params) {
  const [{ userId }, { sessionId }] = await Promise.all([auth(), params]);
  return { userId, sessionId };
}

export async function GET(_request: Request, context: Params) {
  if (!isHairfitV2Enabled("MAKEUP_DIRECTION_V1")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const value = await owner(context);
  if (!value.userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try { return NextResponse.json({ professionalReport: await readCurrentMakeupProfessionalReport(value.userId, value.sessionId) }); }
  catch (error) { return v2Failure(error); }
}

export async function POST(_request: Request, context: Params) {
  if (!isHairfitV2Enabled("MAKEUP_DIRECTION_V1")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const value = await owner(context);
  if (!value.userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const professionalReport = await runCurrentMakeupProfessionalReport(value.userId, value.sessionId);
    return NextResponse.json({ professionalReport }, { status: professionalReport.state === "ready" ? 200 : 202 });
  } catch (error) { return v2Failure(error); }
}

export async function PUT(_request: Request, context: Params) {
  if (!isHairfitV2Enabled("MAKEUP_DIRECTION_V1")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const value = await owner(context);
  if (!value.userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const professionalReport = await retryCurrentMakeupProfessionalReport(value.userId, value.sessionId);
    return NextResponse.json({ professionalReport }, { status: professionalReport.state === "ready" ? 200 : 202 });
  } catch (error) { return v2Failure(error); }
}
