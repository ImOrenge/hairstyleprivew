"use client";

import { useState } from "react";
import type { CurrentHairProfile } from "../../lib/recommendation-types";
import { CurrentHairProfileFields } from "../hairstyle/CurrentHairProfileFields";
import { Panel } from "../ui/Surface";

const INITIAL_PROFILE: CurrentHairProfile = {
  currentLength: "unknown",
  textureType: "unknown",
  strandThickness: "unknown",
  conditionTags: [],
  damageLevel: "unknown",
  desiredLength: null,
  source: "user",
};

export function HairProfileHarness() {
  const [profile, setProfile] = useState(INITIAL_PROFILE);

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <Panel as="section" className="p-5">
        <p className="app-kicker">E2E Harness</p>
        <h1 className="mt-2 text-2xl font-black">현재 모발 프로필 입력</h1>
        <div className="mt-4">
          <CurrentHairProfileFields value={profile} source="user" onChange={setProfile} />
        </div>
        <output className="mt-4 block text-xs" data-testid="hair-profile-output">
          {JSON.stringify(profile)}
        </output>
      </Panel>
    </div>
  );
}
