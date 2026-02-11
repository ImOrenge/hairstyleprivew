export const DEFAULT_CREDITS_PER_STYLE = 5;
const DEFAULT_STYLE_COST_USD = 0.16;
const DEFAULT_TARGET_MARGIN = 0.4;
const DEFAULT_USD_TO_KRW = 1350;
const DEFAULT_SAFETY_MULTIPLIER = 1.06;
const DEFAULT_STARTER_FIXED_PRICE_USD = 10;

const DEFAULT_TIER_CREDITS = {
  free: 20,
  starter: 120,
  pro: 500,
} as const;

export interface PricingEconomics {
  styleCostUsd: number;
  targetMargin: number;
  creditsPerStyle: number;
  usdToKrw: number;
  safetyMultiplier: number;
  starterFixedPriceUsd: number;
  minStylePriceUsd: number;
  minCreditPriceUsd: number;
  minCreditPriceKrw: number;
}

export interface SuggestedPricingTier {
  key: keyof typeof DEFAULT_TIER_CREDITS;
  monthlyCredits: number;
  estimatedStyles: number;
  monthlyPriceKrw: number;
  monthlyPriceLabel: string;
  estimatedCostUsd: number;
  estimatedMarginUsd: number;
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

function roundRetailKrw(value: number): number {
  if (value <= 0) {
    return 0;
  }

  if (value < 1000) {
    return Math.ceil(value / 100) * 100;
  }

  return Math.max(1000, Math.ceil(value / 1000) * 1000 - 100);
}

function formatKrw(value: number): string {
  return `₩${new Intl.NumberFormat("ko-KR").format(value)}`;
}

function formatUsd(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const isInteger = Math.abs(rounded - Math.round(rounded)) < 0.000001;
  return isInteger ? `$${Math.round(rounded)}` : `$${rounded.toFixed(2)}`;
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
  const starterFixedPriceUsd = Math.max(
    0,
    readEnvNumber("PRICING_STARTER_FIXED_PRICE_USD", DEFAULT_STARTER_FIXED_PRICE_USD),
  );

  const minStylePriceUsd = styleCostUsd / (1 - targetMargin);
  const minCreditPriceUsd = minStylePriceUsd / creditsPerStyle;
  const minCreditPriceKrw = minCreditPriceUsd * usdToKrw;

  return {
    styleCostUsd,
    targetMargin,
    creditsPerStyle,
    usdToKrw,
    safetyMultiplier,
    starterFixedPriceUsd,
    minStylePriceUsd,
    minCreditPriceUsd,
    minCreditPriceKrw,
  };
}

export function getCreditsPerStyle(): number {
  return getPricingEconomics().creditsPerStyle;
}

export function getSuggestedPricingTiers(): SuggestedPricingTier[] {
  const economics = getPricingEconomics();

  const tierEntries = Object.entries(DEFAULT_TIER_CREDITS) as Array<
    [keyof typeof DEFAULT_TIER_CREDITS, number]
  >;

  return tierEntries.map(([key, monthlyCredits]) => {
    const estimatedStyles = monthlyCredits / economics.creditsPerStyle;
    const estimatedCostUsd = estimatedStyles * economics.styleCostUsd;
    const minPriceByMarginUsd =
      monthlyCredits * economics.minCreditPriceUsd * economics.safetyMultiplier;
    const targetPriceUsd =
      key === "free"
        ? 0
        : key === "starter"
          ? economics.starterFixedPriceUsd
          : minPriceByMarginUsd;

    const monthlyPriceKrw = roundRetailKrw(targetPriceUsd * economics.usdToKrw);
    const realizedPriceUsd =
      key === "starter"
        ? targetPriceUsd
        : monthlyPriceKrw / economics.usdToKrw;
    const estimatedMarginUsd = realizedPriceUsd - estimatedCostUsd;

    return {
      key,
      monthlyCredits,
      estimatedStyles: Math.floor(estimatedStyles),
      monthlyPriceKrw,
      monthlyPriceLabel: key === "starter" ? formatUsd(targetPriceUsd) : formatKrw(monthlyPriceKrw),
      estimatedCostUsd,
      estimatedMarginUsd,
    };
  });
}
