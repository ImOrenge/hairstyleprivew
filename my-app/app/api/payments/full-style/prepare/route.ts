import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { readPortoneBillingKeyChannelKey, readPortonePaymentChannelKey, readPortoneStoreId } from "../../../../../lib/portone";
import { prepareFullStyleCheckout } from "../../../../../lib/v2/full-style-checkout-server";
import { isHairfitV2Enabled } from "../../../../../lib/v2/feature-flags";
import { v2Failure } from "../../../../../lib/v2/http";

function text(value:unknown,max:number) { return typeof value === "string" ? value.trim().slice(0,max) : ""; }

export async function POST(request:Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error:"로그인이 필요합니다." },{status:401});
  if (!isHairfitV2Enabled("FULL_STYLE_CATALOG_ENABLED") || !isHairfitV2Enabled("FULL_STYLE_CHECKOUT_ENABLED")) return NextResponse.json({error:"결제를 순차 오픈 중입니다."},{status:404});
  try {
    const body = await request.json().catch(() => ({})) as Record<string,unknown>;
    const clerk = await currentUser();
    const fullName = text(body.buyerName,80) || clerk?.fullName?.trim() || clerk?.firstName?.trim() || "";
    const email = text(body.buyerEmail,120) || clerk?.primaryEmailAddress?.emailAddress?.trim() || "";
    const phoneNumber = text(body.buyerPhone,20).replace(/[^\d+]/g,"") || clerk?.primaryPhoneNumber?.phoneNumber?.trim() || "";
    if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\+?\d{8,15}$/.test(phoneNumber)) return NextResponse.json({error:"구매자 이름, 이메일, 전화번호를 다시 확인해 주세요."},{status:400});
    const offeringKey=text(body.offeringKey,50); const priceVersion=Number(body.priceVersion);
    const prepared=await prepareFullStyleCheckout({ userId,offeringKey,priceVersion,
      consultationId:text(body.consultationId,80)||null,customer:{fullName,email,phoneNumber} });
    const recurring=prepared.offering.purchase_mode === "recurring";
    const issueId=`fsi-${prepared.paymentId}`.slice(0,40);
    return NextResponse.json({ checkoutAttemptId:prepared.checkoutAttemptId,paymentId:prepared.paymentId,
      offeringKey:prepared.offering.offering_key,purchaseMode:prepared.offering.purchase_mode,
      billingInterval:prepared.offering.billing_interval,orderName:prepared.offering.customer_name,
      amountKrw:prepared.price.amount_minor,currency:prepared.price.currency,storeId:readPortoneStoreId(),
      channelKey:recurring?readPortoneBillingKeyChannelKey():readPortonePaymentChannelKey(),
      issueId,issueName:prepared.offering.customer_name,billingKeyMethod:"CARD",displayAmount:prepared.price.amount_minor,
      payMethod:"CARD",productType:"DIGITAL",customer:{customerId:userId,fullName,email,phoneNumber} });
  } catch(error) { return v2Failure(error); }
}
