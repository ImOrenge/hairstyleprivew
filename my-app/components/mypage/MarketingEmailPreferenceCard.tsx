"use client";

import { useEffect, useState } from "react";
import { MARKETING_CONSENT_POLICY_VERSION } from "../../lib/email-campaign";
import { Button } from "../ui/Button";
import { SurfaceCard } from "../ui/Surface";

export function MarketingEmailPreferenceCard(){
  const [status,setStatus]=useState<"unknown"|"opted_in"|"opted_out">("unknown");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<string|null>(null);
  useEffect(()=>{let active=true;void fetch("/api/me/marketing-email-preference",{cache:"no-store"}).then(async r=>r.ok?await r.json() as {preference?:{status?:"unknown"|"opted_in"|"opted_out"}}:null).then(p=>{if(active&&p?.preference?.status)setStatus(p.preference.status)});return()=>{active=false};},[]);
  const save=async(optedIn:boolean)=>{setBusy(true);setMessage(null);const response=await fetch("/api/me/marketing-email-preference",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({optedIn,policyVersion:MARKETING_CONSENT_POLICY_VERSION})});setBusy(false);if(response.ok){setStatus(optedIn?"opted_in":"opted_out");setMessage("수신 설정을 저장했습니다.");}else setMessage("수신 설정을 저장하지 못했습니다.");};
  return <SurfaceCard className="mt-4 px-4 py-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-black">혜택·프로모션 이메일</p><p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">출시 혜택과 스타일 컨설팅 소식을 선택적으로 받습니다. 동의하지 않아도 서비스 이용에는 영향이 없습니다.</p><p className="mt-1 text-xs text-[var(--app-muted)]">현재 상태: {status==="opted_in"?"수신 동의":status==="opted_out"?"수신거부":"선택하지 않음"}</p></div><div className="flex shrink-0 gap-2"><Button variant="secondary" disabled={busy||status==="opted_out"} onClick={()=>void save(false)}>수신하지 않음</Button><Button disabled={busy||status==="opted_in"} onClick={()=>void save(true)}>수신 동의</Button></div></div>{message?<p role="status" aria-live="polite" className="mt-3 text-sm">{message}</p>:null}</SurfaceCard>;
}
