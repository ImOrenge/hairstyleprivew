import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { AnalysisEvidenceV2 } from "@hairfit/shared/v2";

const STAGES = [
  ["discovery","DISCOVERY"],["photo","PHOTO"],["scan","FACE SCAN"],["analysis","ANALYSIS"],["direction","DIRECTION"],
  ["previews","PREVIEW"],["compare","COMPARE"],["decision","DECISION"],["salon-brief","SALON BRIEF"],["aftercare","AFTERCARE"],["fashion","FASHION"],
] as const;

const LANDMARK_EVIDENCE = {
  schemaVersion: "analysis-evidence-v1",
  id: "00000000-0000-4000-8000-000000000013",
  consultationId: "00000000-0000-4000-8000-000000000011",
  sourceImageFingerprint: "e2e-fixture-fingerprint-0001",
  sourceTransform: { rotationDegrees: 0, sourceWidth: 5, sourceHeight: 4, crop: { x: 0, y: 0, width: 1, height: 1 } },
  model: { provider: "fixture", name: "MediaPipeFaceMesh", version: "e2e" },
  quality: { status: "pass", overall: .9, frontal: .9, lighting: .9, resolution: .9, blur: .9, occlusion: .9, hairlineVisibility: .8, warnings: [] },
  landmarks: [
    ["forehead-center",.5,.21],["chin",.5,.79],["left-temple",.29,.44],["right-temple",.71,.44],["nose-tip",.5,.51],
  ].map(([id,x,y]) => ({ id, group: id === "nose-tip" ? "nose" : "face", source: "detected", confidence: .9, point: { x, y } })),
  contours: [{ id: "face_contour", source: "detected", confidence: .9, points: [{x:.5,y:.2},{x:.72,y:.38},{x:.68,y:.67},{x:.5,y:.8},{x:.32,y:.67},{x:.28,y:.38},{x:.5,y:.2}] }],
  hairline: { confidence: .68, adjustmentAllowed: true, lines: [{ id: "hairline_estimate", source: "inferred", confidence: .68, points: [{x:.35,y:.25},{x:.5,y:.19},{x:.65,y:.25}] }] },
  measurements: [
    { id: "face_length", kind: "length", normalizedValue: .59, category: "balanced", confidence: .9, geometry: [{x:.5,y:.2},{x:.5,y:.79}] },
    { id: "cheekbone_width", kind: "width", normalizedValue: .42, category: "balanced", confidence: .9, geometry: [{x:.29,y:.45},{x:.71,y:.45}] },
  ],
  faceShape: { primary: "oval", secondary: null, blend: { oval: 1 }, summary: "fixture" },
  skinSampleRegions: [{ id: "skin_left_cheek", label: "왼쪽 볼 샘플", source: "detected", confidence: .9, points: [{x:.31,y:.48},{x:.39,y:.45},{x:.4,y:.56},{x:.32,y:.58}] }],
  excludedRegions: [{ id: "excluded_lips", label: "입술 제외", source: "detected", confidence: .9, points: [{x:.43,y:.63},{x:.5,y:.6},{x:.57,y:.63},{x:.5,y:.68}] }],
  correctionRevision: 0,
  manualCorrections: [],
  correctedAt: null,
  createdAt: "2026-08-08T00:00:00.000Z",
} as AnalysisEvidenceV2;

const FACE_PHOTO_FIXTURE = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="400" viewBox="0 0 5 4">
  <rect width="5" height="4" fill="#d8d2ca"/>
  <ellipse cx="2.5" cy="2.05" rx="1.1" ry="1.25" fill="#c99678"/>
  <path d="M1.42 1.8 Q1.65 .55 2.5 .55 Q3.35 .55 3.58 1.8 Q3.12 1.2 2.5 1.18 Q1.88 1.2 1.42 1.8" fill="#2f2925"/>
  <circle cx="2.08" cy="1.78" r=".08" fill="#29231f"/><circle cx="2.92" cy="1.78" r=".08" fill="#29231f"/>
  <path d="M2.2 2.55 Q2.5 2.72 2.8 2.55" fill="none" stroke="#754d42" stroke-width=".035"/>
</svg>`)}`;

async function dismissGlobalNotices(page: import("@playwright/test").Page) {
  for (const selector of ['[data-dialog-id="subscription-payment-notice"]','[data-dialog-id="account-setup-prompt"]']) {
    const dialog = page.locator(selector);
    if (await dialog.isVisible().catch(() => false)) { await page.keyboard.press("Escape"); await expect(dialog).toBeHidden(); }
  }
}

test("all 11 document Scenes are headerless, addressable, and overflow-safe", async ({ page }, testInfo) => {
  for (const [stage, task] of STAGES) {
    await page.goto(`/consulting/e2e-harness?stage=${stage}`);
    await dismissGlobalNotices(page);
    await expect(page.getByText(task, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    await expect(page.locator('[data-app-shell="header"]')).toHaveCount(0);
    await expect(page.locator('[data-app-shell="footer"]')).toHaveCount(0);
    await expect(page.locator('[data-consulting-split-canvas="true"]')).toHaveCount(1);
    await expect(page.locator('[data-consulting-pane="input"]')).toHaveCount(1);
    await expect(page.locator('[data-consulting-pane="output"]')).toHaveCount(1);
    await expect(page.locator('[data-consulting-system-data="true"]')).toBeVisible();
    expect(await page.locator('[data-consulting-scene-identity="true"]').evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(240);
    const overflow = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
  }
  await page.screenshot({ path: testInfo.outputPath("consulting-fashion-desktop.png"), fullPage: true, animations: "disabled" });
});

test("desktop panes scroll independently while mobile keeps input before output", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/consulting/e2e-harness?stage=discovery");
  await dismissGlobalNotices(page);
  const desktop = await page.locator('[data-consulting-split-canvas="true"]').evaluate((canvas) => {
    const input = canvas.querySelector<HTMLElement>('[data-consulting-pane="input"]');
    const output = canvas.querySelector<HTMLElement>('[data-consulting-pane="output"]');
    if (!input || !output) throw new Error("split panes missing");
    return {
      canvasOverflow: getComputedStyle(canvas).overflow,
      inputOverflowY: getComputedStyle(input).overflowY,
      outputOverflowY: getComputedStyle(output).overflowY,
      inputHeight: input.getBoundingClientRect().height,
      outputHeight: output.getBoundingClientRect().height,
      inputScrollable: input.scrollHeight > input.clientHeight,
      outputScrollable: output.scrollHeight > output.clientHeight,
    };
  });
  expect(desktop.canvasOverflow).toBe("hidden");
  expect(desktop.inputOverflowY).toBe("auto");
  expect(desktop.outputOverflowY).toBe("auto");
  expect(desktop.inputHeight).toBeGreaterThan(200);
  expect(desktop.outputHeight).toBe(desktop.inputHeight);
  expect(desktop.inputScrollable).toBe(true);
  expect(desktop.outputScrollable).toBe(true);
  const independentScroll = await page.locator('[data-consulting-split-canvas="true"]').evaluate((canvas) => {
    const input = canvas.querySelector<HTMLElement>('[data-consulting-pane="input"]');
    const output = canvas.querySelector<HTMLElement>('[data-consulting-pane="output"]');
    if (!input || !output) throw new Error("split panes missing");
    input.scrollTop = 120;
    const afterInput = { input: input.scrollTop, output: output.scrollTop };
    output.scrollTop = 120;
    return { afterInput, afterOutput: { input: input.scrollTop, output: output.scrollTop } };
  });
  expect(independentScroll.afterInput.input).toBeGreaterThan(0);
  expect(independentScroll.afterInput.output).toBe(0);
  expect(independentScroll.afterOutput.input).toBe(independentScroll.afterInput.input);
  expect(independentScroll.afterOutput.output).toBeGreaterThan(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await dismissGlobalNotices(page);
  const mobile = await page.locator('[data-consulting-split-canvas="true"]').evaluate((canvas) => {
    const input = canvas.querySelector<HTMLElement>('[data-consulting-pane="input"]');
    const output = canvas.querySelector<HTMLElement>('[data-consulting-pane="output"]');
    if (!input || !output) throw new Error("split panes missing");
    return {
      inputOverflowY: getComputedStyle(input).overflowY,
      outputOverflowY: getComputedStyle(output).overflowY,
      inputTop: input.getBoundingClientRect().top,
      outputTop: output.getBoundingClientRect().top,
    };
  });
  expect(mobile.inputOverflowY).not.toBe("auto");
  expect(mobile.outputOverflowY).not.toBe("auto");
  expect(mobile.outputTop).toBeGreaterThan(mobile.inputTop);
});

test("ALL STAGES overlay traps focus, closes with Escape, and returns focus", async ({ page }) => {
  await page.goto("/consulting/e2e-harness?stage=discovery");
  await dismissGlobalNotices(page);
  const trigger = page.getByRole("button", { name: "All stages" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "ALL STAGES" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link")).toHaveCount(11);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("two quality-accepted previews can open comparison before all nine finish", async ({ page }) => {
  await page.route("**/api/v2/consultations/**/preview-board", (route) => route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ state: "generating" }) }));
  await page.goto("/consulting/e2e-harness?stage=previews");
  await dismissGlobalNotices(page);
  await page.getByRole("button", { name: /BALANCE 1/ }).click();
  await page.getByRole("button", { name: /BALANCE 2/ }).click();
  await expect(page.getByText("Shortlist 2 / 3")).toBeVisible();
  await expect(page.getByRole("button", { name: "선택한 후보 비교하기" })).toBeEnabled();
});

test("Scan renders persisted face landmarks and measurement interactions over the photo", async ({ page }, testInfo) => {
  let landmarkEvidence: AnalysisEvidenceV2 = structuredClone(LANDMARK_EVIDENCE);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.route("**/api/consultations/**/photo-assets", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ primaryUrl: FACE_PHOTO_FIXTURE }),
  }));
  await page.route("**/api/v2/consultations/**/evidence", async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as { targetId: string; adjustedPoint: { x: number; y: number } };
      const original = landmarkEvidence.landmarks.find((item) => item.id === body.targetId)?.point ?? { x: 0, y: 0 };
      landmarkEvidence = {
        ...landmarkEvidence,
        correctionRevision: landmarkEvidence.correctionRevision + 1,
        correctedAt: "2026-08-09T00:10:00.000Z",
        manualCorrections: [...landmarkEvidence.manualCorrections, {
          id: "00000000-0000-4000-8000-000000000099",
          targetType: "landmark" as const,
          targetId: body.targetId,
          pointIndex: 0,
          originalPoint: original,
          adjustedPoint: body.adjustedPoint,
          correctedAt: "2026-08-09T00:10:00.000Z",
        }],
      };
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ evidence: landmarkEvidence }) });
  });
  await page.goto("/consulting/e2e-harness?stage=scan");
  await dismissGlobalNotices(page);
  await expect(page.locator('[data-consulting-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: "signed URL 갱신" }).click();
  await expect(page.getByRole("img", { name: "상담 분석용 원본 사진" })).toBeVisible();
  const overlay = page.locator('[data-face-evidence-overlay="true"]');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("viewBox", "0 0 5 4");
  await expect(overlay).toHaveAttribute("preserveAspectRatio", "xMidYMid slice");
  await expect(overlay.locator('[data-landmark-id="nose-tip"]')).toHaveAttribute("cx", "2.5");
  await expect(overlay.locator('[data-landmark-id="nose-tip"]')).toHaveAttribute("cy", "2.04");
  await expect(overlay.locator("[data-landmark-id]")).toHaveCount(5);
  const faceContour = overlay.locator('[data-evidence-id="face_contour"]');
  await expect(faceContour).toHaveAttribute("data-evidence-source", "detected");
  await expect(faceContour).toHaveCSS("fill", "none");
  await expect(overlay.locator('[data-evidence-id="hairline_estimate"]')).toHaveAttribute("data-evidence-source", "inferred");
  await page.getByRole("button", { name: "피부 샘플" }).click();
  await expect(overlay.locator('[data-evidence-id="skin_left_cheek"]')).toBeVisible();
  await page.getByRole("button", { name: "컬러 제외" }).click();
  await expect(overlay.locator('[data-evidence-id="excluded_lips"]')).toBeVisible();
  await page.getByRole("button", { name: /hairline 사진 근거 강조/ }).click();
  await expect(overlay.locator('[data-evidence-id="hairline_estimate"]')).toHaveAttribute("data-evidence-active", "true");
  const cheekbone = page.getByRole("button", { name: "광대 폭 측정 근거" });
  await cheekbone.focus();
  await expect(cheekbone).toHaveAttribute("aria-pressed", "true");
  await expect(cheekbone).toHaveCSS("outline-style", "none");
  await page.getByLabel("보정할 AI 기준점").selectOption("nose-tip");
  await page.getByRole("button", { name: "오른쪽으로 이동" }).click();
  const correctedNose = overlay.locator('[data-landmark-id="nose-tip"]');
  await expect(correctedNose).toHaveAttribute("cx", "2.525");
  await expect(correctedNose).toHaveAttribute("data-evidence-source", "user_adjusted");
  await expect(correctedNose).toHaveAttribute("data-original-x", "0.5");
  await expect(page.getByText(/AI 원본 좌표를 보존하고 사용자 보정 리비전 1/)).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay")).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toHaveLength(0);
  expect(consoleErrors).toEqual([]);
  await page.locator('[data-photo-evidence-stage="true"]').screenshot({
    path: testInfo.outputPath("scan-landmark-overlay.png"),
    animations: "disabled",
  });
});

test("Fashion Scene recommends, quotes, generates, and compares real server sessions without a wizard", async ({ page }) => {
  const consultationId = "00000000-0000-4000-8000-000000000011";
  const activeSessionId = "00000000-0000-4000-8000-000000000031";
  const fashionDirection = { situation: "daily", genre: "casual", season: "all-season", fit: "regular", exposure: "balanced", budget: "20만 원 이내", avoidItems: ["모자"] };
  const basePreviews = [
    { stylingSessionId: "00000000-0000-4000-8000-000000000032", slotId: "work-office", category: "WORK", genre: "office", headline: "워크 룩 A" },
    { stylingSessionId: "00000000-0000-4000-8000-000000000033", slotId: "statement-formal", category: "STATEMENT", genre: "formal", headline: "포멀 룩 B" },
  ];
  let generated = false;

  await page.route("**/api/style-profile", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ profile: { bodyPhotoPath: "private/body.webp" } }),
  }));
  await page.route("**/api/v2/consultations/**/fashion-previews", (route) => {
    if (route.request().method() !== "GET") return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ previewSet: {} }) });
    const previews = [
      ...basePreviews.map((preview) => ({
        ...preview,
        selectionSnapshotId: "00000000-0000-4000-8000-000000000021",
        status: "completed",
        direction: fashionDirection,
        summary: `${preview.headline} summary`,
        palette: ["navy", "ivory"],
        silhouette: "balanced",
        neckline: "균형 넥라인",
        items: [],
        shoppingKeywords: [preview.headline],
        imageUrl: FACE_PHOTO_FIXTURE,
        errorMessage: null,
        createdAt: "2026-08-09T00:00:00.000Z",
        updatedAt: "2026-08-09T00:00:00.000Z",
      })),
      {
        stylingSessionId: activeSessionId,
        selectionSnapshotId: "00000000-0000-4000-8000-000000000021",
        slotId: "daily-casual",
        category: "DAILY",
        genre: "casual",
        direction: fashionDirection,
        status: generated ? "completed" : "recommended",
        headline: "데일리 룩 C",
        summary: "확정 헤어와 바디 프로필을 반영한 데일리 룩",
        palette: ["navy", "ivory"],
        silhouette: "balanced",
        neckline: "균형 넥라인",
        items: [],
        shoppingKeywords: ["navy jacket"],
        imageUrl: generated ? FACE_PHOTO_FIXTURE : null,
        errorMessage: null,
        createdAt: "2026-08-09T00:00:00.000Z",
        updatedAt: "2026-08-09T00:00:00.000Z",
      },
    ];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ previews, previewSet: null }) });
  });
  await page.route("**/api/styling/recommend", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      sessionId: activeSessionId,
      status: "recommended",
      recommendation: {
        headline: "데일리 룩 C",
        summary: "확정 헤어와 바디 프로필을 반영한 추천",
        genre: "casual",
        palette: ["navy", "ivory"],
        silhouette: "balanced",
        items: [],
        stylingNotes: [],
        generatedAt: "2026-08-09T00:00:00.000Z",
      },
    }),
  }));
  await page.route("**/api/paid-actions/quote", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ quote: {
      quoteId: "signed-fashion-quote",
      action: "outfit_generation",
      subjectId: activeSessionId,
      billingScope: "customer",
      costCredits: 20,
      currentBalance: 100,
      balanceAfter: 80,
      shortfallCredits: 0,
      isFree: false,
      freeReason: null,
      isAllowed: true,
      issuedAt: "2026-08-09T00:00:00.000Z",
      expiresAt: "2099-08-09T00:30:00.000Z",
      policyVersion: "hairfit-credit-policy-2026-07",
      lockConsequence: null,
      failurePolicy: "실패하면 예약 크레딧을 환불합니다.",
    } }),
  }));
  await page.route("**/api/styling/generate", (route) => {
    generated = true;
    return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ sessionId: activeSessionId, status: "generating" }) });
  });

  await page.goto("/consulting/e2e-harness?stage=fashion");
  await dismissGlobalNotices(page);
  await expect(page.locator("[data-fashion-slot-id]")).toHaveCount(9);
  await page.getByRole("button", { name: "패션 추천 만들기" }).click();
  await expect(page.getByRole("heading", { name: "데일리 룩 C" })).toBeVisible();
  await expect(page.getByText("20크레딧 사용 예정")).toBeVisible();
  await page.getByRole("button", { name: "실제 패션 프리뷰 생성" }).click();
  await expect(page.getByRole("heading", { name: "실제 생성 결과 3개 / 9개" })).toBeVisible();

  for (const label of ["워크 룩 A", "포멀 룩 B", "데일리 룩 C"]) {
    await page.getByRole("button", { name: new RegExp(`후보 담기 · ${label}`) }).click();
  }
  await expect(page.getByText("현재 3개.")).toBeVisible();
  await page.getByRole("button", { name: /데일리 룩 C.*DAILY/ }).last().click();
  await expect(page.getByRole("button", { name: "AI 컨설팅 여정 완료" })).toBeEnabled();
  expect(await page.locator("text=프로필 확인").count()).toBe(0);
  expect(await page.locator("text=장르 선택").count()).toBe(0);
  expect(consultationId).toBeTruthy();
});

for (const viewport of [{ width: 390, height: 844, colorScheme: "light" as const }, { width: 768, height: 1024, colorScheme: "dark" as const }]) {
  test(`Scene stays accessible at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: viewport.colorScheme, reducedMotion: "reduce" });
    await page.goto("/consulting/e2e-harness?stage=discovery");
    await dismissGlobalNotices(page);
    const overflow = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
    const accessibility = await new AxeBuilder({ page }).include("main").withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
    expect(accessibility.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`consulting-discovery-${viewport.width}-${viewport.colorScheme}.png`), fullPage: true, animations: "disabled" });
  });
}
