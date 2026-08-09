import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import path from "node:path";
import { liveTestEnvironment, resolveExistingMemberFixture } from "./existing-member-fixture";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("existing customer keeps one consultation through preflight, AI analysis, evidence persistence, and landmark rendering", async ({ page }) => {
  const environment = liveTestEnvironment();
  const fixture = await resolveExistingMemberFixture();
  await clerkSetup({ publishableKey: environment.publishableKey, secretKey: environment.secretKey });

  await page.goto("/");
  await clerk.signIn({ page, emailAddress: fixture.emailAddress });
  await page.goto("/consulting/new", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/consulting\/new$/);
  await expect(page.getByRole("heading", { name: /미리보기를 넘어/ })).toBeVisible();

  const createResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "POST" && url.pathname === "/api/consultations";
  });
  await page.getByRole("button", { name: "새 AI 상담 시작" }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const creation = await createResponse.json() as { snapshot?: { sessionId?: string; version?: number } };
  const consultationId = creation.snapshot?.sessionId ?? "";
  expect(consultationId).toMatch(UUID_PATTERN);
  await expect(page).toHaveURL(new RegExp(`/consulting/${consultationId}/discovery$`));

  await page.getByRole("group", { name: "이번 상담 목적" }).getByRole("button", { name: "일상 이미지 정리" }).click();
  await page.getByRole("group", { name: "원하는 변화" }).getByRole("button", { name: "얼굴 균형 보완" }).click();
  await page.getByLabel("현재 모발 상태").fill("어깨 아래 중간 길이의 직모이며 끝부분이 건조함");
  await page.getByRole("group", { name: "가능한 시술 범위" }).getByRole("button", { name: "커트" }).click();
  await page.getByRole("button", { name: "저장하고 다음 단계 열기" }).click();
  await expect(page.getByRole("link", { name: "다음 상담 단계" })).toBeVisible();
  await page.getByRole("link", { name: "다음 상담 단계" }).click();
  await expect(page).toHaveURL(new RegExp(`/consulting/${consultationId}/photo$`));

  const photoInput = page.locator('input[type="file"]');
  await photoInput.setInputFiles(path.resolve("my-app/public/hero/befor.png"));
  await expect(page.getByText("사진 사전검사를 통과했습니다.")).toBeVisible();
  await expect(page.locator("p").filter({ hasText: /^896×1344px ·/ })).toBeVisible();

  const draftResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "POST" && url.pathname === "/api/generations/drafts";
  });
  const analysisResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "POST" && url.pathname === `/api/consultations/${consultationId}/photo-analysis`;
  }, { timeout: 150_000 });
  await page.getByRole("button", { name: "사진 업로드 및 AI 상담 분석" }).click();

  const draftResponse = await draftResponsePromise;
  expect(draftResponse.status()).toBe(201);
  const draft = await draftResponse.json() as { draftId?: string };
  expect(draft.draftId).toMatch(UUID_PATTERN);

  const analysisResponse = await analysisResponsePromise;
  expect(analysisResponse.status()).toBe(200);
  const analysis = await analysisResponse.json() as {
    requiresRetry?: boolean;
    evidenceId?: string;
    consultationVersion?: number;
    evidence?: { pipelineStatus?: string; items?: unknown[] };
    faceAnalysis?: { confidence?: string; faceShape?: string };
    strategyRecommendations?: unknown[];
    quality?: Array<{ id?: string; status?: string }>;
  };
  expect(analysis.requiresRetry).toBe(false);
  expect(analysis.evidenceId).toMatch(UUID_PATTERN);
  expect(analysis.consultationVersion).toBeGreaterThan(Number(creation.snapshot?.version));
  expect(analysis.evidence?.pipelineStatus).toBe("linked");
  expect(analysis.evidence?.items).toHaveLength(6);
  expect(analysis.faceAnalysis?.confidence).toBe("high");
  expect(analysis.faceAnalysis?.faceShape).not.toBe("확인 전");
  expect(analysis.strategyRecommendations).toHaveLength(8);
  expect(analysis.quality).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "resolution", status: "pass" }),
  ]));

  await expect(page).toHaveURL(new RegExp(`/consulting/${consultationId}/scan$`), { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "분석 근거를 검토해요" })).toBeVisible();
  await page.getByRole("button", { name: "signed URL 갱신" }).click();
  const overlay = page.locator('[data-face-evidence-overlay="true"]');
  await expect(overlay).toBeVisible();
  expect(await overlay.locator("[data-landmark-id]").count()).toBeGreaterThanOrEqual(5);
  await expect(page.getByText(/MediaPipeFaceMesh 좌표 근거/)).toBeVisible();

  const supabase = createClient(environment.supabaseUrl, environment.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const sessionResult = await supabase
    .from("consultation_sessions")
    .select("id,user_id,current_stage,lifecycle_state,source_photo_id,analysis_evidence_id,snapshot")
    .eq("id", consultationId)
    .eq("user_id", fixture.userId)
    .single();
  expect(sessionResult.error).toBeNull();
  expect(sessionResult.data).toEqual(expect.objectContaining({
    id: consultationId,
    user_id: fixture.userId,
    current_stage: "scan",
    lifecycle_state: "analysis_ready",
    source_photo_id: draft.draftId,
    analysis_evidence_id: analysis.evidenceId,
  }));
  expect(sessionResult.data?.snapshot?.sessionId).toBe(consultationId);
  expect(sessionResult.data?.snapshot?.photo?.draftId).toBe(draft.draftId);
  expect(sessionResult.data?.snapshot?.evidence?.pipelineStatus).toBe("linked");

  const evidenceResult = await supabase
    .from("analysis_evidence_v2")
    .select("id,consultation_id,user_id,model_name,landmarks,contours,measurements,correction_revision")
    .eq("id", analysis.evidenceId)
    .eq("consultation_id", consultationId)
    .eq("user_id", fixture.userId)
    .single();
  expect(evidenceResult.error).toBeNull();
  expect(evidenceResult.data?.model_name).toBe("MediaPipeFaceMesh");
  expect(evidenceResult.data?.landmarks?.length).toBeGreaterThanOrEqual(5);
  expect(evidenceResult.data?.contours?.length).toBeGreaterThan(0);
  expect(evidenceResult.data?.measurements?.length).toBeGreaterThanOrEqual(4);
  expect(evidenceResult.data?.correction_revision).toBe(0);
});

test("latest analyzed consultation reaches the prepaid generation boundary without accepting or consuming usage", async ({ page }) => {
  const environment = liveTestEnvironment();
  const fixture = await resolveExistingMemberFixture();
  const supabase = createClient(environment.supabaseUrl, environment.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const latestResult = await supabase
    .from("consultation_sessions")
    .select("id,source_photo_id,source_generation_id")
    .eq("user_id", fixture.userId)
    .eq("lifecycle_state", "analysis_ready")
    .not("analysis_evidence_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  expect(latestResult.error).toBeNull();
  const consultationId = latestResult.data?.id ?? "";
  const draftId = latestResult.data?.source_photo_id ?? "";
  expect(consultationId).toMatch(UUID_PATTERN);
  expect(draftId).toMatch(UUID_PATTERN);
  expect(latestResult.data?.source_generation_id).toBeNull();

  const balanceBeforeResult = await supabase
    .from("users")
    .select("credits")
    .eq("id", fixture.userId)
    .single();
  expect(balanceBeforeResult.error).toBeNull();
  const balanceBefore = Number(balanceBeforeResult.data?.credits);
  expect(balanceBefore).toBeGreaterThanOrEqual(0);

  let acceptanceRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/generations/accept") {
      acceptanceRequests += 1;
    }
  });

  await clerkSetup({ publishableKey: environment.publishableKey, secretKey: environment.secretKey });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: fixture.emailAddress });
  await page.goto(`/consulting/${consultationId}/scan`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "분석 근거를 검토해요" })).toBeVisible();

  await page.getByRole("button", { name: "근거 검토 완료" }).click();
  await expect(page.getByRole("link", { name: "다음 상담 단계" })).toBeVisible();
  await page.getByRole("link", { name: "다음 상담 단계" }).click();
  await expect(page).toHaveURL(new RegExp(`/consulting/${consultationId}/analysis$`));

  await page.getByRole("button", { name: "저장하고 다음 단계 열기" }).click();
  await expect(page.getByRole("link", { name: "다음 상담 단계" })).toBeVisible();
  await page.getByRole("link", { name: "다음 상담 단계" }).click();
  await expect(page).toHaveURL(new RegExp(`/consulting/${consultationId}/direction$`));

  await page.getByRole("button", { name: "전략 확정 후 프리뷰 단계 열기" }).click();
  await expect(page.getByRole("link", { name: "다음 상담 단계" })).toBeVisible();
  await page.getByRole("link", { name: "다음 상담 단계" }).click();
  await expect(page).toHaveURL(new RegExp(`/consulting/${consultationId}/previews$`));

  const quoteResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "POST" && url.pathname === "/api/paid-actions/quote";
  });
  await page.getByRole("button", { name: "이용 조건 확인" }).click();
  const quoteResponse = await quoteResponsePromise;
  expect(quoteResponse.status()).toBe(201);
  const quotePayload = await quoteResponse.json() as {
    quote?: {
      subjectId?: string;
      currentBalance?: number;
      costCredits?: number;
      balanceAfter?: number;
      isAllowed?: boolean;
    };
  };
  expect(quotePayload.quote).toEqual(expect.objectContaining({
    subjectId: draftId,
    currentBalance: balanceBefore,
    isAllowed: true,
  }));
  expect(quotePayload.quote?.costCredits).toBeGreaterThan(0);
  expect(quotePayload.quote?.balanceAfter).toBe(balanceBefore - Number(quotePayload.quote?.costCredits));
  await expect(page.getByRole("button", { name: "3×3 생성 시작" })).toBeVisible();
  expect(acceptanceRequests).toBe(0);

  const afterResult = await supabase
    .from("consultation_sessions")
    .select("current_stage,source_generation_id,snapshot")
    .eq("id", consultationId)
    .eq("user_id", fixture.userId)
    .single();
  const balanceAfterResult = await supabase
    .from("users")
    .select("credits")
    .eq("id", fixture.userId)
    .single();
  expect(afterResult.error).toBeNull();
  expect(afterResult.data?.current_stage).toBe("previews");
  expect(afterResult.data?.source_generation_id).toBeNull();
  expect(afterResult.data?.snapshot?.strategy?.confirmedAt).toEqual(expect.any(String));
  expect(balanceAfterResult.error).toBeNull();
  expect(Number(balanceAfterResult.data?.credits)).toBe(balanceBefore);
});
