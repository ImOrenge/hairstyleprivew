import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { PersonalColorEvidenceV2 } from "@hairfit/shared/v2";
import { getPersonalColorEvidenceV2, savePersonalColorEvidenceV2 } from "../../../../../../lib/v2/analysis-server";
import { v2Disabled, v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ consultationId: string }> }
export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "ANALYSIS_EVIDENCE_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  try { const evidence=await getPersonalColorEvidenceV2(userId,consultationId);return evidence?NextResponse.json({evidence}):NextResponse.json({error:"퍼스널컬러 근거가 없습니다."},{status:404}); }
  catch(error){return v2Failure(error);}
}
export async function POST(request:Request,{params}:Params){
  const{userId}=await auth();if(!userId)return NextResponse.json({error:"로그인이 필요합니다."},{status:401});
  const disabled=v2Disabled("CONSULTATION_SESSION_V2_ENABLED","ANALYSIS_EVIDENCE_V2_ENABLED");if(disabled)return disabled;
  const{consultationId}=await params;const body=(await request.json().catch(()=>null)) as {evidence?:PersonalColorEvidenceV2}|null;
  if(!body?.evidence||body.evidence.consultationId!==consultationId)return NextResponse.json({error:"퍼스널컬러 근거를 확인해 주세요."},{status:400});
  try{return NextResponse.json({evidenceId:(await savePersonalColorEvidenceV2(userId,body.evidence)).id},{status:201});}catch(error){return v2Failure(error);}
}
