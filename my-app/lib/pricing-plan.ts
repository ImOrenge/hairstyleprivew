export const DEFAULT_CREDITS_PER_STYLE = 5;
const DEFAULT_STYLE_COST_USD = 0.16;
const DEFAULT_TARGET_MARGIN = 0.4;
const DEFAULT_USD_TO_KRW = 1350;
const DEFAULT_SAFETY_MULTIPLIER = 1.06;

const DEFAULT_CREDIT_PACKS = {
  free: {
    credits: 10,
    priceKrw: 0,
  },
  starter: {
    credits: 60,
    priceKrw: 9900,
  },
  pro: {
    credits: 250,
    priceKrw: 39000,
  },
} as const;

export type PricingTierKey = keyof typeof DEFAULT_CREDIT_PACKS;

export interface PricingEconomics {
  styleCostUsd: number;
  targetMargin: number;
  creditsPerStyle: number;
  usdToKrw: number;
  safetyMultiplier: number;
  minStylePriceUsd: number;
  minCreditPriceUsd: number;
  minCreditPriceKrw: number;
}

export interface PricingPackTier {
  key: PricingTierKey;
  credits: number;
  estimatedStyles: number;
  priceKrw: number;
  priceLabel: string;
  estimatedCostUsd: number;
  estimatedMarginUsd: number;
  estimatedMarginRate: number | null;
}

function readEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatKrw(value: number): string {
  return `₩${new Intl.NumberFormat("ko-KR").format(value)}`;
}

export function getPricingEconomics(): PricingEconomics {
  const styleCostUsd = Math.max(0.0001, readEnvNumber("PRICING_STYLE_COST_USD", DEFAULT_STYLE_COST_USD));
  const targetMargin = clamp(readEnvNumber("PRICING_TARGET_MARGIN", DEFAULT_TARGET_MARGIN), 0.05, 0.9);
  const creditsPerStyle = Math.max(
    1,
    Math.round(readEnvNumber("PRICING_CREDITS_PER_STYLE", DEFAULT_CREDITS_PER_STYLE)),
  );
  const usdToKrw = Math.max(1, readEnvNumber("PRICING_USD_TO_KRW", DEFAULT_USD_TO_KRW));
  const safetyMultiplier = clamp(readEnvNumber("PRICING_SAFETY_MULTIPLIER", DEFAULT_SAFETY_MULTIPLIER), 1, 3);

  const minStylePriceUsd = styleCostUsd / (1 - targetMargin);
  const minCreditPriceUsd = minStylePriceUsd / creditsPerStyle;
  const minCreditPriceKrw = minCreditPriceUsd * usdToKrw;

  return {
    styleCostUsd,
    targetMargin,
    creditsPerStyle,
    usdToKrw,
    safetyMultiplier,
    minStylePriceUsd,
    minCreditPriceUsd,
    minCreditPriceKrw,
  };
}

export function getCreditsPerStyle(): number {
  return getPricingEconomics().creditsPerStyle;
}

function getPackCredits(key: PricingTierKey): number {
  const envName = `PRICING_${key.toUpperCase()}_CREDITS`;
  const fallback = DEFAULT_CREDIT_PACKS[key].credits;
  return Math.max(0, Math.round(readEnvNumber(envName, fallback)));
}

function getPackPriceKrw(key: PricingTierKey): number {
  const envName = `PRICING_${key.toUpperCase()}_PRICE_KRW`;
  const fallback = DEFAULT_CREDIT_PACKS[key].priceKrw;
  return Math.max(0, Math.round(readEnvNumber(envName, fallback)));
}

export function getSuggestedPricingTiers(): PricingPackTier[] {
  const economics = getPricingEconomics();

  const tierKeys = Object.keys(DEFAULT_CREDIT_PACKS) as PricingTierKey[];

  return tierKeys.map((key) => {
    const credits = getPackCredits(key);
    const priceKrw = getPackPriceKrw(key);
    const estimatedStyles = Math.floor(credits / economics.creditsPerStyle);
    const estimatedCostUsd = estimatedStyles * economics.styleCostUsd * economics.safetyMultiplier;
    const realizedPriceUsd = priceKrw / economics.usdToKrw;
    const estimatedMarginUsd = realizedPriceUsd - estimatedCostUsd;
    const estimatedMarginRate = realizedPriceUsd > 0 ? estimatedMarginUsd / realizedPriceUsd : null;

    return {
      key,
      credits,
      estimatedStyles,
      priceKrw,
      priceLabel: formatKrw(priceKrw),
      estimatedCostUsd,
      estimatedMarginUsd,
      estimatedMarginRate,
    };
  });
}
