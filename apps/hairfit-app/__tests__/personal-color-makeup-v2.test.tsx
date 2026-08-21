import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { MAKEUP_MODULES, type MakeupContextProfile, type MakeupDirectionSnapshot, type PersonalColorProfileV2 } from "@hairfit/shared";
import { NativeMakeupDirectionV1 } from "../components/consulting/NativeMakeupDirectionV1";
import { NativePersonalColorProfileV2 } from "../components/consulting/NativePersonalColorProfileV2";

const profile = {
  id: "profile-v2", captureMode: "quick", calibration: { version: "gray-world-v1", confidence: 0.8 },
  confidence: { overall: 0.72 }, regions: [{ region: "left_cheek", validPixelRatio: 0.82 }],
  axes: Object.fromEntries(["temperature", "value", "chroma", "contrast", "hueCharacter"].map((key) => [key, { value: key === "contrast" ? null : 0.2, confidence: key === "contrast" ? 0 : 0.7, evidenceIds: ["evidence"], unavailableReason: key === "contrast" ? "split_lighting" : null }])),
  seasonalPosterior: ["spring_light", "spring_warm", "spring_bright", "summer_light", "summer_cool", "summer_muted", "autumn_muted", "autumn_warm", "autumn_deep", "winter_bright", "winter_cool", "winter_deep"].map((type, index) => ({ type, probability: index === 0 ? 0.45 : 0.55 / 11 })),
} as unknown as PersonalColorProfileV2;

const context: MakeupContextProfile = { presentation: "natural_grooming", occasions: ["daily"], preparationMinutes: 10, skillLevel: "basic", finishPreference: "natural", exclusions: [], ownedProductTypes: [], ownedToolTypes: [], gender: "not_provided", facialHair: { type: "none", userWantsCoverage: false } };
const snapshot = {
  id: "makeup-v1", status: "map_ready", source: { personalColorProfileId: "profile-v2" }, context,
  modules: MAKEUP_MODULES.map((module, index) => ({ module, state: "enabled", geometry: { anchors: [{ x: 0.35 + index * 0.04, y: 0.25 + index * 0.07 }], polygons: [], excludedPolygons: [], vectors: [] }, direction: { intensity: 0.3, colorFamily: "neutral", texture: "satin", technical: { placement: [`${module}_zone`] } } })),
} as unknown as MakeupDirectionSnapshot;

test("Expo Personal Color renders unavailable axes and independent training consent", async () => {
  const onConsent = jest.fn();
  await render(<NativePersonalColorProfileV2 profile={profile} trainingConsent={false} onTrainingConsentChange={onConsent} />);
  expect(screen.getByLabelText(/대비 측정 보류 split_lighting/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "선택 학습 동의하기" }));
  expect(onConsent).toHaveBeenCalledWith(true);
});

test("Expo Makeup uses all seven shared modules and non-drag alternatives", async () => {
  const onToggle = jest.fn(); const onConfirm = jest.fn();
  await render(<NativeMakeupDirectionV1 snapshot={snapshot} defaultContext={context} revision={3} routine={null} brief={null} onPrepare={jest.fn()} onToggleModule={onToggle} onConfirm={onConfirm} />);
  expect(screen.getByLabelText("정규화된 4대5 얼굴 좌표 지도")).toBeOnTheScreen();
  expect(screen.getAllByRole("button", { name: "OFF" })).toHaveLength(7);
  await fireEvent.press(screen.getAllByRole("button", { name: "OFF" })[0]);
  expect(onToggle).toHaveBeenCalledWith("base", false);
  await fireEvent.press(screen.getByRole("button", { name: "이 메이크업 방향 확정" }));
  expect(onConfirm).toHaveBeenCalled();
});
