import "server-only";

import {
  FULL_STYLE_REFUND_POLICY_VERSION,
  type FullStyleContractDocumentSnapshotV2,
  type OfferingCapabilities,
} from "@hairfit/shared/v2";
import { footerBusinessInfo } from "../business-info";

function businessValue(label:string) {
  return footerBusinessInfo.rows.find((row)=>row.label===label)?.value ?? "";
}

export function assertFullStyleContractDocumentReady() {
  const requiredLabels=["상호","대표자","사업자등록번호","사업장 주소","연락처","고객센터"];
  const missing=requiredLabels.filter((label)=>!businessValue(label));
  if(!process.env.NEXT_PUBLIC_MAIL_ORDER_REPORT_NUMBER?.trim())missing.push("통신판매업 신고번호");
  if(missing.length>0)throw new Error(`계약 사업자 고지 준비가 완료되지 않았습니다: ${missing.join(", ")}`);
}

export function buildFullStyleContractDocument(input:{
  contractId:string;
  paymentTransactionId:string;
  issuedAt:string;
  offeringKey:string;
  offeringLabel:string;
  description:string;
  includedSessions:number;
  billingInterval:"quarter"|"year"|null;
  amountKrw:number;
  nextBillingAt:string|null;
  capabilities:OfferingCapabilities;
  billingUrl:string;
}):FullStyleContractDocumentSnapshotV2 {
  assertFullStyleContractDocumentReady();
  const retentionDays=Number(input.capabilities.generatedAssetRetentionDays ?? 60);
  const requestUrl=`${input.billingUrl}${input.billingUrl.includes("?")?"&":"?"}refundTransaction=${encodeURIComponent(input.paymentTransactionId)}`;
  return {
    schemaVersion:"full-style-contract-document-v2",
    policyVersion:FULL_STYLE_REFUND_POLICY_VERSION,
    contractId:input.contractId,
    paymentTransactionId:input.paymentTransactionId,
    issuedAt:input.issuedAt,
    seller:{
      businessName:businessValue("상호"),
      representative:businessValue("대표자"),
      businessRegistrationNumber:businessValue("사업자등록번호"),
      mailOrderReportNumber:process.env.NEXT_PUBLIC_MAIL_ORDER_REPORT_NUMBER?.trim()||null,
      address:businessValue("사업장 주소"),
      phone:businessValue("연락처"),
      supportEmail:businessValue("고객센터"),
    },
    product:{
      offeringKey:input.offeringKey,
      offeringLabel:input.offeringLabel,
      description:input.description,
      includedSessions:input.includedSessions,
      billingInterval:input.billingInterval??"one_time",
      serviceContents:[
        "얼굴·모발 분석과 정밀 퍼스널 컬러",
        "AI 주도 방향 설정과 고객 추가 요청 반영",
        "헤어 3×3 생성, 비교, 최종 헤어 1개 확정",
        "염색·메이크업·패션 디렉팅과 Salon Brief",
        "AI 결과 해설과 PDF, 관리 안내 및 플랜별 사후상담",
      ],
      technicalRequirements:[
        "최신 브라우저와 인터넷 연결이 필요합니다.",
        "사진 기반 분석을 위해 얼굴과 모발이 보이는 사진 및 명시적 동의가 필요합니다.",
        "사진 환경에 따라 색상과 형태 표현이 실제와 다를 수 있습니다.",
      ],
    },
    payment:{
      amountKrw:input.amountKrw,
      vatIncluded:true,
      provider:"portone",
      method:"PortOne 전자결제",
      paidAt:input.issuedAt,
      nextBillingAt:input.nextBillingAt,
    },
    supply:{
      method:"HairFit 웹 상담에서 생성·열람하고 완료 후 PDF로 제공합니다.",
      availableFrom:input.issuedAt,
      resultRetentionDays:retentionDays,
    },
    withdrawal:{
      statutoryDays:7,
      simpleChangeAfterWindow:"not_refundable",
      startedSessionRestriction:true,
      annualUnusedSessionUnitAmountKrw:input.offeringKey==="full_style_annual"?Math.floor(input.amountKrw/input.includedSessions):null,
      requestMethod:"계약·구매 관리의 환불 인터뷰 또는 고객센터 이메일로 신청",
      requestUrl,
      exceptionSummary:[
        "중복·오결제, 과오납 또는 승인하지 않은 결제",
        "HairFit 책임으로 결과를 제공하지 못한 경우",
        "표시·광고 또는 계약과 중요한 부분이 다른 경우",
        "개인정보 또는 안전 문제",
      ],
    },
    renewalAndCancellation:{
      autoRenewal:input.billingInterval!==null,
      renewalCycle:input.billingInterval==="quarter"?"3개월":input.billingInterval==="year"?"1년":null,
      carryOver:false,
      periodEndCancellationAvailable:true,
    },
    dispute:{
      complaintMethod:`${businessValue("고객센터")} 또는 ${businessValue("연락처")}`,
      processingStandard:"사실관계와 결제·서비스 제공 기록을 확인해 결과와 처리 일정을 안내합니다.",
      delayedRefundStandard:"환불 의무가 확정되면 법정 기간 안에 처리하며 지연 시 관계 법령의 지연배상 기준을 적용합니다.",
    },
  };
}
