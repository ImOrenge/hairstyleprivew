import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(scriptDirectory, "../data/hairstyle-blueprints/v4");
const checkOnly = process.argv.includes("--check");

const TEXTURES = [
  {
    id: "straight",
    nameKo: "직모",
    texture: "controlled straight texture",
    prompt: "controlled straight texture with natural movement",
    keywords: ["직모", "생머리"],
  },
  {
    id: "wavy_curly",
    nameKo: "곱슬 웨이브",
    texture: "defined soft wave texture",
    prompt: "defined soft waves following the natural curl direction",
    keywords: ["곱슬", "반곱슬", "웨이브"],
  },
  {
    id: "tight_curly_frizzy",
    nameKo: "강한 곱슬",
    texture: "controlled tight curl texture",
    prompt: "defined tight curls with controlled frizz and preserved curl identity",
    keywords: ["강한 곱슬", "부스스한 머리", "악성곱슬"],
  },
];

const CONDITIONS = [
  {
    id: "untreated",
    nameKo: "일반 모발",
    compatible: ["untreated", "colored"],
    constraints: ["professional_assessment"],
    prompt: "healthy natural-looking finish",
    keywords: ["일반 모발", "건강모"],
  },
  {
    id: "damaged",
    nameKo: "손상 모발",
    compatible: ["damaged", "colored"],
    constraints: ["cut_first", "low_heat", "professional_assessment"],
    prompt: "polished low-heat finish that does not exaggerate visible damage",
    keywords: ["손상모", "상한 머리"],
  },
  {
    id: "bleached",
    nameKo: "탈색 모발",
    compatible: ["bleached", "damaged", "colored"],
    constraints: ["no_additional_bleach", "low_heat", "strand_test", "professional_assessment"],
    prompt: "color-preserving low-heat finish suitable for pre-lightened hair",
    keywords: ["탈색모", "브리치 헤어"],
  },
  {
    id: "colored",
    nameKo: "염색 모발",
    compatible: ["colored", "untreated"],
    constraints: ["color_safe", "low_heat"],
    prompt: "color-safe polished finish without changing the existing hair color",
    keywords: ["염색모", "컬러 헤어"],
  },
];

const STRAND_THICKNESSES = [
  {
    id: "medium",
    nameKo: "보통 굵기 모발",
    prompt: "balanced medium strand thickness with natural weight",
    compatible: ["fine", "medium", "coarse"],
  },
  {
    id: "fine",
    nameKo: "가는 모발",
    prompt: "fine strands with lightweight volume and no heavy product buildup",
    compatible: ["fine", "medium"],
  },
  {
    id: "coarse",
    nameKo: "굵은 모발",
    prompt: "coarse strands with controlled weight and clearly separated movement",
    compatible: ["medium", "coarse"],
  },
];

const LENGTHS = {
  short: {
    nameKo: "단기장",
    prompt: "short ear-to-jaw length",
    styles: [
      ["airy-crop", "에어리 크롭", "airy cropped layers"],
      ["soft-pixie", "소프트 픽시", "soft pixie layers"],
      ["rounded-bob", "라운드 보브", "rounded jawline bob"],
      ["french-bob", "프렌치 보브", "compact French bob"],
      ["bixie-layer", "빅시 레이어", "bixie layered silhouette"],
      ["short-hush", "숏 허쉬", "short hush layers"],
      ["short-wolf", "숏 울프", "short wolf layers"],
      ["tassel-bob", "태슬 보브", "clean tassel bob line"],
      ["micro-bob", "마이크로 보브", "compact micro bob"],
      ["side-part-crop", "사이드 파트 크롭", "side-parted crop"],
      ["center-part-crop", "센터 파트 크롭", "center-parted crop"],
      ["soft-mohican", "소프트 모히칸", "subtle soft-mohican crown"],
      ["ivy-lift", "아이비 리프트", "refined ivy-league lift"],
      ["textured-crop", "텍스처드 크롭", "piecey textured crop"],
      ["comma-crop", "콤마 크롭", "short comma fringe crop"],
      ["curtain-short", "커튼 숏", "short curtain-part layers"],
      ["bowl-layer", "볼 레이어", "soft layered bowl silhouette"],
      ["tapered-shag", "테이퍼드 샤그", "tapered short shag"],
      ["sleek-ear-bob", "슬릭 이어 보브", "sleek ear-length bob"],
      ["choppy-bob", "처피 보브", "light choppy bob"],
      ["short-mullet", "숏 멀릿", "controlled short mullet"],
      ["down-fringe", "다운 프린지", "clean down-fringe crop"],
      ["regent-lift", "리젠트 리프트", "short regent crown lift"],
      ["cocoon-bob", "코쿤 보브", "soft cocoon bob"],
      ["asymmetric-crop", "비대칭 크롭", "balanced asymmetric crop"],
    ],
  },
  medium: {
    nameKo: "중기장",
    prompt: "jaw-to-shoulder medium length",
    styles: [
      ["medium-layer", "미디엄 레이어", "balanced medium layers"],
      ["medium-hush", "미디엄 허쉬", "medium hush layers"],
      ["c-curl", "C컬 미디엄", "inward C-curl contour"],
      ["s-curl-lob", "S컬 로브", "soft S-curl lob"],
      ["clavicle-bob", "쇄골 보브", "clavicle-length bob"],
      ["jelly-medium", "젤리 미디엄", "bouncy jelly-wave medium cut"],
      ["medium-shag", "미디엄 샤그", "airy medium shag"],
      ["wolf-layer", "울프 레이어", "medium wolf layers"],
      ["butterfly-medium", "버터플라이 미디엄", "medium butterfly layers"],
      ["curtain-medium", "커튼 미디엄", "curtain-framed medium layers"],
      ["tassel-lob", "태슬 로브", "clean tassel lob"],
      ["sleek-one-length", "슬릭 원랭스", "sleek one-length medium cut"],
      ["airy-dandy", "에어리 댄디", "airy medium dandy flow"],
      ["leaf-flow", "리프 플로우", "medium leaf-cut back flow"],
      ["comma-medium", "콤마 미디엄", "medium comma fringe"],
      ["shadow-wave", "쉐도우 웨이브", "soft shadow wave"],
      ["bonnie-volume", "보니 볼륨", "rounded Bonnie volume"],
      ["build-wave", "빌드 웨이브", "layered build wave"],
      ["hippie-medium", "히피 미디엄", "defined medium hippie curls"],
      ["spiral-medium", "스파이럴 미디엄", "controlled medium spiral curls"],
      ["face-frame", "페이스 프레임", "medium face-framing layers"],
      ["soft-mullet-medium", "소프트 멀릿 미디엄", "soft medium mullet"],
      ["side-sweep", "사이드 스윕", "medium side-swept layers"],
      ["volume-bob", "볼륨 보브", "full medium volume bob"],
      ["textured-lob", "텍스처드 로브", "textured layered lob"],
    ],
  },
  long: {
    nameKo: "장기장",
    prompt: "clearly below-shoulder long length",
    styles: [
      ["long-layer", "롱 레이어", "flowing long layers"],
      ["curtain-long", "커튼 롱", "long curtain-framing layers"],
      ["s-wave-long", "S웨이브 롱", "long polished S-waves"],
      ["jelly-long", "젤리 롱", "long bouncy jelly waves"],
      ["hippie-long", "히피 롱", "long defined hippie curls"],
      ["loose-wave", "루스 웨이브", "long loose waves"],
      ["sleek-straight", "슬릭 스트레이트 롱", "sleek long straight silhouette"],
      ["butterfly-long", "버터플라이 롱", "long butterfly layers"],
      ["hush-long", "허쉬 롱", "long hush layers"],
      ["wolf-long", "울프 롱", "long wolf layers"],
      ["shag-long", "샤그 롱", "long airy shag"],
      ["face-frame-long", "페이스 프레임 롱", "long face-framing layers"],
      ["cloud-wave", "클라우드 웨이브", "soft long cloud waves"],
      ["grace-wave", "그레이스 웨이브", "refined long grace waves"],
      ["spiral-long", "스파이럴 롱", "controlled long spiral curls"],
      ["curl-cascade", "컬 캐스케이드", "long natural curl cascade"],
      ["volume-layer-long", "볼륨 레이어 롱", "long crown-volume layers"],
      ["soft-mullet-long", "소프트 멀릿 롱", "long soft mullet layers"],
      ["center-flow-long", "센터 플로우 롱", "long center-part flow"],
      ["side-flow-long", "사이드 플로우 롱", "long side-part flow"],
      ["bohemian-wave", "보헤미안 웨이브", "long bohemian waves"],
      ["dimension-layer", "디멘션 레이어", "long dimensional layers"],
      ["low-tension-layer", "로우 텐션 레이어", "low-tension long layers"],
      ["blunt-long", "블런트 롱", "clean blunt long line"],
      ["feather-long", "페더 롱", "long feathered layers"],
    ],
  },
};

const GROUPS = [
  { id: "female", nameKo: "여성", prompt: "Korean women's hairstyle direction" },
  { id: "male", nameKo: "남성", prompt: "Korean men's hairstyle direction" },
];

const BATCH_COUNTS = {
  "female-short": [9, 8, 8],
  "female-medium": [8, 9, 8],
  "female-long": [8, 8, 9],
  "male-short": [8, 8, 9],
  "male-medium": [9, 8, 8],
  "male-long": [8, 9, 8],
};

const FACETS = [
  ...[0, 1].flatMap(() => CONDITIONS.flatMap((condition) => TEXTURES.map((texture) => ({ texture, condition })))),
  { texture: TEXTURES[1], condition: CONDITIONS[0] },
];

function batchForIndex(groupKey, index) {
  const [a, b] = BATCH_COUNTS[groupKey];
  if (index < a) return "expansion-a";
  if (index < a + b) return "expansion-b";
  return "expansion-c";
}

function servicesFor(texture, condition) {
  if (texture.id === "wavy_curly" && condition.id === "untreated") {
    return ["cut", "perm"];
  }
  if (texture.id === "tight_curly_frizzy") {
    return ["cut", "curl_definition"];
  }
  if (texture.id === "wavy_curly") {
    return ["cut", "texture_styling"];
  }
  return ["cut", "low_heat_styling"];
}

function avoidConditions(texture, condition) {
  if (texture.id === "wavy_curly" && condition.id === "untreated") {
    return ["damaged", "bleached", "severely_damaged"];
  }
  return condition.id === "untreated" ? [] : ["severely_damaged"];
}

function buildBlueprint(group, lengthId, style, index) {
  const length = LENGTHS[lengthId];
  const [family, nameKo, stylePrompt] = style;
  const { texture, condition } = FACETS[index];
  const strandThickness = STRAND_THICKNESSES[index % STRAND_THICKNESSES.length];
  const focus = ["crown", "temple", "jawline"][index % 3];
  const bangType = ["no fixed bangs", "soft fringe", "curtain fringe"][index % 3];
  const groupKey = `${group.id}-${lengthId}`;
  const requiredServices = servicesFor(texture, condition);
  const avoidConditionTags = avoidConditions(texture, condition);
  const maintenanceLevel = requiredServices.includes("perm") || texture.id === "tight_curly_frizzy" ? "high" : index % 3 === 0 ? "low" : "medium";

  return {
    slug: `${group.id}-${lengthId}-${family}-${texture.id.replaceAll("_", "-")}-${condition.id}`,
    nameKo: `${group.nameKo} ${nameKo} · ${texture.nameKo} ${condition.nameKo}`,
    description: `${group.nameKo} ${length.nameKo} ${nameKo}를 ${texture.nameKo}, ${strandThickness.nameKo}, ${condition.nameKo} 조건에 맞춰 제안하는 블루프린트.`,
    lengthBucket: lengthId,
    correctionFocus: focus,
    silhouette: `${lengthId} ${family.replaceAll("-", " ")}`,
    texture: texture.texture,
    bangType,
    volumeFocusTags: [focus, focus === "jawline" ? "lower-frame" : `${focus}-balance`],
    faceShapeFitTags: ["oval", index % 2 === 0 ? "round" : "long-face"],
    avoidTags: focus === "crown" ? ["excessive-top-height"] : focus === "jawline" ? ["heavy-lower-volume"] : ["excessive-side-volume"],
    promptTemplate: [
      group.prompt,
      length.prompt,
      stylePrompt,
      texture.prompt,
      strandThickness.prompt,
      condition.prompt,
      "keep the existing natural hair color",
      "realistic salon-achievable finish",
    ].join(", "),
    promptTemplateVersion: "catalog-v4",
    styleTargets: [group.id],
    trendKeywords: [
      nameKo,
      `${group.nameKo} ${length.nameKo} ${nameKo}`,
      ...texture.keywords,
      strandThickness.nameKo,
      ...condition.keywords,
    ],
    baselineTrendScore: 48 + (index % 11),
    baselineFreshnessScore: 46 + (index % 9),
    styleFamily: family,
    variantKey: `${group.id}-${lengthId}-${texture.id}-${condition.id}`,
    primaryTexture: texture.id,
    compatibleTextureTags: [texture.id],
    avoidTextureTags: [],
    primaryStrandThickness: strandThickness.id,
    compatibleStrandThicknessTags: strandThickness.compatible,
    avoidStrandThicknessTags: strandThickness.id === "fine"
      ? ["coarse"]
      : strandThickness.id === "coarse"
        ? ["fine"]
        : [],
    primaryCondition: condition.id,
    compatibleConditionTags: condition.compatible,
    avoidConditionTags,
    requiredServices,
    serviceConstraints: condition.constraints,
    maintenanceLevel,
    introducedIn: batchForIndex(groupKey, index),
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

mkdirSync(outputDirectory, { recursive: true });

const results = [];
for (const group of GROUPS) {
  for (const [lengthId, length] of Object.entries(LENGTHS)) {
    const fileName = `${group.id}-${lengthId}.json`;
    const filePath = resolve(outputDirectory, fileName);
    const blueprints = length.styles.map((style, index) => buildBlueprint(group, lengthId, style, index));
    const expected = stableJson(blueprints);

    if (checkOnly) {
      const actual = readFileSync(filePath, "utf8");
      if (actual !== expected) {
        throw new Error(`${fileName} is stale; run npm run hairstyle:blueprints:build`);
      }
    } else {
      writeFileSync(filePath, expected, "utf8");
    }

    results.push({ fileName, count: blueprints.length });
  }
}

console.log(JSON.stringify({ ok: true, checkOnly, total: results.reduce((sum, item) => sum + item.count, 0), files: results }, null, 2));
