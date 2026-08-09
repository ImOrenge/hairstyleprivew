import "server-only";
import { assertAnalysisEvidenceV2, type AnalysisEvidenceV2, type PersonalColorEvidenceV2 } from "@hairfit/shared/v2";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "./errors";
import { transitionConsultationV2 } from "./consultation-server";
export async function saveAnalysisEvidenceV2(userId:string,evidence:AnalysisEvidenceV2,expectedVersion:number){
  try{assertAnalysisEvidenceV2(evidence);}catch(error){throw new HairfitV2Error("ANALYSIS_EVIDENCE_INVALID",400,error instanceof Error?error.message:"분석 근거 형식이 올바르지 않습니다.");}
  const db=getSupabaseAdminClient();const session=await db.from("consultation_sessions").select("id,lifecycle_state,version").eq("id",evidence.consultationId).eq("user_id",userId).maybeSingle();if(session.error)throw new Error(session.error.message);if(!session.data)throw new HairfitV2Error("CONSULTATION_NOT_FOUND",404,"상담을 찾을 수 없습니다.");
  const sessionRow=session.data as unknown as{lifecycle_state:string;version:number};
  if(sessionRow.version!==expectedVersion)throw new HairfitV2Error("CONSULTATION_VERSION_CONFLICT",409,"상담이 변경되었습니다. 새로고침 후 다시 시도해 주세요.");

  // A consultation keeps a foreign-key reference to its evidence row. Re-analysis
  // must update that row in place instead of replacing its primary key.
  const existing=await db.from("analysis_evidence_v2").select("id").eq("consultation_id",evidence.consultationId).eq("user_id",userId).maybeSingle();
  if(existing.error)throw new Error(existing.error.message);
  const stableEvidenceId=(existing.data as unknown as{id:string}|null)?.id??evidence.id;
  const{data,error}=await db.from("analysis_evidence_v2").upsert({id:stableEvidenceId,consultation_id:evidence.consultationId,user_id:userId,source_image_fingerprint:evidence.sourceImageFingerprint,source_transform:evidence.sourceTransform,model_provider:evidence.model.provider,model_name:evidence.model.name,model_version:evidence.model.version,quality:evidence.quality,landmarks:evidence.landmarks,contours:evidence.contours,hairline:evidence.hairline,measurements:evidence.measurements,face_shape:evidence.faceShape,skin_sample_regions:evidence.skinSampleRegions,excluded_regions:evidence.excludedRegions,corrected_at:evidence.correctedAt,updated_at:new Date().toISOString()},{onConflict:"consultation_id"}).select("id").single();if(error)throw new Error(error.message);const id=(data as unknown as{id:string}).id;
  const linked=await db.from("consultation_sessions").update({analysis_evidence_id:id}).eq("id",evidence.consultationId).eq("user_id",userId);if(linked.error)throw new Error(linked.error.message);
  if(sessionRow.lifecycle_state==="photo_validated")await transitionConsultationV2({userId,consultationId:evidence.consultationId,expectedVersion,nextState:"analysis_ready"});return id;
}
export async function getAnalysisEvidenceV2(userId:string,consultationId:string){const{data,error}=await getSupabaseAdminClient().from("analysis_evidence_v2").select("id,consultation_id,source_image_fingerprint,source_transform,model_provider,model_name,model_version,quality,landmarks,contours,hairline,measurements,face_shape,skin_sample_regions,excluded_regions,corrected_at,created_at").eq("consultation_id",consultationId).eq("user_id",userId).maybeSingle();if(error)throw new Error(error.message);if(!data)return null;const row=data as unknown as Record<string,unknown>;return{schemaVersion:"analysis-evidence-v1",id:String(row.id),consultationId:String(row.consultation_id),sourceImageFingerprint:String(row.source_image_fingerprint),sourceTransform:row.source_transform,model:{provider:String(row.model_provider),name:String(row.model_name),version:String(row.model_version)},quality:row.quality,landmarks:Array.isArray(row.landmarks)?row.landmarks:[],contours:row.contours,hairline:row.hairline,measurements:row.measurements,faceShape:row.face_shape,skinSampleRegions:row.skin_sample_regions,excludedRegions:row.excluded_regions,correctedAt:typeof row.corrected_at==="string"?row.corrected_at:null,createdAt:String(row.created_at)} as AnalysisEvidenceV2;}

export async function savePersonalColorEvidenceV2(userId:string,evidence:PersonalColorEvidenceV2){
  if(evidence.quality.confidence<0||evidence.quality.confidence>1||evidence.result.confidence<0||evidence.result.confidence>1)throw new HairfitV2Error("PERSONAL_COLOR_EVIDENCE_INVALID",400,"퍼스널컬러 신뢰도 형식이 올바르지 않습니다.");
  const db=getSupabaseAdminClient();
  const analysis=await db.from("analysis_evidence_v2").select("id").eq("id",evidence.sourceAnalysisEvidenceId).eq("consultation_id",evidence.consultationId).eq("user_id",userId).maybeSingle();
  if(analysis.error)throw new Error(analysis.error.message);if(!analysis.data)throw new HairfitV2Error("ANALYSIS_EVIDENCE_NOT_FOUND",404,"연결할 얼굴 분석 근거를 찾을 수 없습니다.");
  const result=await db.from("personal_color_evidence_v2").upsert({id:evidence.id,consultation_id:evidence.consultationId,user_id:userId,source_analysis_evidence_id:evidence.sourceAnalysisEvidenceId,model:evidence.model,quality:evidence.quality,result:evidence.result},{onConflict:"consultation_id"}).select("id").single();
  if(result.error)throw new Error(result.error.message);return result.data;
}

export async function getPersonalColorEvidenceV2(userId:string,consultationId:string){const{data,error}=await getSupabaseAdminClient().from("personal_color_evidence_v2").select("id,consultation_id,source_analysis_evidence_id,model,quality,result,created_at").eq("consultation_id",consultationId).eq("user_id",userId).maybeSingle();if(error)throw new Error(error.message);if(!data)return null;const row=data as unknown as Record<string,unknown>;return{schemaVersion:"personal-color-evidence-v1",id:String(row.id),consultationId:String(row.consultation_id),sourceAnalysisEvidenceId:String(row.source_analysis_evidence_id),model:row.model,quality:row.quality,result:row.result,createdAt:String(row.created_at)} as PersonalColorEvidenceV2;}
