import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { chargeAndCompleteFullStyleSubscription } from "../../../../../lib/v2/full-style-checkout-server";
import { isHairfitV2Enabled } from "../../../../../lib/v2/feature-flags";
import { v2Failure } from "../../../../../lib/v2/http";

export async function POST(request:Request) {
  const {userId}=await auth(); if(!userId)return NextResponse.json({error:"로그인이 필요합니다."},{status:401});
  if(!isHairfitV2Enabled("FULL_STYLE_CHECKOUT_ENABLED"))return NextResponse.json({error:"결제를 순차 오픈 중입니다."},{status:404});
  const body=await request.json().catch(()=>({})) as {checkoutAttemptId?:unknown;billingKey?:unknown;billingIssueToken?:unknown};
  if(typeof body.checkoutAttemptId!=="string"||typeof body.billingKey!=="string")return NextResponse.json({error:"정기결제 준비 정보가 필요합니다."},{status:400});
  try{return NextResponse.json(await chargeAndCompleteFullStyleSubscription({userId,checkoutAttemptId:body.checkoutAttemptId,billingKey:body.billingKey,billingIssueToken:typeof body.billingIssueToken==="string"?body.billingIssueToken:undefined}));}catch(error){return v2Failure(error);}
}
