import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  normalizeAftercareCheckinResponseV1,
  type AftercareCheckinResponseV1,
  type AftercarePhotoObservationV1,
} from "@hairfit/shared/v2";
import { runDurableCapability } from "./durable-runtime";
import { capabilityFingerprint, type CapabilityEngineAdapter } from "./runtime";

const model=process.env.PROMPT_LLM_MODEL||process.env.PROMPT_RESEARCH_MODEL||"gemini-2.5-flash";
const provider=/^(gpt-|o\d|chatgpt-)/i.test(model)?"openai":"gemini";
const POLICY="aftercare-checkin-grounded-v1";
const UNSAFE_OBSERVATION=/(?:진단|처방|의학|질병|손상도|얼굴|성별|나이|identity|gender|diagnos|prescri|\d+\s*(?:%|퍼센트|ml|mg|도))/iu;

export type AftercarePhotoAnalysisInput={imageDataUrl:string;sourceFingerprint:string};
export type AftercareResponseInput={
  actualService:{services:string[];serviceDate:string};
  offsetDays:number;
  concern:string;
  satisfaction:number|null;
  observations:AftercarePhotoObservationV1[];
};

function jsonText(value:unknown){
  const direct=(value as {output_text?:unknown}|null)?.output_text;
  if(typeof direct==="string")return direct;
  const output=(value as {output?:Array<{content?:Array<{text?:string}>}>}|null)?.output??[];
  return output.flatMap((item)=>item.content??[]).map((item)=>item.text).find((item):item is string=>typeof item==="string")??"";
}

async function generateJson(prompt:string,imageDataUrl?:string){
  if(provider==="openai"&&process.env.OPENAI_API_KEY){
    const input=imageDataUrl?[{role:"user",content:[{type:"input_text",text:prompt},{type:"input_image",image_url:imageDataUrl}]}]:prompt;
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model,input})});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error("AFTERCARE_PROVIDER_FAILED");
    return JSON.parse(jsonText(body).replace(/^```json\s*|\s*```$/g,"").trim());
  }
  if(provider==="gemini"&&process.env.GOOGLE_API_KEY){
    const gemini=new GoogleGenerativeAI(process.env.GOOGLE_API_KEY).getGenerativeModel({model});
    const result=imageDataUrl
      ? await gemini.generateContent([prompt,{inlineData:{data:imageDataUrl.split(",")[1]??"",mimeType:"image/webp"}}])
      : await gemini.generateContent(prompt);
    return JSON.parse(result.response.text().replace(/^```json\s*|\s*```$/g,"").trim());
  }
  return null;
}

function observations(value:unknown):AftercarePhotoObservationV1[]{
  const rows=Array.isArray(value)?value:[];
  const normalized=rows.slice(0,4).map((item,index)=>{
    const row=item&&typeof item==="object"?item as Record<string,unknown>:{};
    const confidence=["low","medium","high"].includes(String(row.confidence))?String(row.confidence) as "low"|"medium"|"high":"low";
    return {id:`photo-observation-${index+1}`,label:String(row.label??"사진에서 확인한 변화").slice(0,80),observation:String(row.observation??"").slice(0,300),confidence};
  }).filter((item)=>item.observation);
  if(normalized.some((item)=>UNSAFE_OBSERVATION.test(`${item.label} ${item.observation}`)))throw new Error("AFTERCARE_PHOTO_OBSERVATION_UNSAFE");
  return normalized;
}

const photoAdapter:CapabilityEngineAdapter<AftercarePhotoAnalysisInput,AftercarePhotoObservationV1[]>={
  capability:"aftercare-checkin-photo-analysis",engineVersion:"aftercare-checkin-photo-v1",sourceRevision:"aftercare-checkin-photo-v1",provider,model,promptPolicyVersion:POLICY,catalogCycleId:null,fallbackMode:"deterministic",
  async execute(input){
    const generated=await generateJson("헤어 시술 후 사진에서 눈으로 확인 가능한 모발의 윤기, 부스스함, 컬러 균일도, 형태 유지 정도만 관찰하세요. 사람 식별, 얼굴 평가, 질병·손상 진단, 약품·시술 수치 추정은 금지합니다. observations 배열에 label, observation, confidence(low|medium|high)를 넣은 JSON만 반환하세요.",input.imageDataUrl);
    return observations((generated as {observations?:unknown}|null)?.observations).length?observations((generated as {observations?:unknown}).observations):[{id:"photo-observation-1",label:"사진 확인 범위",observation:"제출한 사진만으로 보이는 스타일 유지 상태를 확인했습니다. 조명과 촬영 각도에 따라 실제 상태와 다를 수 있습니다.",confidence:"low"}];
  },failureCode:()=>"AFTERCARE_PHOTO_ANALYSIS_FAILED",failureMessage:()=>"사진을 확인하지 못했습니다. 사진은 저장되어 있으며 다시 시도할 수 있습니다.",
};

const responseAdapter:CapabilityEngineAdapter<AftercareResponseInput,AftercareCheckinResponseV1>={
  capability:"aftercare-checkin-response-generation",engineVersion:"aftercare-checkin-response-v1",sourceRevision:"aftercare-checkin-response-v1",provider,model,promptPolicyVersion:POLICY,catalogCycleId:null,fallbackMode:"deterministic",
  async execute(input){
    const evidenceIds=["actual-service","customer-concern",...input.observations.map((item)=>item.id),...(input.satisfaction==null?[]:["customer-satisfaction"])];
    const generated=await generateJson(["당신은 시술 후 일상 관리를 돕는 HairFit 컨설턴트입니다.","제공된 사실만 사용하고 의학적 진단, 약품·시술 수치, 새로운 손상 판정을 만들지 마세요.","통증·화상·발진·상처 신호는 전문가 확인이 필요하다고 안내하세요.","title, summary, careActions(최대4), cautions(최대4), nextAction, evidenceIds JSON만 반환하세요.",JSON.stringify(input)].join("\n"));
    const fallback={title:`D+${input.offsetDays} 관리 안내`,summary:"실제 시술 내용과 지금 남긴 고민을 기준으로 무리 없이 상태를 지켜볼 수 있는 관리 순서를 정리했습니다.",careActions:["오늘은 모발을 과하게 당기거나 높은 열을 오래 가하지 말고 형태 변화를 관찰하세요.","다음 세정 후 윤기와 형태 유지 정도를 같은 조명에서 다시 확인하세요."],cautions:["사진은 조명과 각도에 따라 실제 상태와 다르게 보일 수 있습니다."],nextAction:"불편 신호가 없다면 안내한 관리를 이어가고, 변화가 크면 시술 살롱에 현재 상태를 공유하세요.",evidenceIds};
    return normalizeAftercareCheckinResponseV1(generated??fallback,evidenceIds);
  },failureCode:()=>"AFTERCARE_RESPONSE_FAILED",failureMessage:()=>"관리 답변을 준비하지 못했습니다. 입력은 저장되어 있으며 다시 시도할 수 있습니다.",
};

export function runAftercarePhotoAnalysis(input:{userId:string;consultationId:string;checkinId:string;value:AftercarePhotoAnalysisInput}){
  return runDurableCapability(photoAdapter,{userId:input.userId,consultationId:input.consultationId,idempotencyKey:`aftercare-photo:${input.checkinId}:${input.value.sourceFingerprint}`,input:input.value});
}
export function runAftercareCheckinResponse(input:{userId:string;consultationId:string;checkinId:string;idempotencyKey:string;value:AftercareResponseInput}){
  return runDurableCapability(responseAdapter,{userId:input.userId,consultationId:input.consultationId,idempotencyKey:`aftercare-response:${input.checkinId}:${input.idempotencyKey}:${capabilityFingerprint(input.value)}`,input:input.value});
}
