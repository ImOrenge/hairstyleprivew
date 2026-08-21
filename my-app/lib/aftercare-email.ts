export const AFTERCARE_EMAIL_CHECKPOINTS = ["d1", "d3", "d7", "d30", "d45", "d90"] as const;

export type AftercareEmailCheckpoint = (typeof AFTERCARE_EMAIL_CHECKPOINTS)[number];

export interface AftercareEmailContentV1 {
  schemaVersion: "aftercare-email-content-v1";
  checkpoint: AftercareEmailCheckpoint;
  title: string;
  preheader: string;
  summary: string;
  careSteps: string[];
  cautions: string[];
  cta: { label: string; url: string };
  manageUrl: string;
  actualServiceId: string;
  consultationId: string;
  programVersion: number;
}

export interface AftercareEmailItemV1 {
  checkpoint: AftercareEmailCheckpoint;
  scheduledSendAt: string;
  templateVersion: "aftercare-email-v1";
  content: AftercareEmailContentV1;
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

const DAY_OFFSET: Record<AftercareEmailCheckpoint, number> = {
  d1: 1,
  d3: 3,
  d7: 7,
  d30: 30,
  d45: 45,
  d90: 90,
};

const LABEL: Record<AftercareEmailCheckpoint, string> = {
  d1: "D+1",
  d3: "D+3",
  d7: "D+7",
  d30: "D+30",
  d45: "D+45",
  d90: "D+90",
};

const DEFAULT_SUMMARY: Record<AftercareEmailCheckpoint, string> = {
  d1: "시술 직후 24시간은 결과가 안정되는 초기 관찰 구간입니다. 두피 반응과 모발의 건조감부터 확인하고, 세정·건조·열 자극은 디자이너가 안내한 범위 안에서 최소화해 주세요.",
  d3: "초기 불편감이 가라앉는지 확인하면서 수분과 유분의 균형을 다시 잡을 시점입니다. 샴푸 후 모발이 엉키는 구간과 뿌리 방향을 기록하면 이후 루틴을 더 정확하게 조정할 수 있습니다.",
  d7: "일주일 동안 실제로 손질해 본 결과를 기준으로 유지력과 재현성을 평가해 주세요. 제품 사용량, 드라이 방향, 열기구 온도를 한 번에 모두 바꾸지 말고 한 항목씩 조정하는 것이 좋습니다.",
  d30: "한 달차에는 뿌리 성장, 끝의 건조감, 컬 또는 색의 변화를 함께 비교해야 합니다. 처음 사진과 현재 상태를 나란히 보고 홈케어 보강과 살롱 보정 중 무엇이 필요한지 판단해 주세요.",
  d45: "중기 유지 구간에서는 색 빠짐·컬 늘어짐·모발 표면의 거칠기를 구분해 살펴보는 것이 중요합니다. 현재 상태에 맞지 않는 고정력이나 무거운 제품은 줄이고 다음 관리 계획을 준비하세요.",
  d90: "장기 체크포인트에서는 현재 길이와 형태, 손상 누적, 일상 손질 시간을 종합해 다음 시술 주기를 정합니다. 같은 시술을 반복하기 전에 회복 기간과 원하는 변화의 우선순위를 먼저 정리해 주세요.",
};

const CHECKPOINT_STEPS: Record<AftercareEmailCheckpoint, string[]> = {
  d1: [
    "밝은 곳에서 두피의 붉어짐, 따가움, 가려움과 모발 끝의 과도한 건조감을 확인하고 평소와 다른 반응은 사진과 메모로 남겨 주세요.",
    "첫 세정 시점과 물 온도는 시술 방식에 따라 달라질 수 있으므로 디자이너의 개별 안내를 우선하고, 안내 전에는 땀과 마찰을 줄여 주세요.",
    "젖은 모발은 비비지 말고 타월로 눌러 물기를 제거한 뒤 두피와 뿌리부터 중간 온도 바람으로 말려 형태를 잡아 주세요.",
    "열기구가 꼭 필요하다면 모발을 완전히 말린 뒤 열 보호제를 얇게 바르고 낮은 온도에서 짧게 한 번만 통과해 주세요.",
    "취침 전 모발과 두피가 완전히 마른 상태인지 확인하고, 눌림을 줄이도록 모발을 자연스러운 방향으로 정돈해 주세요.",
  ],
  d3: [
    "샴푸 후 뻣뻣함, 엉킴, 유분 과다 중 어떤 변화가 두드러지는지 확인해 세정력과 보습 제품의 강도를 조절해 주세요.",
    "샴푸는 손에서 충분히 거품을 낸 뒤 두피 중심으로 사용하고, 모발 길이 부분은 흘러내리는 거품으로 부드럽게 세정해 주세요.",
    "트리트먼트는 모발 중간부터 끝에 소량씩 나누어 바르고 권장 시간만 둔 뒤 미지근한 물로 잔여감 없이 헹궈 주세요.",
    "뿌리 방향이 눌렸다면 물 스프레이로 해당 구간만 다시 적신 뒤 원하는 반대 방향으로 먼저 말리고 최종 방향으로 정리해 주세요.",
    "제품을 추가할 때는 한 번에 여러 개를 바꾸지 말고 한 제품의 양만 조절해 다음 날 무게감과 유지력을 비교해 주세요.",
  ],
  d7: [
    "시술 직후 사진과 현재 사진을 같은 조명과 각도에서 비교해 볼륨, 컬, 색, 윤기 중 가장 먼저 달라진 요소를 찾아 주세요.",
    "아침 손질에 오래 걸리는 구간을 표시하고 그 구간만 드라이 방향 또는 제품 사용량을 조정해 전체 열 노출을 줄여 주세요.",
    "열기구는 모발 굵기와 손상도에 맞는 낮은 온도에서 시작하고, 같은 구간을 반복해서 집지 않도록 섹션을 작게 나눠 주세요.",
    "주 1~2회는 평소 트리트먼트 대신 집중 보습 루틴을 적용하되, 모발이 처지면 사용량이나 빈도를 즉시 줄여 주세요.",
    "두피 불편감, 급격한 색 변화, 컬의 불균형이 계속되면 자가 보정보다 시술 살롱에 사진과 함께 상담해 주세요.",
  ],
  d30: [
    "뿌리에서 새로 자란 길이와 모발 끝의 갈라짐을 확인하고, 볼륨 저하가 성장 때문인지 손상 때문인지 구분해 주세요.",
    "처음 의도한 실루엣이 유지되는지 앞·옆·뒤 사진으로 비교하고 손질로 해결되지 않는 구간을 별도로 표시해 주세요.",
    "보습 후에도 거칠기가 남는다면 무거운 오일을 늘리기보다 세정 빈도, 열 노출, 단백질 제품 사용 간격을 함께 점검해 주세요.",
    "컬 또는 색을 유지하려고 고정력이 강한 제품을 과하게 겹치지 말고, 잔여감이 남는 날에는 부드러운 세정으로 초기화해 주세요.",
    "살롱 보정이 필요하면 원하는 변화와 피하고 싶은 결과, 현재 홈케어 제품을 정리해 상담 시 함께 전달해 주세요.",
  ],
  d45: [
    "색 빠짐, 컬 늘어짐, 윤기 저하를 각각 평가하고 가장 불편한 한 가지를 다음 관리의 우선순위로 정해 주세요.",
    "모발이 무겁고 축 처지면 오일·크림의 총량을 줄이고, 건조하고 부스스하면 가벼운 리브인 제품을 소량씩 추가해 주세요.",
    "열 스타일링 횟수와 온도를 일주일 단위로 기록해 손상 증가와 유지력 변화가 연결되는지 확인해 주세요.",
    "두피 스케일링이나 고농축 단백질 관리는 현재 자극과 손상 상태에 따라 달라지므로 반복 사용 전 전문가와 상의해 주세요.",
    "다음 방문을 계획한다면 현재 상태 사진과 함께 유지하고 싶은 점, 바꾸고 싶은 점을 각각 두 가지 이내로 정리해 주세요.",
  ],
  d90: [
    "현재 길이, 뿌리 성장, 끝 손상, 일상 손질 시간을 종합해 같은 스타일 유지와 디자인 변경 중 우선순위를 정해 주세요.",
    "반복 시술 전에는 최근 3개월의 염색·펌·탈색·열기구 이력을 정리해 디자이너가 누적 손상 위험을 판단할 수 있게 해 주세요.",
    "끝 갈라짐이나 끊어짐이 많다면 길이 유지보다 손상 구간 정리를 먼저 검토하고, 화학 시술 간격은 전문가 판단을 따라 주세요.",
    "원하는 다음 스타일 사진은 현재 모발 길이와 질감이 비슷한 예시를 골라 가능한 변화와 추가 과정이 필요한 변화를 구분해 주세요.",
    "다음 상담 전 HairFit 기록에 만족도와 불편 구간을 업데이트해 이전 결과와 비교 가능한 관리 이력을 남겨 주세요.",
  ],
};

const STANDARD_CAUTIONS = [
  "심한 화끈거림, 부종, 진물, 호흡 불편 또는 빠르게 악화되는 증상이 있으면 제품 사용을 중단하고 필요한 경우 의료기관의 도움을 받으세요.",
  "젖은 모발에 고온 열기구를 사용하거나 같은 구간에 열을 반복하면 손상이 커질 수 있습니다.",
  "메일의 일반 안내보다 시술 당일 모발 상태를 확인한 디자이너의 개별 지침을 우선해 주세요.",
];

function serviceSpecificStep(services: string[]) {
  const joined = services.join(" ").toLowerCase();
  if (/탈색|bleach/.test(joined)) return "탈색 모발은 마찰과 고온에 특히 취약하므로 빗질은 끝에서부터 풀고, 보색 제품은 두피 자극과 건조감을 확인하며 권장 빈도 안에서 사용해 주세요.";
  if (/염색|color/.test(joined)) return "염색 모발은 뜨거운 물과 강한 세정으로 색 빠짐이 빨라질 수 있으므로 미지근한 물과 컬러 케어 제품을 사용하고 물 빠짐 정도를 기록해 주세요.";
  if (/펌|perm/.test(joined)) return "펌 모발은 젖었을 때 컬 방향을 손으로 가볍게 잡고 비틀거나 거칠게 빗지 않으며, 완전히 마른 뒤 필요한 고정 제품만 소량 사용해 주세요.";
  if (/클리닉|트리트먼트|treatment/.test(joined)) return "클리닉 후에는 무거운 제품을 겹쳐 바르기보다 부드러운 세정과 적정량의 보습을 유지하고, 처짐과 잔여감이 생기면 사용량을 줄여 주세요.";
  if (/커트|cut/.test(joined)) return "커트 라인은 뿌리 방향과 건조 순서에 따라 달라지므로 눌린 구간을 먼저 적셔 뿌리부터 다시 말리고 끝은 과도하게 당기지 말아 주세요.";
  return "시술 방식과 현재 손상도에 따라 적정 세정·열·제품 사용량이 달라지므로 한 번에 한 요소만 바꾸고 반응을 기록해 주세요.";
}

function cleanText(value: unknown, fallback: string, max = 500) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : fallback;
}

function cleanList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => cleanText(item, ""))
    .filter(Boolean)
    .slice(0, 6);
  return items.length ? items : fallback;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function aftercareScheduledSendAt(serviceDate: string, checkpoint: AftercareEmailCheckpoint) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) throw new Error("serviceDate must use YYYY-MM-DD");
  const midnightKst = new Date(`${serviceDate}T00:00:00+09:00`);
  if (Number.isNaN(midnightKst.getTime())) throw new Error("serviceDate is invalid");
  return new Date(midnightKst.getTime() + DAY_OFFSET[checkpoint] * 86_400_000 + 9 * 3_600_000).toISOString();
}

export function normalizeAftercareEmailBaseUrl(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(parsed.hostname)) {
    throw new Error("aftercare email links require a public HTTPS origin");
  }
  return parsed.origin;
}

export function validateAftercareEmailContent(value: unknown): AftercareEmailContentV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Partial<AftercareEmailContentV1>;
  if (source.schemaVersion !== "aftercare-email-content-v1"
    || !AFTERCARE_EMAIL_CHECKPOINTS.includes(source.checkpoint as AftercareEmailCheckpoint)
    || typeof source.title !== "string"
    || typeof source.preheader !== "string"
    || typeof source.summary !== "string"
    || !Array.isArray(source.careSteps)
    || !Array.isArray(source.cautions)
    || !source.cta
    || typeof source.cta.url !== "string"
    || typeof source.manageUrl !== "string"
    || typeof source.actualServiceId !== "string"
    || typeof source.consultationId !== "string"
    || !Number.isInteger(source.programVersion)) return null;
  try {
    normalizeAftercareEmailBaseUrl(source.cta.url);
    normalizeAftercareEmailBaseUrl(source.manageUrl);
  } catch {
    return null;
  }
  return source as AftercareEmailContentV1;
}

export function renderAftercareEmail(content: AftercareEmailContentV1) {
  if (!validateAftercareEmailContent(content)) throw new Error("invalid aftercare email content");
  const steps = content.careSteps.map((item) => `<li style="margin:0 0 10px;line-height:1.7">${escapeHtml(item)}</li>`).join("");
  const cautions = content.cautions.map((item) => `<li style="margin:0 0 8px;line-height:1.65">${escapeHtml(item)}</li>`).join("");
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(content.title)}</title></head><body style="margin:0;background:#f6f4ef;color:#1d1b18;font-family:Arial,'Apple SD Gothic Neo','Noto Sans KR',sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(content.preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f4ef"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e5e0d8"><tr><td style="padding:30px 30px 12px"><p style="margin:0 0 12px;color:#725f45;font-size:12px;font-weight:700;letter-spacing:.12em">HAIRFIT AFTERCARE</p><h1 style="margin:0;font-size:25px;line-height:1.35">${escapeHtml(content.title)}</h1><p style="margin:18px 0 0;font-size:16px;line-height:1.75;color:#514b43">${escapeHtml(content.summary)}</p></td></tr><tr><td style="padding:12px 30px"><h2 style="font-size:17px;margin:0 0 12px">오늘의 관리 단계</h2><ol style="margin:0;padding-left:22px">${steps}</ol></td></tr>${cautions ? `<tr><td style="padding:12px 30px"><div style="background:#faf3e8;padding:16px"><h2 style="font-size:15px;margin:0 0 10px">주의해서 살펴볼 점</h2><ul style="margin:0;padding-left:20px">${cautions}</ul></div></td></tr>` : ""}<tr><td align="center" style="padding:20px 30px 30px"><a href="${escapeHtml(content.cta.url)}" style="display:inline-block;background:#1d1b18;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px">${escapeHtml(content.cta.label)}</a><p style="margin:20px 0 0;font-size:12px;line-height:1.7;color:#777067">알림을 잠시 쉬고 싶다면 <a href="${escapeHtml(content.manageUrl)}" style="color:#514b43">에프터케어 알림 관리</a>에서 변경할 수 있습니다.</p></td></tr></table></td></tr></table></body></html>`;
  const text = `${content.title}\n\n${content.summary}\n\n오늘의 관리 단계\n${content.careSteps.map((item, index) => `${index + 1}. ${item}`).join("\n")}${content.cautions.length ? `\n\n주의해서 살펴볼 점\n${content.cautions.map((item) => `- ${item}`).join("\n")}` : ""}\n\n${content.cta.label}: ${content.cta.url}\n알림 관리: ${content.manageUrl}`;
  const unsafe = /localhost|127\.0\.0\.1|\{\{|\}\}|__[_A-Z]+__/i;
  if (unsafe.test(html) || unsafe.test(text)) throw new Error("unsafe URL or unresolved placeholder in aftercare email");
  return { html, text };
}

export function buildAftercareEmailItems(input: {
  actualServiceId: string;
  consultationId: string;
  programVersion: number;
  serviceDate: string;
  styleName?: string;
  services?: string[];
  today?: unknown;
  checkpoints?: unknown;
  concerns?: unknown;
  baseUrl: string;
}) {
  const baseUrl = normalizeAftercareEmailBaseUrl(input.baseUrl);
  const today = cleanList(input.today, ["모발을 비비지 말고 눌러서 물기를 제거해 주세요.", "열기구는 낮은 온도부터 시작해 주세요."]);
  const programCheckpoints = Array.isArray(input.checkpoints) ? input.checkpoints : [];
  const cautions = cleanList(input.concerns, ["두피 자극이나 심한 끊어짐이 느껴지면 열기구 사용을 멈추고 전문가와 상의하세요."]);
  const styleName = cleanText(input.styleName, "시술 스타일", 80);
  const serviceStep = serviceSpecificStep(input.services?.length ? input.services : [styleName]);
  return AFTERCARE_EMAIL_CHECKPOINTS.map((checkpoint): AftercareEmailItemV1 => {
    const label = LABEL[checkpoint];
    const matching = programCheckpoints.find((item) => item && typeof item === "object" && cleanText((item as { offset?: unknown }).offset, "").toLowerCase().replace("+", "") === checkpoint);
    const checkpointAction = matching && typeof matching === "object" ? cleanText((matching as { action?: unknown }).action, "") : "";
    const careSteps = [...new Set([checkpointAction, serviceStep, ...today, ...CHECKPOINT_STEPS[checkpoint]].filter(Boolean))].slice(0, 6);
    const title = `${label} ${styleName} 에프터케어`;
    const ctaUrl = `${baseUrl}/consulting/${encodeURIComponent(input.consultationId)}?stage=aftercare`;
    const manageUrl = `${ctaUrl}&panel=notifications`;
    const content: AftercareEmailContentV1 = {
      schemaVersion: "aftercare-email-content-v1",
      checkpoint,
      title,
      preheader: `${DEFAULT_SUMMARY[checkpoint]} HairFit에서 관리 기록을 확인하세요.`,
      summary: DEFAULT_SUMMARY[checkpoint],
      careSteps,
      cautions: [...new Set([...cautions, ...STANDARD_CAUTIONS])].slice(0, 5),
      cta: { label: "에프터케어 기록 확인", url: ctaUrl },
      manageUrl,
      actualServiceId: input.actualServiceId,
      consultationId: input.consultationId,
      programVersion: input.programVersion,
    };
    const rendered = renderAftercareEmail(content);
    return {
      checkpoint,
      scheduledSendAt: aftercareScheduledSendAt(input.serviceDate, checkpoint),
      templateVersion: "aftercare-email-v1",
      content,
      subject: `HairFit | ${title}`,
      preheader: content.preheader,
      html: rendered.html,
      text: rendered.text,
    };
  });
}

export function buildLegacyAftercareEmailItem(input: {
  legacyCareContentId: string;
  hairRecordId: string;
  checkpoint: AftercareEmailCheckpoint;
  styleName: string;
  baseUrl: string;
}) {
  const baseUrl = normalizeAftercareEmailBaseUrl(input.baseUrl);
  const label = LABEL[input.checkpoint];
  const title = `${label} ${cleanText(input.styleName, "시술 스타일", 80)} 에프터케어`;
  const ctaUrl = `${baseUrl}/aftercare/${encodeURIComponent(input.hairRecordId)}`;
  const content: AftercareEmailContentV1 = {
    schemaVersion: "aftercare-email-content-v1",
    checkpoint: input.checkpoint,
    title,
    preheader: `${DEFAULT_SUMMARY[input.checkpoint]} HairFit에서 관리 기록을 확인하세요.`,
    summary: DEFAULT_SUMMARY[input.checkpoint],
    careSteps: [...CHECKPOINT_STEPS[input.checkpoint], serviceSpecificStep([input.styleName])].slice(0, 6),
    cautions: STANDARD_CAUTIONS,
    cta: { label: "에프터케어 기록 확인", url: ctaUrl },
    manageUrl: `${baseUrl}/mypage?panel=aftercare-notifications`,
    actualServiceId: `legacy:${input.hairRecordId}`,
    consultationId: `legacy:${input.hairRecordId}`,
    programVersion: 1,
  };
  const rendered = renderAftercareEmail(content);
  return {
    checkpoint: input.checkpoint,
    templateVersion: "aftercare-email-v1" as const,
    content,
    subject: `HairFit | ${title}`,
    preheader: content.preheader,
    html: rendered.html,
    text: rendered.text,
  };
}
