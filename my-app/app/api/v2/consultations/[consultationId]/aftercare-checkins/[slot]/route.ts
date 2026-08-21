import { auth } from "@clerk/nextjs/server";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { isFullStyleAftercareCheckinsEnabled } from "../../../../../../../lib/consulting/feature-flag";
import { getSupabaseAdminClient } from "../../../../../../../lib/supabase";
import { saveAftercareCheckinDraftV2 } from "../../../../../../../lib/v2/aftercare-checkin-server";
import { v2Failure } from "../../../../../../../lib/v2/http";

const BUCKET="aftercare-photos";const ALLOWED=new Set(["image/jpeg","image/png","image/webp"]);const MAX=8_000_000;
const sha=(value:Buffer|string)=>createHash("sha256").update(value).digest("hex");

export async function PUT(request:Request,{params}:{params:Promise<{consultationId:string;slot:string}>}){
  const {userId}=await auth();if(!userId)return NextResponse.json({error:"로그인이 필요합니다."},{status:401});
  if(!isFullStyleAftercareCheckinsEnabled())return NextResponse.json({error:"사후상담 기능이 비활성화되어 있습니다."},{status:404});
  const {consultationId,slot:rawSlot}=await params;const slot=Number(rawSlot);if(!Number.isInteger(slot)||slot<1||slot>3)return NextResponse.json({error:"사후상담 일정을 확인해 주세요."},{status:400});
  let uploadedPath:string|null=null;
  try{
    const contentType=request.headers.get("content-type")??"";
    let concern="";let satisfaction:number|null=null;let photo:undefined|{path:string;fingerprint:string;consentedAt:string;uploadedAt:string};
    if(contentType.includes("multipart/form-data")){
      const form=await request.formData();concern=String(form.get("concern")??"");const score=Number(form.get("satisfaction"));satisfaction=Number.isInteger(score)&&score>=1&&score<=5?score:null;
      const file=form.get("file");if(file instanceof File){
        if(form.get("consent")!=="true")return NextResponse.json({error:"사진 분석과 비공개 저장에 동의해 주세요."},{status:400});
        if(!ALLOWED.has(file.type)||file.size>MAX)return NextResponse.json({error:"8MB 이하 JPEG, PNG, WebP 이미지만 사용할 수 있습니다."},{status:400});
        const output=await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize({width:1600,height:2000,fit:"inside",withoutEnlargement:true}).webp({quality:86}).toBuffer();
        const fingerprint=sha(output);const owner=sha(userId).slice(0,32);uploadedPath=`${owner}/${consultationId}/checkin-${slot}/${fingerprint}.webp`;
        const upload=await getSupabaseAdminClient().storage.from(BUCKET).upload(uploadedPath,output,{contentType:"image/webp",upsert:true});if(upload.error)throw new Error(upload.error.message);
        const now=new Date().toISOString();photo={path:uploadedPath,fingerprint,consentedAt:now,uploadedAt:now};
      }
    }else{
      const body=await request.json().catch(()=>({})) as {concern?:unknown;satisfaction?:unknown};concern=String(body.concern??"");const score=Number(body.satisfaction);satisfaction=Number.isInteger(score)&&score>=1&&score<=5?score:null;
    }
    const saved=await saveAftercareCheckinDraftV2({userId,consultationId,slot,concern,satisfaction,photo});
    if(uploadedPath&&saved.previousPhotoPath&&saved.previousPhotoPath!==uploadedPath)await getSupabaseAdminClient().storage.from(BUCKET).remove([saved.previousPhotoPath]);
    return NextResponse.json({checkin:saved.checkin});
  }catch(error){if(uploadedPath)await getSupabaseAdminClient().storage.from(BUCKET).remove([uploadedPath]);return v2Failure(error);}
}
