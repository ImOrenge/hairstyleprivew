export const USAGE_PACK_KEYS = ["usage30", "usage80", "usage200"] as const;

export type UsagePackKey = (typeof USAGE_PACK_KEYS)[number];

export interface UsagePack {
  key: UsagePackKey;
  label: string;
  credits: number;
  priceKrw: number;
  orderName: string;
}

const USAGE_PACKS: Record<UsagePackKey, UsagePack> = {
  usage30: {
    key: "usage30",
    label: "추가 이용권 30",
    credits: 30,
    priceKrw: 5900,
    orderName: "HairFit 추가 이용권 30",
  },
  usage80: {
    key: "usage80",
    label: "추가 이용권 80",
    credits: 80,
    priceKrw: 13900,
    orderName: "HairFit 추가 이용권 80",
  },
  usage200: {
    key: "usage200",
    label: "추가 이용권 200",
    credits: 200,
    priceKrw: 29900,
    orderName: "HairFit 추가 이용권 200",
  },
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
