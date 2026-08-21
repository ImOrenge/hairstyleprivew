import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const repo = resolve(process.cwd(), "..");
const read = (...parts: string[]) => readFileSync(join(repo, ...parts), "utf8");

test("P43 chapter navigation remains while P54 replaces the three-decision intake with zero-input start", () => {
  const presentation = read("packages", "shared", "src", "consulting", "presentation.ts");
  const interview = read("my-app", "components", "consulting", "interview", "ZeroInputConsultationStart.tsx");
  const native = read("apps", "hairfit-app", "app", "consulting.tsx");
  assert.match(presentation, /\["intake",\s*"diagnosis",\s*"design",\s*"report"\]/);
  assert.match(interview, /사진 전 필수 질문 0개/);
  assert.doesNotMatch(interview, /currentStep|questionIndex|현재 모발 상태/);
  assert.match(native, /상담 시작 · 입력 0개/);
  assert.match(interview, /사진으로 분석 시작/);
});

test("P44 automatically forks hair observation, caps adaptive questions and atomically stores revisioned answers", () => {
  const analysis = read("my-app", "lib", "consulting", "photo-analysis-server.ts");
  const contract = read("packages", "shared", "src", "consulting", "hair-profile.ts");
  const server = read("my-app", "lib", "consulting", "hair-profile-server.ts");
  const migration = read("supabase", "migrations", "20260820143000_adaptive_hair_trait_diagnosis.sql");
  const mirror = read("my-app", "supabase", "migrations", "20260820143000_adaptive_hair_trait_diagnosis.sql");
  assert.match(analysis, /runHairTraitCapability/);
  assert.match(analysis, /Promise\.all/);
  assert.match(contract, /Math\.min\(input\.maximum \?\? 2, 2,/);
  assert.match(server, /answer_hair_diagnostic_question_v2/);
  assert.match(migration, /security definer/);
  assert.match(migration, /force row level security/);
  assert.equal(migration, mirror);
});

test("P45 gates Fashion on an immutable confirmed simulation and projects it into Result", () => {
  const journey = read("packages", "shared", "src", "consulting", "journey.ts");
  const workspace = read("my-app", "components", "consulting", "makeup", "MakeupSimulationWorkspace.tsx");
  const report = read("my-app", "lib", "consulting", "report-v2-server.ts");
  const migration = read("supabase", "migrations", "20260820144500_makeup_style_simulation.sql");
  const mirror = read("my-app", "supabase", "migrations", "20260820144500_makeup_style_simulation.sql");
  assert.match(journey, /simulationRequired/);
  assert.match(workspace, /Before \/ After/);
  assert.match(workspace, /기다리는 동안 상담을 나가도/);
  assert.match(report, /makeupMoodImageUrl/);
  assert.match(migration, /MAKEUP_SIMULATION_SELECTION_IMMUTABLE/);
  assert.match(migration, /force row level security/);
  assert.equal(migration, mirror);
});
