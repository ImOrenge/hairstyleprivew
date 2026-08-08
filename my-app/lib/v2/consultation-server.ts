import "server-only";
import type { ConsultationKindV2, ConsultationSessionV2, ConsultationStateV2 } from "@hairfit/shared/v2";
import { randomUUID } from "node:crypto";
import { createConsultationSnapshot } from "../consulting/defaults";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "./errors";

type SessionRow={id:string;user_id:string;session_kind:ConsultationKindV2;lifecycle_state:ConsultationStateV2;version:number;entitlement_grant_id:string|null;source_generation_id:string|null;source_photo_id:string|null;analysis_evidence_id:string|null;current_preview_board_id:string|null;selected_snapshot_id:string|null;preferences:Record<string,unknown>;plan_snapshot:Record<string,unknown>;started_at?:string;created_at:string;updated_at:string;completed_at:string|null;cancelled_at:string|null};
function actions(state:ConsultationStateV2){const map:Record<ConsultationStateV2,string[]>={draft:["attach_photo","cancel"],photo_validated:["analyze","cancel"],analysis_ready:["create_preview_board","cancel"],preview_board_queued:["resume"],preview_board_ready:["shortlist","select"],shortlisted:["select"],style_selected:["change_selection","confirm"],selection_confirmed:["get_brief","record_service","create_fashion"],salon_brief_ready:["record_service","create_fashion","complete"],aftercare_ready:["get_brief","create_fashion","complete"],fashion_ready:["get_brief","record_service","complete"],completed:["read"],cancelled:["read"]};return map[state];}
function map(row:SessionRow):ConsultationSessionV2{return{schemaVersion:"consultation-session-v1",id:row.id,userId:row.user_id,sessionKind:row.session_kind,state:row.lifecycle_state,version:row.version,entitlementGrantId:row.entitlement_grant_id,sourceGenerationId:row.source_generation_id,sourcePhotoId:row.source_photo_id,analysisEvidenceId:row.analysis_evidence_id,currentPreviewBoardId:row.current_preview_board_id,selectedSnapshotId:row.selected_snapshot_id,preferences:row.preferences,planSnapshot:row.plan_snapshot,availableActions:actions(row.lifecycle_state),startedAt:row.started_at??row.created_at,updatedAt:row.updated_at,completedAt:row.completed_at,cancelledAt:row.cancelled_at};}
const SELECT="id,user_id,session_kind,lifecycle_state,version,entitlement_grant_id,source_generation_id,source_photo_id,analysis_evidence_id,current_preview_board_id,selected_snapshot_id,preferences,plan_snapshot,created_at,updated_at,completed_at,cancelled_at";
export async function createConsultationV2(input:{userId:string;sessionKind:ConsultationKindV2;idempotencyKey:string;preferences?:Record<string,unknown>;planSnapshot?:Record<string,unknown>}){
  if(input.idempotencyKey.trim().length<8)throw new HairfitV2Error("INVALID_IDEMPOTENCY_KEY",400,"idempotency key가 너무 짧습니다.");
  const db=getSupabaseAdminClient(); const existing=await db.from("consultation_sessions").select(SELECT).eq("user_id",input.userId).eq("idempotency_key",input.idempotencyKey).maybeSingle(); if(existing.error)throw new Error(existing.error.message); if(existing.data)return map(existing.data as unknown as SessionRow);
  const id=randomUUID(); const snapshot=createConsultationSnapshot({sessionId:id,userId:input.userId}); const {data,error}=await db.from("consultation_sessions").insert({id,user_id:input.userId,version:1,current_stage:"discovery",snapshot,session_kind:input.sessionKind,lifecycle_state:"draft",idempotency_key:input.idempotencyKey,preferences:input.preferences??{},plan_snapshot:input.planSnapshot??{}}).select(SELECT).single();
  if(error){
    if(error.code==="23505"){
      const replay=await db.from("consultation_sessions").select(SELECT).eq("user_id",input.userId).eq("idempotency_key",input.idempotencyKey).maybeSingle();
      if(replay.error)throw new Error(replay.error.message);
      if(replay.data)return map(replay.data as unknown as SessionRow);
    }
    throw new Error(error.message);
  }
  return map(data as unknown as SessionRow);
}
export async function getConsultationV2(userId:string,id:string){const{data,error}=await getSupabaseAdminClient().from("consultation_sessions").select(SELECT).eq("id",id).eq("user_id",userId).maybeSingle();if(error)throw new Error(error.message);return data?map(data as unknown as SessionRow):null;}
export async function transitionConsultationV2(input:{userId:string;consultationId:string;expectedVersion:number;nextState:ConsultationStateV2}){const{data,error}=await getSupabaseAdminClient().rpc("transition_consultation_v2",{p_user_id:input.userId,p_consultation_id:input.consultationId,p_expected_version:input.expectedVersion,p_next_state:input.nextState});if(error)throw new HairfitV2Error("CONSULTATION_TRANSITION_REJECTED",409,"현재 상담 상태에서는 요청한 단계로 이동할 수 없습니다.");return data;}
export async function linkGenerationToConsultationV2(userId:string,consultationId:string,generationId:string){
  const{data,error}=await getSupabaseAdminClient().rpc("attach_generation_to_consultation_v2",{p_user_id:userId,p_consultation_id:consultationId,p_generation_id:generationId,p_expected_version:null,p_transition_photo:false});
  if(error)throw new HairfitV2Error("CONSULTATION_GENERATION_LINK_FAILED",409,"상담과 생성 작업을 연결하지 못했습니다.");
  return data;
}

export async function attachConsultationPhotoV2(input:{userId:string;consultationId:string;generationId:string;expectedVersion:number}){
  const{data,error}=await getSupabaseAdminClient().rpc("attach_generation_to_consultation_v2",{p_user_id:input.userId,p_consultation_id:input.consultationId,p_generation_id:input.generationId,p_expected_version:input.expectedVersion,p_transition_photo:true});
  if(error)throw new HairfitV2Error("CONSULTATION_PHOTO_LINK_FAILED",409,"사진을 상담에 연결하지 못했습니다.");
  if((data as{state?:string}|null)?.state==="conflict")throw new HairfitV2Error("CONSULTATION_VERSION_CONFLICT",409,"상담이 다른 위치에서 변경되었습니다.");
  return getConsultationV2(input.userId,input.consultationId);
}
