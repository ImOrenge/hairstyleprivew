"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SurfaceCard } from "../ui/Surface";

type PromotionState={enabled:boolean;eligible:boolean;redeemed?:boolean;campaign?:{code:string;claimEndsAt:string;grantValidDays:number}};

export function LaunchPromotionCard({className=""}:{className?:string}){
  const [state,setState]=useState<PromotionState|null>(null);
  useEffect(()=>{let active=true;void fetch("/api/promotions/launch",{cache:"no-store"}).then(async(response)=>response.ok?await response.json() as PromotionState:null).then(payload=>{if(active)setState(payload)});return()=>{active=false};},[]);
  if(!state?.enabled||!state.eligible||!state.campaign)return null;
  return <SurfaceCard className={`f-launch-promotion-card border-[var(--app-border-strong)] px-5 py-5 ${className}`}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="app-kicker">정식 출시 기존 회원 혜택</p><h2 className="mt-2 text-xl font-black">무료 풀스타일 1회권</h2><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">코드 <strong className="text-[var(--app-text)]">{state.campaign.code}</strong> · 등록 후 {state.campaign.grantValidDays}일 안에 상담 시작 · 자동결제 없음</p></div>
      {state.redeemed?<p role="status" className="text-sm font-black">이용권 등록 완료</p>:<Link href="/promotions/redeem" className="inline-flex min-h-11 shrink-0 items-center justify-center bg-[var(--app-text)] px-5 text-sm font-black text-[var(--app-background)]">무료 이용권 등록</Link>}
    </div>
  </SurfaceCard>;
}
