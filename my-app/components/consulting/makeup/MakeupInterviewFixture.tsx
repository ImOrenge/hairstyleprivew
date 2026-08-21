"use client";

import { MAKEUP_INTERVIEW_REQUIRED_TOPICS, MAKEUP_INTERVIEW_TOPICS, compileMakeupRecommendationRationaleV1, defaultMakeupInterviewProfile, type MakeupInterviewProfileV2, type MakeupInterviewTopic, type MakeupRecommendationRationaleV1 } from "@hairfit/shared/makeup";
import { useState } from "react";
import { MakeupDirectionFixture } from "./MakeupDirectionFixture";
import { MakeupDirectionInterview } from "./MakeupDirectionInterview";
import { MakeupRecommendationReview } from "./MakeupRecommendationReview";

const context = { presentation: "natural_grooming" as const, occasions: ["daily"], preparationMinutes: 10 as const, skillLevel: "basic" as const, finishPreference: "natural" as const, exclusions: [], ownedProductTypes: [], ownedToolTypes: [], gender: "not_provided" as const, facialHair: { type: "none" as const, userWantsCoverage: false } };
const consultationId = "00000000-0000-4000-8000-000000000011";

export function MakeupInterviewFixture() {
  const [profile, setProfile] = useState<MakeupInterviewProfileV2>(() => defaultMakeupInterviewProfile(context));
  const [rationale, setRationale] = useState<MakeupRecommendationRationaleV1 | null>(null);
  const [showMap, setShowMap] = useState(false);
  const coverage = MAKEUP_INTERVIEW_TOPICS.map((topic) => ({ topicId: topic, required: MAKEUP_INTERVIEW_REQUIRED_TOPICS.includes(topic), status: profile.completedTopics.includes(topic) ? "complete" as const : profile.skippedTopics.includes(topic) ? "skipped" as const : "pending" as const }));
  const save = async (topic: MakeupInterviewTopic, next: MakeupInterviewProfileV2, skip = false) => {
    const completed = new Set(next.completedTopics); const skipped = new Set(next.skippedTopics);
    if (skip) { skipped.add(topic); completed.delete(topic); } else { completed.add(topic); skipped.delete(topic); }
    const saved = { ...next, revision: profile.revision + 1, confirmedRevision: null, completedTopics: [...completed], skippedTopics: [...skipped] };
    setProfile(saved); return saved;
  };
  const confirm = async (next: MakeupInterviewProfileV2) => {
    const confirmed = { ...next, confirmedRevision: next.revision }; setProfile(confirmed);
    setRationale(compileMakeupRecommendationRationaleV1({ profile: confirmed, source: { faceObservationBundleId: "fixture-face", personalColorProfileId: "fixture-color", selectedStyleId: "fixture-hair", inputProfileRevision: 4 }, personalColor: { label: "가을 딥", confidence: 0.89, palette: ["#4D3426", "#B98248", "#6E7045"] }, face: { quality: "usable", validSkinPixelRatio: 0.92, warnings: [] }, hair: { colorFamily: "딥 초콜릿", fringe: "소프트 사이드", parting: "6:4" } }));
  };
  if (showMap) return <MakeupDirectionFixture />;
  if (rationale) return <MakeupRecommendationReview rationale={rationale} ai={null} onDecision={(decision) => { const acceptedMode = decision === "accept_adjustment" ? rationale.suggestedMode : rationale.requestedMode; setRationale({ ...rationale, decision, acceptedMode }); setShowMap(true); }} onEdit={() => { setRationale(null); setProfile({ ...profile, confirmedRevision: null }); }} />;
  return <MakeupDirectionInterview consultationId={consultationId} value={profile} coverage={coverage} savedAt={profile.revision ? "2026-08-16T11:30:00.000Z" : null} onSave={save} onConfirm={confirm} />;
}
