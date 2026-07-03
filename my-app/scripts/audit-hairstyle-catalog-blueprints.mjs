import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/hairstyle-catalog-seed.ts", import.meta.url), "utf8");

function extractSet(name) {
  const match = source.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!match) {
    throw new Error(`Missing ${name}`);
  }

  return new Set([...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]));
}

const femaleOnly = extractSet("FEMALE_ONLY_SLUGS");
const maleOnly = extractSet("MALE_ONLY_SLUGS");
const blueprintBlock = source.match(/export const KOREAN_HAIRSTYLE_BLUEPRINTS:[\s\S]*?= \[([\s\S]*?)\];/);

if (!blueprintBlock) {
  throw new Error("Missing KOREAN_HAIRSTYLE_BLUEPRINTS");
}

const blueprints = [...blueprintBlock[1].matchAll(/slug: "([^"]+)"[\s\S]*?lengthBucket: "([^"]+)"/g)].map(
  (match) => ({
    slug: match[1],
    lengthBucket: match[2],
    styleTargets: femaleOnly.has(match[1])
      ? ["female"]
      : maleOnly.has(match[1])
        ? ["male"]
        : ["male", "female"],
  }),
);

const slugSet = new Set(blueprints.map((item) => item.slug));
const duplicateSlugs = blueprints.map((item) => item.slug).filter((slug, index, all) => all.indexOf(slug) !== index);
const missingFemaleSetSlugs = [...femaleOnly].filter((slug) => !slugSet.has(slug));
const missingMaleSetSlugs = [...maleOnly].filter((slug) => !slugSet.has(slug));

function countForTarget(target) {
  return blueprints.filter((item) => item.styleTargets.includes(target)).length;
}

function lengthCountsForTarget(target) {
  return blueprints
    .filter((item) => item.styleTargets.includes(target))
    .reduce(
      (counts, item) => {
        counts[item.lengthBucket] += 1;
        return counts;
      },
      { short: 0, medium: 0, long: 0 },
    );
}

const femaleCount = countForTarget("female");
const maleCount = countForTarget("male");
const femaleLengthCounts = lengthCountsForTarget("female");
const maleLengthCounts = lengthCountsForTarget("male");

const failures = [];
if (blueprints.length !== 32) failures.push(`expected 32 blueprints, got ${blueprints.length}`);
if (femaleOnly.size !== 14) failures.push(`expected 14 female-only blueprints, got ${femaleOnly.size}`);
if (maleOnly.size !== 14) failures.push(`expected 14 male-only blueprints, got ${maleOnly.size}`);
if (femaleCount < 18) failures.push(`expected >=18 female candidates, got ${femaleCount}`);
if (maleCount < 18) failures.push(`expected >=18 male candidates, got ${maleCount}`);
for (const [target, counts] of [
  ["female", femaleLengthCounts],
  ["male", maleLengthCounts],
]) {
  for (const [bucket, count] of Object.entries(counts)) {
    if (count < 4) failures.push(`expected ${target} ${bucket} count >=4, got ${count}`);
  }
}
if (duplicateSlugs.length > 0) failures.push(`duplicate slugs: ${duplicateSlugs.join(", ")}`);
if (missingFemaleSetSlugs.length > 0) failures.push(`female set slugs missing from blueprints: ${missingFemaleSetSlugs.join(", ")}`);
if (missingMaleSetSlugs.length > 0) failures.push(`male set slugs missing from blueprints: ${missingMaleSetSlugs.join(", ")}`);

if (failures.length > 0) {
  throw new Error(failures.join("\n"));
}

console.log(JSON.stringify({
  blueprintCount: blueprints.length,
  femaleOnly: femaleOnly.size,
  maleOnly: maleOnly.size,
  unisex: blueprints.length - femaleOnly.size - maleOnly.size,
  femaleCandidates: femaleCount,
  maleCandidates: maleCount,
  femaleLengthCounts,
  maleLengthCounts,
}, null, 2));
