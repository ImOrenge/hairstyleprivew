import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname,join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeAftercareCheckinResponseV1 } from "@hairfit/shared/v2";

const root=join(dirname(fileURLToPath(import.meta.url)),"..");const read=(path:string)=>readFileSync(join(root,path),"utf8");

test("grounded aftercare response keeps fixed safety notice",()=>{
  const response=normalizeAftercareCheckinResponseV1({title:"시술 후 관리",summary:"현재 고민을 기준으로 관리 순서를 정리했습니다.",careActions:["낮은 열로 짧게 말려 주세요."],cautions:["사진은 조명에 따라 다르게 보일 수 있습니다."],nextAction:"변화를 지켜보고 살롱에 공유하세요.",evidenceIds:["customer-concern"]},["customer-concern"]);
  assert.match(response.safetyNotice,/통증·화상·발진/);assert.deepEqual(response.evidenceIds,["customer-concern"]);
});

test("ungrounded or medical-looking output is rejected",()=>{
  assert.throws(()=>normalizeAftercareCheckinResponseV1({title:"관리",summary:"의학 진단 결과입니다.",careActions:["실행"],cautions:[],nextAction:"확인",evidenceIds:["unknown"]},["customer-concern"]));
  assert.throws(()=>normalizeAftercareCheckinResponseV1({title:"관리",summary:"확인했습니다.",careActions:["약품을 30분 사용하세요."],cautions:[],nextAction:"확인",evidenceIds:["customer-concern"]},["customer-concern"]));
});

test("routes separate private photo observation from structured response and fail closed",()=>{
  const capability=read("lib/capabilities/aftercare-checkin-service.ts");const server=read("lib/v2/aftercare-checkin-server.ts");const route=read("app/api/v2/consultations/[consultationId]/aftercare-checkins/[slot]/submit/route.ts");const ui=read("components/consulting/workbenches/AftercareCheckinPanel.tsx");
  assert.match(capability,/aftercare-checkin-photo-analysis/);assert.match(capability,/aftercare-checkin-response-generation/);
  assert.match(server,/runAftercarePhotoAnalysis[\s\S]*runAftercareCheckinResponse/);assert.doesNotMatch(capability,/userId:string;sourceFingerprint/);
  assert.match(server,/claimResult\?\.claimed===false/);assert.match(server,/photo_capability_task_id/);
  assert.match(route,/isFullStyleAftercareCheckinsEnabled/);assert.match(route,/Idempotency-Key|idempotency-key/i);
  assert.match(ui,/D\+\{item\.offsetDays\}/);assert.match(ui,/다시 시도해도 남은 횟수는 줄지 않습니다/);assert.match(ui,/사진 분석과 비공개 저장에 동의/);
});
