import { footerBusinessInfo } from "./business-info";

export const LAUNCH_PROMOTION_CODE = "HAIRFIT-OPEN-30";
export const MARKETING_CONSENT_POLICY_VERSION = "marketing-email-consent-2026-08-22-v1";

export type EmailCampaignTemplateVersion =
  | "service-premium-update-v1"
  | "official-launch-promotion-v1";

export type EmailCampaignRenderInput = {
  templateVersion: EmailCampaignTemplateVersion;
  displayName?: string | null;
  claimEndsAt?: string | null;
  promotionCode?: string | null;
  redeemUrl: string;
  unsubscribeUrl?: string | null;
  subjectOverride?: string | null;
  preheaderOverride?: string | null;
};

export type RenderedCampaignEmail = {
  subject: string;
  preheader: string;
  html: string;
  text: string;
};

const business = Object.fromEntries(footerBusinessInfo.rows.map((row) => [row.label, row.value]));

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] || character);
}

function formatKoreanDate(value?: string | null) {
  if (!value) return "캠페인 안내에 표시된 날짜";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "캠페인 안내에 표시된 날짜";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul",
  }).format(parsed);
}

function layout(input: { preheader:string; kicker:string; title:string; body:string; footer:string }) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(input.title)}</title></head><body style="margin:0;background:#f4f1eb;color:#171717;font-family:Arial,'Apple SD Gothic Neo',sans-serif"><span style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.preheader)}</span><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1eb"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border:1px solid #d9d3c9"><tr><td style="padding:32px"><p style="margin:0 0 10px;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(input.kicker)}</p><h1 style="margin:0 0 22px;font-size:28px;line-height:1.3">${escapeHtml(input.title)}</h1>${input.body}</td></tr><tr><td style="border-top:1px solid #e4dfd7;padding:22px 32px;font-size:12px;line-height:1.7;color:#67635d">${input.footer}</td></tr></table></td></tr></table></body></html>`;
}

function paragraph(value: string) {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.75">${escapeHtml(value)}</p>`;
}

function list(items: string[]) {
  return `<ul style="margin:4px 0 20px;padding-left:20px;font-size:14px;line-height:1.8">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function button(label: string, url: string) {
  return `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#171717;color:#fff;text-decoration:none;padding:14px 20px;font-weight:800">${escapeHtml(label)}</a></p>`;
}

function businessFooter(unsubscribeUrl?: string | null) {
  const optOut = unsubscribeUrl
    ? `<br><a href="${escapeHtml(unsubscribeUrl)}" style="color:#444">광고성 정보 수신거부</a>`
    : "";
  return `${escapeHtml(business["상호"] || "제이코더랩")} · 대표 ${escapeHtml(business["대표자"] || "")}<br>${escapeHtml(business["사업장 주소"] || "")}<br>고객센터 <a href="mailto:${escapeHtml(business["고객센터"] || "support@hairfit.beauty")}" style="color:#444">${escapeHtml(business["고객센터"] || "support@hairfit.beauty")}</a>${optOut}`;
}

export function renderEmailCampaign(input: EmailCampaignRenderInput): RenderedCampaignEmail {
  const name = input.displayName?.trim() || "고객";
  if (input.templateVersion === "service-premium-update-v1") {
    const defaultSubject = "[HairFit] 풀 스타일 컨설팅 서비스 개편 안내";
    const defaultPreheader = "현재 이용권은 그대로 유지되며 상담 결과와 사후관리 경험이 더 구체적으로 바뀝니다.";
    const promotionalCopy = /\(광고\)|할인|무료|프로모션|쿠폰|구매|마감|HAIRFIT[- ]?OPEN[- ]?30/i;
    const requestedSubject = input.subjectOverride?.trim() || "";
    const requestedPreheader = input.preheaderOverride?.trim() || "";
    const subject = requestedSubject && !promotionalCopy.test(requestedSubject) ? requestedSubject : defaultSubject;
    const preheader = requestedPreheader && !promotionalCopy.test(requestedPreheader) ? requestedPreheader : defaultPreheader;
    const body = [
      paragraph(`${name}님, HairFit 풀 스타일 컨설팅의 결과 구성과 이용 흐름이 개편됩니다.`),
      list([
        "사진 근거를 바탕으로 한 정밀 퍼스널 컬러 설명",
        "헤어 3×3 생성과 최종 헤어 1개 확정",
        "퍼스널 컬러 기반 메이크업 전문 리포트와 패션 방향",
        "Salon Brief, AI 종합 리포트, PDF, 시술 후 애프터케어",
      ]),
      paragraph("이미 구매한 계약의 가격, 회차, 보관기간과 사용 권리는 결제 당시의 상품 snapshot대로 유지됩니다."),
      paragraph("이 안내는 서비스 이용에 영향을 주는 변경사항을 설명하기 위한 것으로 할인이나 구매를 권유하지 않습니다."),
      button("내 이용권 확인하기", input.redeemUrl),
    ].join("");
    return { subject, preheader, html:layout({ preheader,kicker:"Service update",title:"풀 스타일 컨설팅이 더 구체적으로 바뀝니다",body,footer:businessFooter() }), text:[`${name}님, HairFit 풀 스타일 컨설팅 서비스 개편 안내입니다.`,"","- 정밀 퍼스널 컬러 설명","- 헤어 3×3 생성과 최종 1개 확정","- 메이크업 전문 리포트와 패션 방향","- Salon Brief, AI 리포트, PDF, 애프터케어","","기존 계약의 가격, 회차, 보관기간과 사용 권리는 결제 당시 기준으로 유지됩니다.",`내 이용권 확인: ${input.redeemUrl}`,"",`${business["상호"]} · ${business["사업장 주소"]}`,`고객센터 ${business["고객센터"]}`].join("\n") };
  }

  const code = input.promotionCode?.trim() || LAUNCH_PROMOTION_CODE;
  const deadline = formatKoreanDate(input.claimEndsAt);
  const requestedSubject = input.subjectOverride?.trim() || "HairFit 정식 출시 기념, 기존 회원 무료 풀스타일 1회권";
  const subject = /^\(광고\)/.test(requestedSubject) ? requestedSubject : `(광고) ${requestedSubject}`;
  const preheader = input.preheaderOverride?.trim() || `${code} 등록 후 30일 안에 무료 풀스타일 상담을 시작하세요.`;
  const body = [
    paragraph(`${name}님, HairFit 정식 서비스 시작을 기념해 기존 회원 전용 무료 풀스타일 1회권을 준비했습니다.`),
    `<div style="margin:20px 0;padding:18px;border:1px solid #171717;background:#faf8f3"><p style="margin:0 0 6px;font-size:12px;font-weight:800">프로모션 코드</p><p style="margin:0;font-size:24px;font-weight:900;letter-spacing:.06em">${escapeHtml(code)}</p></div>`,
    list([
      "정밀 퍼스널 컬러와 추천·회피 팔레트",
      "헤어 9개 생성, 최종 1개 확정, 전체 재시작 1회",
      "메이크업·패션 방향, Salon Brief, AI 리포트와 PDF",
      "결과 60일 보관, 실제 시술 후 D+30 AI 사후상담 1회",
    ]),
    paragraph(`코드는 ${deadline}까지 계정당 한 번 등록할 수 있으며, 등록한 날부터 30일 안에 상담을 시작해야 합니다.`),
    paragraph("자동결제나 자동갱신은 없으며, 현금 환불·양도·판매는 불가능합니다. 품질 실패에 따른 자동 재처리는 재시작 횟수에서 차감하지 않습니다."),
    button("무료 풀스타일 1회권 등록하기", input.redeemUrl),
  ].join("");
  const optOut = input.unsubscribeUrl ? `\n광고성 정보 수신거부: ${input.unsubscribeUrl}` : "";
  return { subject, preheader, html:layout({ preheader,kicker:"Official launch benefit",title:"기존 회원을 위한 무료 풀스타일 1회권",body,footer:businessFooter(input.unsubscribeUrl) }), text:[`${name}님, HairFit 정식 출시 기념 무료 풀스타일 1회권을 드립니다.`,`프로모션 코드: ${code}`,`등록 마감: ${deadline}`,"","혜택: 정밀 퍼스널 컬러, 헤어 9개와 최종 1개, 재시작 1회, 메이크업·패션, Salon Brief, AI 리포트·PDF, 결과 60일 보관, D+30 AI 사후상담 1회.","","등록 후 30일 안에 상담을 시작해야 합니다. 자동결제·자동갱신은 없고 현금 환불과 양도는 불가능합니다.",`등록하기: ${input.redeemUrl}`,"",`${business["상호"]} · ${business["사업장 주소"]}`,`고객센터 ${business["고객센터"]}${optOut}`].join("\n") };
}

export function marketingUnsubscribeHeaders(unsubscribeUrl: string) {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function normalizePromotionCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
