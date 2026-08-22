"use client";

import { useState } from "react";
import { getFullStyleOffer,type FullStyleOfferingKey } from "../../lib/premium-offer-policy";
import { Button } from "../ui/Button";

type Prepared = { checkoutAttemptId:string;paymentId:string;purchaseMode:"one_time"|"recurring";storeId:string;channelKey?:string;issueId:string;issueName:string;amountKrw:number;currency:"KRW";orderName:string;customer:{customerId:string;fullName:string;email:string;phoneNumber:string};error?:string };

export function FullStyleCheckoutForm({ offeringKey,priceVersion,consultationId,initialBuyerName="",initialBuyerEmail="",initialBuyerPhone="" }:{
  offeringKey:FullStyleOfferingKey;priceVersion:number;consultationId?:string;initialBuyerName?:string;initialBuyerEmail?:string;initialBuyerPhone?:string;
}) {
  const offer=getFullStyleOffer(offeringKey)!;
  const [buyerName,setBuyerName]=useState(initialBuyerName); const [buyerEmail,setBuyerEmail]=useState(initialBuyerEmail); const [buyerPhone,setBuyerPhone]=useState(initialBuyerPhone);
  const [agreed,setAgreed]=useState(false); const [pending,setPending]=useState(false); const [error,setError]=useState<string|null>(null);
  const finish=(result:{paymentId?:string})=>{const target=consultationId?`/consulting/${encodeURIComponent(consultationId)}/previews?upgraded=1`:"/billing?purchase=success";const url=new URL(target,window.location.origin);if(result.paymentId)url.searchParams.set("payment_id",result.paymentId);window.location.assign(`${url.pathname}${url.search}`);};
  const submit=async()=>{
    if(!agreed){setError("결제·자동갱신·해지·환불 정책을 확인해 주세요.");return;} setPending(true);setError(null);
    try{
      const response=await fetch("/api/payments/full-style/prepare",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({offeringKey,priceVersion,consultationId,buyerName,buyerEmail,buyerPhone})});
      const prepared=await response.json().catch(()=>({})) as Prepared;if(!response.ok)throw new Error(prepared.error||"결제를 준비하지 못했습니다.");
      const PortOne=(await import("@portone/browser-sdk/v2")).default;if(!PortOne)throw new Error("결제 모듈을 불러오지 못했습니다.");
      if(prepared.purchaseMode==="one_time"){
        const payment=await PortOne.requestPayment({storeId:prepared.storeId,channelKey:prepared.channelKey,paymentId:prepared.paymentId,orderName:prepared.orderName,totalAmount:prepared.amountKrw,currency:prepared.currency,payMethod:"CARD",productType:"DIGITAL",customer:prepared.customer,redirectUrl:window.location.href,customData:{purchaseType:"full_style",offeringKey,consultationId:consultationId||null}} as never) as {paymentId?:string;code?:string;message?:string}|undefined;
        if(!payment||payment.code==="USER_CANCEL")return;if(payment.code)throw new Error(payment.message||"결제가 완료되지 않았습니다.");
        const complete=await fetch("/api/payments/full-style/complete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({checkoutAttemptId:prepared.checkoutAttemptId})});const result=await complete.json().catch(()=>({})) as {paymentId?:string;error?:string};if(!complete.ok)throw new Error(result.error||"결제를 확인하지 못했습니다.");finish(result);return;
      }
      const issued=await PortOne.requestIssueBillingKey({storeId:prepared.storeId,channelKey:prepared.channelKey,billingKeyMethod:"CARD",issueId:prepared.issueId,issueName:prepared.issueName,displayAmount:prepared.amountKrw,currency:prepared.currency,customer:prepared.customer} as never) as {billingKey?:string;billingIssueToken?:string;code?:string;message?:string}|undefined;
      if(!issued||issued.code==="USER_CANCEL")return;if(issued.code||!issued.billingKey)throw new Error(issued.message||"정기결제 수단을 등록하지 못했습니다.");
      const subscribe=await fetch("/api/payments/full-style/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({checkoutAttemptId:prepared.checkoutAttemptId,billingKey:issued.billingKey,billingIssueToken:issued.billingIssueToken})});const result=await subscribe.json().catch(()=>({})) as {paymentId?:string;error?:string};if(!subscribe.ok)throw new Error(result.error||"정기결제를 시작하지 못했습니다.");finish(result);
    }catch(caught){setError(caught instanceof Error?caught.message:"결제 중 오류가 발생했습니다.");}finally{setPending(false);}
  };
  return <form className="grid gap-5" onSubmit={(event)=>{event.preventDefault();void submit();}}>
    <div className="grid gap-3"><p className="text-sm font-black">구매자 정보</p>
      <label className="grid gap-1 text-xs font-bold">이름<input required value={buyerName} onChange={(event)=>setBuyerName(event.target.value)} className="h-11 border border-[var(--app-border)] bg-[var(--app-bg)] px-3 text-sm" /></label>
      <label className="grid gap-1 text-xs font-bold">이메일<input required type="email" value={buyerEmail} onChange={(event)=>setBuyerEmail(event.target.value)} className="h-11 border border-[var(--app-border)] bg-[var(--app-bg)] px-3 text-sm" /></label>
      <label className="grid gap-1 text-xs font-bold">전화번호<input required type="tel" value={buyerPhone} onChange={(event)=>setBuyerPhone(event.target.value)} className="h-11 border border-[var(--app-border)] bg-[var(--app-bg)] px-3 text-sm" /></label>
    </div>
    <label className="flex gap-3 border border-[var(--app-border)] p-4 text-sm leading-6"><input type="checkbox" checked={agreed} onChange={(event)=>setAgreed(event.target.checked)} className="mt-1" /><span>부가세 포함 총액, {offer.sessions}회 상담, 상담당 전체 재시작 {offer.restartCount}회와 AI 사후상담 {offer.aftercareConsultationCount}회, 결과 보관기간, 미사용 회차 무이월, 자동갱신일, 기간말 해지 및 환불 검토 정책을 확인했습니다.</span></label>
    {error?<p role="alert" className="border border-[var(--app-danger)] p-3 text-sm text-[var(--app-danger)]">{error}</p>:null}
    <Button type="submit" disabled={pending||!agreed} loading={pending}>주문 확인 후 결제하기</Button>
  </form>;
}
