import "server-only";

const NTS_BUSINESS_API_BASE_URL = "https://api.odcloud.kr/api/nts-businessman/v1";
const CONTINUING_BUSINESS_STATUS_CODE = "01";

interface NtsValidateResponse {
  status_code?: string;
  data?: Array<{
    b_no?: string;
    valid?: string;
    valid_msg?: string;
    status?: {
      b_stt?: string;
      b_stt_cd?: string;
      tax_type?: string;
    };
  }>;
}

interface NtsStatusResponse {
  status_code?: string;
  data?: Array<{
    b_no?: string;
    b_stt?: string;
    b_stt_cd?: string;
    tax_type?: string;
  }>;
}

export interface VerifiedBusinessRegistration {
  businessRegistrationNumber: string;
  businessStartedOn: string;
  businessRepresentativeName: string;
  businessStatusCode: string;
  businessStatusLabel: string;
}

export class BusinessVerificationError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "BusinessVerificationError";
  }
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizeBusinessRegistrationNumber(value: string) {
  return normalizeDigits(value);
}

function hasValidBusinessRegistrationChecksum(value: string) {
  if (!/^\d{10}$/.test(value)) {
    return false;
  }

  const digits = value.split("").map(Number);
  const weights = [1, 3, 7, 1, 3, 7, 1, 3];
  let sum = weights.reduce((total, weight, index) => total + digits[index] * weight, 0);
  const ninth = digits[8] * 5;
  sum += Math.floor(ninth / 10) + (ninth % 10);
  const checkDigit = (10 - (sum % 10)) % 10;

  return checkDigit === digits[9];
}

function normalizeBusinessStartedOn(value: string) {
  const digits = normalizeDigits(value);
  if (!/^\d{8}$/.test(digits)) {
    throw new BusinessVerificationError("개업일자는 YYYY-MM-DD 형식으로 입력해 주세요.");
  }

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BusinessVerificationError("유효한 개업일자를 입력해 주세요.");
  }

  return {
    apiValue: digits,
    dbValue: `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`,
  };
}

function getNtsServiceKey() {
  const serviceKey = process.env.NTS_BUSINESS_SERVICE_KEY?.trim();
  if (!serviceKey) {
    throw new BusinessVerificationError("사업자 인증 설정이 완료되지 않았습니다. 관리자에게 문의해 주세요.", 503);
  }

  return serviceKey.includes("%") ? serviceKey : encodeURIComponent(serviceKey);
}

function buildNtsUrl(path: "validate" | "status") {
  return `${NTS_BUSINESS_API_BASE_URL}/${path}?serviceKey=${getNtsServiceKey()}&returnType=JSON`;
}

async function postNtsJson<T>(path: "validate" | "status", body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(buildNtsUrl(path), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });

    const data = (await response.json().catch(() => ({}))) as T;
    if (!response.ok) {
      throw new BusinessVerificationError("국세청 사업자 인증 서비스 응답이 정상적이지 않습니다. 잠시 후 다시 시도해 주세요.", 503);
    }

    return data;
  } catch (error) {
    if (error instanceof BusinessVerificationError) {
      throw error;
    }

    throw new BusinessVerificationError("국세청 사업자 인증 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", 503);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function verifyBusinessRegistration({
  businessRegistrationNumber,
  businessStartedOn,
  businessRepresentativeName,
}: {
  businessRegistrationNumber: string;
  businessStartedOn: string;
  businessRepresentativeName: string;
}): Promise<VerifiedBusinessRegistration> {
  const normalizedNumber = normalizeBusinessRegistrationNumber(businessRegistrationNumber);
  if (!hasValidBusinessRegistrationChecksum(normalizedNumber)) {
    throw new BusinessVerificationError("유효한 10자리 사업자등록번호를 입력해 주세요.");
  }

  const normalizedStartedOn = normalizeBusinessStartedOn(businessStartedOn);
  const representativeName = businessRepresentativeName.trim().slice(0, 80);
  if (!representativeName) {
    throw new BusinessVerificationError("대표자명을 입력해 주세요.");
  }

  const validateResult = await postNtsJson<NtsValidateResponse>("validate", {
    businesses: [
      {
        b_no: normalizedNumber,
        start_dt: normalizedStartedOn.apiValue,
        p_nm: representativeName,
      },
    ],
  });
  const validateItem = validateResult.data?.[0];

  if (validateResult.status_code !== "OK" || !validateItem) {
    throw new BusinessVerificationError("사업자 진위확인 요청을 처리하지 못했습니다. 입력값을 확인해 주세요.");
  }

  if (validateItem.valid !== "01") {
    throw new BusinessVerificationError(
      validateItem.valid_msg || "사업자등록번호, 개업일자, 대표자명이 국세청 등록정보와 일치하지 않습니다.",
    );
  }

  const statusResult = await postNtsJson<NtsStatusResponse>("status", {
    b_no: [normalizedNumber],
  });
  const statusItem = statusResult.data?.[0];

  if (statusResult.status_code !== "OK" || !statusItem) {
    throw new BusinessVerificationError("사업자 상태조회 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  const statusCode = statusItem.b_stt_cd || validateItem.status?.b_stt_cd || "";
  const statusLabel = statusItem.b_stt || validateItem.status?.b_stt || "";
  if (statusCode !== CONTINUING_BUSINESS_STATUS_CODE) {
    throw new BusinessVerificationError(
      statusLabel
        ? `현재 ${statusLabel} 상태의 사업자는 B2B 가입을 완료할 수 없습니다.`
        : "계속사업자로 확인되지 않아 B2B 가입을 완료할 수 없습니다.",
    );
  }

  return {
    businessRegistrationNumber: normalizedNumber,
    businessStartedOn: normalizedStartedOn.dbValue,
    businessRepresentativeName: representativeName,
    businessStatusCode: statusCode,
    businessStatusLabel: statusLabel || "계속사업자",
  };
}
