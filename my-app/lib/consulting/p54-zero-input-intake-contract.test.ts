import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const repo = resolve(process.cwd(), "..");
const read = (...parts: string[]) => readFileSync(join(repo, ...parts), "utf8");

test("P54 starts consultation with zero required answers on Web and Native", () => {
  const web = read("my-app", "components", "consulting", "interview", "ZeroInputConsultationStart.tsx");
  const native = read("apps", "hairfit-app", "app", "consulting.tsx");
  const startContext = read("packages", "shared", "src", "consulting", "start-context.ts");
  assert.match(web, /사진 전 필수 질문 0개/);
  assert.match(web, /사진으로 분석 시작/);
  assert.match(web, /data-layout="standalone"/);
  assert.match(web, /f-consulting-opening-intent__choices/);
  assert.doesNotMatch(web, /id="optional-opening-intent" className="[^"]*f-consulting-interview__choices/);
  assert.doesNotMatch(web, /currentStep|questionIndex|currentHair/);
  assert.match(native, /상담 시작 · 입력 0개/);
  assert.match(native, /updateConsultationStartContext/);
  assert.match(startContext, /scopeSource:\s*confirmedLegacy \? "user" : "system_default"/);
});

test("P54 keeps zero-input intake compact while guided interviews retain their navigation column", () => {
  const start = read("my-app", "components", "consulting", "interview", "ZeroInputConsultationStart.tsx");
  const shell = read("my-app", "components", "consulting", "interview", "ConsultationInterview.tsx");
  const css = read("my-app", "app", "globals.css");
  assert.match(start, /data-layout="standalone"/);
  assert.match(shell, /const layout = navigation \? "guided" : "standalone"/);
  assert.match(shell, /data-layout=\{layout\}/);
  assert.match(css, /\.f-consulting-interview\[data-layout="standalone"\][\s\S]*?width:\s*min\(100%, 56rem\);[\s\S]*?min-height:\s*0;/);
  assert.match(css, /\.f-consulting-interview\[data-layout="guided"\] \.f-consulting-interview__body\s*\{[\s\S]*?grid-template-columns:\s*minmax\(12rem, 15rem\) minmax\(0, 1fr\)/);
  assert.match(css, /\.f-consulting-opening-intent__choices\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});

test("P54 keeps adaptive questions capped at two and separates clarification from results", () => {
  const profile = read("packages", "shared", "src", "consulting", "hair-profile.ts");
  const analysis = read("my-app", "components", "consulting", "workbenches", "AnalysisWorkbench.tsx");
  const hair = read("my-app", "components", "consulting", "hair", "HairRecommendationWorkbench.tsx");
  assert.match(profile, /Math\.min\(input\.maximum \?\? 2, 2,/);
  assert.match(analysis, /data-consulting-surface="clarification"/);
  assert.match(analysis, /if \(visibleQuestions\.length\) return/);
  assert.match(hair, /data-consulting-surface="revision"/);
  assert.match(hair, /data-consulting-surface="clarification"/);
});

test("P54 threads the chapter surface contract and exposes a versioned start-context API", () => {
  const stage = read("my-app", "components", "consulting", "ConsultationStagePage.tsx");
  const scene = read("my-app", "components", "consulting", "scene", "ConsultationScene.tsx");
  const api = read("my-app", "app", "api", "v2", "consultations", "[consultationId]", "start-context", "route.ts");
  assert.match(stage, /deriveConsultationChapterSurface/);
  assert.match(scene, /data-consulting-surface=\{surface\?\.mode/);
  assert.match(api, /expectedVersion/);
  assert.match(api, /deriveEffectiveConsultationIntent/);
  assert.match(api, /completeStage:\s*"discovery"/);
});
