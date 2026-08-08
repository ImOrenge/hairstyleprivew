import { NextResponse } from "next/server";
import { v2ErrorResponse } from "./errors";
import type { HairfitV2FeatureFlag } from "@hairfit/shared/v2";
import { isHairfitV2Enabled } from "./feature-flags";

export function v2Failure(error: unknown) {
  const response = v2ErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}

export function v2Disabled(...flags: HairfitV2FeatureFlag[]) {
  return flags.every((flag) => isHairfitV2Enabled(flag))
    ? null
    : NextResponse.json({ error: "HairFit V2 feature is disabled." }, { status: 404 });
}
