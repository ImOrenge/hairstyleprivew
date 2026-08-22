"use client";

import { useState } from "react";
import { Button } from "../../../components/ui/Button";

export function UnsubscribeForm({token}:{token:string}){
  const [state,setState]=useState<"idle"|"busy"|"done"|"error">("idle");
  return <div className="grid gap-4">
    <p className="text-sm leading-6 text-[var(--app-muted)]">광고성 이메일 수신을 중단합니다. 서비스 이용과 계약에 필요한 안내는 계속 받을 수 있습니다.</p>
    {state==="done"?<p role="status" className="font-bold">수신거부가 완료되었습니다.</p>:<Button disabled={state==="busy"} onClick={async()=>{setState("busy");const response=await fetch("/api/email/unsubscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});setState(response.ok?"done":"error");}}>{state==="busy"?"처리 중…":"광고성 이메일 수신거부"}</Button>}
    {state==="error"?<p role="alert" className="text-sm text-[var(--app-danger)]">처리하지 못했습니다. 고객센터에 문의해 주세요.</p>:null}
  </div>;
}
