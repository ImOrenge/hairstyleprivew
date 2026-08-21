import { getServicePassCounts, type ServicePassCounts } from "./service-pass-counts.ts";

export const USAGE_PACK_KEYS = ["usage30", "usage80", "usage200"] as const;

export type UsagePackKey = (typeof USAGE_PACK_KEYS)[number];

export interface UsagePack {
  key: UsagePackKey;
  label: string;
  credits: number;
  priceKrw: number;
  orderName: string;
  servicePeriodLabelKo: string;
  servicePasses: ServicePassCounts;
}

export const USAGE_PACK_SERVICE_PERIOD_KO = "결제 완료일로부터 1개월";

function createUsagePack(input: {
  key: UsagePackKey;
  size: "S" | "M" | "L";
  credits: number;
  priceKrw: number;
}): UsagePack {
  const servicePasses = getServicePassCounts(input.credits);
  const serviceLabel = `헤어 ${servicePasses.hairCount}회·패션 ${servicePasses.fashionSetCount}세트·케어 ${servicePasses.careCount}회`;

  return {
    key: input.key,
    label: `추가 이용권 ${input.size}`,
    credits: input.credits,
    priceKrw: input.priceKrw,
    orderName: `HairFit 추가 이용권 ${input.size} - ${serviceLabel}`,
    servicePeriodLabelKo: USAGE_PACK_SERVICE_PERIOD_KO,
    servicePasses,
  };
}

const USAGE_PACKS: Record<UsagePackKey, UsagePack> = {
  usage30: createUsagePack({
    key: "usage30",
    size: "S",
    credits: 30,
    priceKrw: 5900,
  }),
  usage80: createUsagePack({
    key: "usage80",
    size: "M",
    credits: 80,
    priceKrw: 13900,
  }),
  usage200: createUsagePack({
    key: "usage200",
    size: "L",
    credits: 200,
    priceKrw: 29900,
  }),
};

export function isUsagePackKey(value: unknown): value is UsagePackKey {
  return typeof value === "string" && USAGE_PACK_KEYS.includes(value as UsagePackKey);
}

export function getUsagePack(key: UsagePackKey): UsagePack {
  return USAGE_PACKS[key];
}

export function getUsagePacks(): UsagePack[] {
  return USAGE_PACK_KEYS.map((key) => getUsagePack(key));
}

export function isUsagePackTransaction(metadata: unknown): boolean {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return false;
  }

  return (metadata as Record<string, unknown>).purchase_type === "usage_pack";
}
