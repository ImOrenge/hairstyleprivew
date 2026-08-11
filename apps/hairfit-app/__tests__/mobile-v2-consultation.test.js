/* global __dirname, expect, test */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Expo defaults to the resumable non-wizard V2 AI consultant", () => {
  const home = read("app/index.tsx");
  const navigation = read("lib/role-navigation.ts");
  const consulting = read("app/consulting.tsx");
  const resume = read("lib/v2-consultation-resume.ts");
  expect(home).toMatch(/AI 헤어 컨설턴트 시작/);
  expect(home).toMatch(/router\.push\("\/consulting"\)/);
  expect(navigation).toMatch(/href: "\/consulting", label: "상담"/);
  expect(resume).toMatch(/SecureStore/);
  expect(consulting).toMatch(/readActiveV2ConsultationId/);
  expect(consulting).toMatch(/isMobileV2ConsultationEnabled/);
  expect(consulting).toMatch(/getV2Consultation/);
  expect(consulting).toMatch(/getConsultation/);
  expect(consulting).toMatch(/createConsultation/);
  expect(consulting).toMatch(/createConsultation\(`mobile-consulting:\$\{Crypto\.randomUUID\(\)\}`\)/);
  expect(consulting).not.toMatch(/createV2Consultation/);
  expect(consulting).not.toMatch(/currentStep|Wizard/);
});

test("mobile consultation creation replays the same server snapshot for an idempotency key", () => {
  const apiClient = read("../../packages/api-client/src/index.ts");
  const route = read("../../my-app/app/api/consultations/route.ts");
  const store = read("../../my-app/lib/consulting/server-store.ts");
  expect(apiClient).toMatch(/createConsultation\(idempotencyKey\?: string\)/);
  expect(apiClient).toMatch(/"Idempotency-Key": idempotencyKey/);
  expect(route).toMatch(/request\.headers\.get\("Idempotency-Key"\)/);
  expect(store).toMatch(/\.eq\("user_id", userId\)\.eq\("idempotency_key", idempotencyKey\)/);
  expect(store).toMatch(/error\?\.code === "23505"/);
  expect(store).toMatch(/return hydrateTaskState\(normalizeRow\(replay\.data/);
});

test("Expo photo analysis and generation stay linked to the same consultation", () => {
  const upload = read("app/upload.tsx");
  const generate = read("app/generate.tsx");
  expect(upload).toMatch(/analyzeV2ConsultationPhoto/);
  expect(upload.indexOf("await analyzeForConsultation(receipt,")).toBeLessThan(
    upload.indexOf("flow.setDraftReceipt({"),
  );
  expect(generate).toMatch(
    /acceptGenerationDraft\(\s*receipt\.draftId,\s*quote\.quoteId,\s*consultationId \|\| undefined,\s*flow\.hairProfile,\s*\)/,
  );
});

test("Expo consultation Photo keeps 4:5 crop and optional natural-light color assist parity", () => {
  const upload = read("app/upload.tsx");
  const apiClient = read("../../packages/api-client/src/index.ts");
  expect(upload).toMatch(/allowsEditing: true/);
  expect(upload).toMatch(/aspect: \[4, 5\]/);
  expect(upload).toMatch(/pickColorAssist/);
  expect(upload).toMatch(/colorAssistDraftId/);
  expect(upload).toMatch(/퍼스널 컬러에만 사용/);
  expect(upload).toMatch(/crop: \{/);
  expect(upload).toMatch(/!result\.accepted && !result\.evidenceId/);
  expect(apiClient).toMatch(/photo: PhotoSnapshot/);
  expect(apiClient).toMatch(/faceEvidence: input\.faceEvidence/);
  expect(upload).not.toMatch(/유료 생성 확인|견적 승인/);
});

test("Expo renders server normalized evidence and real V2 board decisions", () => {
  const consulting = read("app/consulting.tsx");
  const overlay = read("components/consulting/NativeFaceEvidenceOverlay.tsx");
  expect(consulting).toMatch(/getV2AnalysisEvidence/);
  expect(consulting).toMatch(/correctV2AnalysisEvidence/);
  expect(consulting).toMatch(/AI 원본 좌표를 보존/);
  expect(consulting).toMatch(/getV2PreviewBoard/);
  expect(consulting).toMatch(/saveV2Shortlist/);
  expect(consulting).toMatch(/getV2Shortlist/);
  expect(consulting).toMatch(/selectV2Style/);
  expect(consulting).toMatch(/confirmV2Style/);
  expect(overlay).toMatch(/point\.x \* 100/);
  expect(overlay).toMatch(/point\.y \* 100/);
  expect(overlay).toMatch(/evidence\.landmarks/);
  expect(overlay).toMatch(/evidence\.contours/);
  expect(overlay).toMatch(/effectiveEvidencePointV2/);
  expect(overlay).toMatch(/user_adjusted/);
});

test("Expo reuses the server snapshot for automatic Brief, actual-service Aftercare and Fashion batch", () => {
  const consulting = read("app/consulting.tsx");
  const apiClient = read("../../packages/api-client/src/index.ts");
  expect(consulting).toMatch(/workspace\.journey\.recommendedStage/);
  expect(consulting).toMatch(/mobile-brief:auto/);
  expect(consulting).toMatch(/createV2Aftercare/);
  expect(consulting).toMatch(/today: \[\]/);
  expect(consulting).toMatch(/실제 시술 확정하고 관리 프로그램 자동 생성/);
  expect(consulting).toMatch(/prepareV2FashionBatch/);
  expect(consulting).toMatch(/reconcileV2FashionBatch/);
  expect(consulting).toMatch(/dispatchV2FashionBatch/);
  expect(consulting).toMatch(/별도의 유료 생성 확인 화면 없이/);
  expect(consulting).not.toMatch(/PaidActionQuote|\/api\/paid-actions\/quote|quoteId/);
  expect(apiClient).toMatch(/getV2FashionBatch/);
  expect(apiClient).toMatch(/direction: FashionDirectionSnapshot/);
  expect(apiClient).toMatch(/batch: FashionPreviewBatch/);
});

test("Expo Fashion interview autosaves seven topics without wizard navigation", () => {
  const consulting = read("app/consulting.tsx");
  expect(consulting).toMatch(/const FASHION_TOPICS = \["context", "impression", "fit", "exposure", "season", "budget", "avoid"\]/);
  expect(consulting).toMatch(/api\.updateConsultation\(workspace\.sessionId/);
  expect(consulting).toMatch(/\[`topic:\$\{topic\}`\]: "user"/);
  expect(consulting).toMatch(/completedFashionTopics\.length < 7/);
  expect(consulting).not.toMatch(/stepIndex|questionIndex|currentStep|다음 질문|다음 단계/);
});

test("Expo Discovery interview autosaves seven topics before Photo without common Next", () => {
  const consulting = read("app/consulting.tsx");
  expect(consulting).toMatch(/const DISCOVERY_TOPICS = \["purpose", "goals", "current-hair", "history", "services", "maintenance", "change"\]/);
  expect(consulting).toMatch(/saveDiscoveryTopic/);
  expect(consulting).toMatch(/completeStage: "discovery"/);
  expect(consulting).toMatch(/currentStage: "photo"/);
  expect(consulting).toMatch(/discoveryConfirmed && !consultation\.analysisEvidenceId/);
  expect(consulting).toMatch(/이 기준으로 사진 준비/);
  expect(consulting).not.toMatch(/다음 질문|다음 단계/);
});
