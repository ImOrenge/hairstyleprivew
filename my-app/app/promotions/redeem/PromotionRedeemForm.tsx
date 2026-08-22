"use client";

import { useState } from "react";
import { Button } from "../../../components/ui/Button";
import { LAUNCH_PROMOTION_CODE } from "../../../lib/email-campaign";

export function PromotionRedeemForm(){
  const [code,setCode]=useState(LAUNCH_PROMOTION_CODE);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<string|null>(null);
  const [done,setDone]=useState(false);
  return <form className="grid gap-4" onSubmit={async event=>{event.preventDefault();if(busy||done)return;setBusy(true);setMessage(null);const response=await fetch("/api/promotions/redeem",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({code})});const payload=await response.json().catch(()=>({})) as {error?:string};setBusy(false);if(response.ok){setDone(true);setMessage("무료 풀스타일 1회권이 등록되었습니다. 30일 안에 상담을 시작해 주세요.");}else setMessage(payload.error||"이용권을 등록하지 못했습니다.");}}><label className="grid gap-2 text-sm font-black" htmlFor="promotion-code">프로모션 코드<input id="promotion-code" value={code} onChange={event=>setCode(event.target.value)} autoComplete="off" className="min-h-12 border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-3 text-base uppercase" /></label><Button type="submit" disabled={busy||done}>{busy?"등록 중…":done?"등록 완료":"무료 이용권 등록"}</Button>{message?<p role={done?"status":"alert"} aria-live="polite" className="text-sm leading-6">{message}</p>:null}<p className="text-xs leading-5 text-[var(--app-muted)]">기존 회원 계정당 한 번 사용할 수 있습니다. 등록 후 30일 안에 상담을 시작해야 하며 자동결제·자동갱신은 없습니다.</p></form>;
}
