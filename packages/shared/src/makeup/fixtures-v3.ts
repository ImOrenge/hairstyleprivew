import type { MakeupGender, MakeupNormalizedPoint } from "./contract.ts";

export const MAKEUP_P38_SKIN_TONE_GROUPS = ["tone-1", "tone-2", "tone-3", "tone-4", "tone-5", "tone-6"] as const;
export const MAKEUP_P38_FACE_SHAPES = ["oval", "round", "square", "long", "heart"] as const;
export const MAKEUP_P38_OCCLUSIONS = ["none", "glasses", "fringe", "partial-side", "hand-near-jaw"] as const;

export interface MakeupP38FixtureCase {
  id: string;
  skinToneGroup: (typeof MAKEUP_P38_SKIN_TONE_GROUPS)[number];
  presentationGender: Exclude<MakeupGender, null>;
  faceShape: (typeof MAKEUP_P38_FACE_SHAPES)[number];
  occlusion: (typeof MAKEUP_P38_OCCLUSIONS)[number];
  glasses: boolean;
  fringe: "none" | "full" | "side";
  pointCount: 468 | 478;
}

const GENDERS: MakeupP38FixtureCase["presentationGender"][] = ["female", "male", "nonbinary", "not_provided"];
const FRINGES: MakeupP38FixtureCase["fringe"][] = ["none", "full", "side"];

/** Contract fixtures only. These labels test representation coverage and are never inference targets. */
export const MAKEUP_P38_FIXTURE_CASES: readonly MakeupP38FixtureCase[] = Array.from({ length: 30 }, (_, index) => {
  const occlusion = MAKEUP_P38_OCCLUSIONS[index % MAKEUP_P38_OCCLUSIONS.length];
  return {
    id: `makeup-p38-${String(index + 1).padStart(2, "0")}`,
    skinToneGroup: MAKEUP_P38_SKIN_TONE_GROUPS[index % MAKEUP_P38_SKIN_TONE_GROUPS.length],
    presentationGender: GENDERS[index % GENDERS.length],
    faceShape: MAKEUP_P38_FACE_SHAPES[index % MAKEUP_P38_FACE_SHAPES.length],
    occlusion,
    glasses: occlusion === "glasses" || index % 7 === 0,
    fringe: occlusion === "fringe" ? (index % 2 ? "full" : "side") : FRINGES[index % FRINGES.length],
    pointCount: index % 3 === 0 ? 478 : 468,
  };
});

export function makeupP38FixtureLandmarks(fixture: MakeupP38FixtureCase): MakeupNormalizedPoint[] {
  const shapeScale: Record<MakeupP38FixtureCase["faceShape"], [number, number]> = {
    oval: [0.34, 0.44], round: [0.38, 0.39], square: [0.38, 0.42], long: [0.31, 0.48], heart: [0.37, 0.43],
  };
  const [radiusX, radiusY] = shapeScale[fixture.faceShape];
  return Array.from({ length: fixture.pointCount }, (_, index) => {
    const ring = 0.18 + ((index * 37) % 281) / 400;
    const angle = (index * 2.399963229728653) % (Math.PI * 2);
    const heartTaper = fixture.faceShape === "heart" ? 1 - Math.max(0, Math.sin(angle)) * 0.12 : 1;
    const squareX = fixture.faceShape === "square" ? Math.sign(Math.cos(angle)) * Math.pow(Math.abs(Math.cos(angle)), 0.72) : Math.cos(angle);
    const squareY = fixture.faceShape === "square" ? Math.sign(Math.sin(angle)) * Math.pow(Math.abs(Math.sin(angle)), 0.82) : Math.sin(angle);
    return {
      x: Math.min(0.96, Math.max(0.04, 0.5 + squareX * radiusX * ring * heartTaper)),
      y: Math.min(0.97, Math.max(0.03, 0.49 + squareY * radiusY * ring)),
    };
  });
}
