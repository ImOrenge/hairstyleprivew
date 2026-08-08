import type { HairfitV2FeatureFlag } from "@hairfit/shared/v2";
export function isHairfitV2Enabled(flag: HairfitV2FeatureFlag, env: NodeJS.ProcessEnv = process.env) { return env[flag] === "true"; }
export function isLegacyEntitlementBridgeEnabled(env: NodeJS.ProcessEnv = process.env) { return env.ENTITLEMENT_V2_LEGACY_BRIDGE_ENABLED === "true"; }
