import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { AnalysisEvidenceV2 } from "@hairfit/shared/v2";
import path from "node:path";

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
  faceShape: { primary: "oval", secondary: "round", blend: { "male:oval": .55, "male:round": .2, "male:long": .1, "male:rectangle": .1, "male:triangle": .05 }, summary: "fixture" },
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
    const accessibility = await new AxeBuilder({ page }).include("main").withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
    expect(accessibility.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
  }
  await page.screenshot({ path: testInfo.outputPath("consulting-fashion-desktop.png"), fullPage: true, animations: "disabled" });
});

test("desktop panes scroll independently while mobile keeps input before output", async ({ page }, testInfo) => {
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
  const inputControlSeparators = await page.locator('[data-consulting-input-control="true"]').evaluateAll((controls) => controls.map((control) => {
    const style = getComputedStyle(control);
    return { width: style.borderBottomWidth, style: style.borderBottomStyle, color: style.borderBottomColor };
  }));
  expect(inputControlSeparators.length).toBeGreaterThan(10);
  expect(inputControlSeparators.filter((separator) => separator.width === "1px" && separator.style === "solid").length).toBeGreaterThan(8);
  await page.screenshot({ path: testInfo.outputPath("consulting-discovery-input-separators.png"), fullPage: true, animations: "disabled" });
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
  await expect(dialog.locator("li")).toHaveCount(11);
  await expect(dialog.getByRole("link")).toHaveCount(6);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Discovery and Fashion use standalone, keyboard-safe interview layouts without paid confirmation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });

  for (const stage of ["discovery", "fashion"] as const) {
    await page.goto(`/consulting/e2e-harness?stage=${stage}&interview=1`);
    await dismissGlobalNotices(page);
    const interview = page.locator(".f-consulting-interview");
    await expect(interview).toBeVisible();
    await expect(interview).toHaveAttribute("data-kind", stage === "discovery" ? "discovery" : "fashion-direction");
    if (stage === "fashion") {
      await expect(page.getByRole("navigation", { name: "패션 방향 인터뷰 목록" })).toBeVisible();
      await expect(page.locator("[data-fashion-board-size='9']")).toHaveCount(0);
      await expect(page.getByText("AI 출력 및 시스템 데이터", { exact: true })).toHaveCount(0);
    }
    await expect(interview.locator("[data-question-id] h3")).toBeFocused();
    await expect(interview).not.toContainText(/다음 단계|유료 생성|결제 확인|견적 승인/);
    await expect(interview.locator(".f-consulting-interview__question")).toHaveCSS("animation-name", "none");
    const overflow = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);

    const summaryTrigger = page.getByRole("button", { name: "전체 답변 보기" });
    await summaryTrigger.click();
    const summary = page.getByRole("dialog", { name: "전체 상담 기준" });
    await expect(summary).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(summary).toBeHidden();
    await expect(summaryTrigger).toBeFocused();
  }
});

test("Fashion direction is a standalone desktop interview before its generation board", async ({ page }) => {
  await page.goto("/consulting/e2e-harness?stage=fashion&interview=1");
  await dismissGlobalNotices(page);

  const interview = page.locator(".f-consulting-interview[data-kind='fashion-direction']");
  const navigation = page.getByRole("navigation", { name: "패션 방향 인터뷰 목록" });
  const question = interview.locator(".f-consulting-interview__question");
  await expect(interview).toBeVisible();
  await expect(navigation).toBeVisible();
  await expect(page.locator("[data-fashion-board-size='9']")).toHaveCount(0);

  const [navigationBox, questionBox, overflowY] = await Promise.all([
    navigation.boundingBox(),
    question.boundingBox(),
    interview.evaluate((element) => getComputedStyle(element).overflowY),
  ]);
  expect(navigationBox).not.toBeNull();
  expect(questionBox).not.toBeNull();
  expect(navigationBox!.x).toBeLessThan(questionBox!.x);
  expect(overflowY).toBe("auto");
});

test("Photo offers an optional natural-light source and a face-aware crop before automatic analysis handoff", async ({ page }) => {
  await page.goto("/consulting/e2e-harness?stage=photo");
  await dismissGlobalNotices(page);
  const fixture = path.resolve("my-app/public/hero/demo/female-01.webp");
  const inputs = page.locator('main input[type="file"]');
  await expect(inputs).toHaveCount(2);
  await inputs.nth(0).setInputFiles(fixture);
  await expect(page.getByText("컬러 진단 보조 사진 준비됨")).toBeVisible();
  await inputs.nth(1).setInputFiles(fixture);
  await expect(page.getByText("분석 프레이밍", { exact: true })).toBeVisible();
  await expect(page.getByRole("slider", { name: "가로 위치" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "세로 위치" })).toBeVisible();
  await expect(page.getByRole("button", { name: "이 프레이밍 사용" })).toBeEnabled();
  await expect(page.getByText("프레이밍을 확정하면 분석을 별도로 다시 요청하지 않아도 Scan 대기 화면까지 자동으로 이어집니다.")).toBeVisible();
});

test("consultation exit confirms saved state and remains available during work", async ({ page }) => {
  await page.goto("/consulting/e2e-harness?stage=discovery");
  await dismissGlobalNotices(page);
  const exit = page.getByRole("button", { name: "상담 나가기" });
  await exit.click();
  const dialog = page.getByRole("dialog", { name: "상담을 나갈까요?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("저장된 상담 내용과 진행 중인 AI 작업은 유지됩니다.");
  await expect(dialog).toContainText("아직 저장하지 않은 입력은 사라질 수 있습니다.");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(exit).toBeFocused();

  await page.goto("/consulting/e2e-harness?stage=scan&liveness=1&transition=analysis&transitionState=running");
  await dismissGlobalNotices(page);
  await page.getByRole("button", { name: "상담 나가기" }).click();
  await expect(page.getByRole("dialog", { name: "상담을 나갈까요?" })).toBeVisible();
  const homeRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/home");
  await page.getByRole("button", { name: "저장된 상태로 나가기" }).click();
  await homeRequest;
});

test("two quality-accepted previews can open comparison before all nine finish", async ({ page }) => {
  await page.route("**/api/v2/consultations/**/preview-board", (route) => route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ state: "generating" }) }));
  await page.goto("/consulting/e2e-harness?stage=previews");
  await dismissGlobalNotices(page);
  const generationStatus = page.locator('[data-generation-state="partial"]');
  await expect(generationStatus).toContainText("비교 가능 · 나머지 프리뷰 생성 중");
  await expect(generationStatus).toContainText("2 / 9");
  const balanceOne = page.getByRole("button", { name: /BALANCE 1/ });
  const balanceTwo = page.getByRole("button", { name: /BALANCE 2/ });
  await balanceOne.click();
  await expect(balanceOne).toHaveAttribute("aria-pressed", "true");
  await balanceTwo.click();
  await expect(balanceTwo).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Shortlist 2 / 3")).toBeVisible();
  await expect(page.getByRole("button", { name: "선택한 후보 비교하기" })).toBeEnabled();
});

test("transient consultant activity is lively, pausable, result-neutral, and layout-stable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const target = window as typeof window & { __consultantEvents?: unknown[] };
    target.__consultantEvents = [];
    window.addEventListener("hairfit:consultation-liveness", (event) => {
      target.__consultantEvents?.push((event as CustomEvent).detail);
    });
  });
  await page.goto("/consulting/e2e-harness?stage=scan&liveness=1&transition=analysis&transitionState=running");
  await dismissGlobalNotices(page);
  const transition = page.locator(".f-consultant-transition");
  const kinetic = page.locator(".f-consultant-kinetic");
  await expect(transition).toBeVisible();
  const meaningfulStateDelay = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return performance.now() - (navigation?.responseEnd ?? 0);
  });
  expect(meaningfulStateDelay).toBeLessThanOrEqual(300);
  await expect(page.locator('[data-consulting-split-canvas="true"]')).toHaveCount(0);
  await expect(page.locator("#consultant-transition-title")).toBeFocused();
  await expect(kinetic.locator("svg")).toHaveAttribute("aria-hidden", "true");
  const accessibility = await new AxeBuilder({ page }).include("main").withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
  expect(accessibility.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
  await expect(page.getByRole("button", { name: "결과에 영향을 주지 않는 대기 인터랙션" })).toHaveCount(0);
  await page.evaluate(() => {
    const target = window as typeof window & { __consultantLongTasks?: number[]; __consultantLayoutShifts?: number[]; __consultantLongTaskObserver?: PerformanceObserver; __consultantLayoutShiftObserver?: PerformanceObserver };
    target.__consultantLongTasks = [];
    target.__consultantLayoutShifts = [];
    if (typeof PerformanceObserver === "undefined") return;
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      target.__consultantLongTaskObserver = new PerformanceObserver((list) => {
        target.__consultantLongTasks?.push(...list.getEntries().map((entry) => entry.duration));
      });
      target.__consultantLongTaskObserver.observe({ type: "longtask" });
    }
    if (PerformanceObserver.supportedEntryTypes.includes("layout-shift")) {
      target.__consultantLayoutShiftObserver = new PerformanceObserver((list) => {
        target.__consultantLayoutShifts?.push(...list.getEntries().map((entry) => (entry as PerformanceEntry & { value: number }).value));
      });
      target.__consultantLayoutShiftObserver.observe({ type: "layout-shift" });
    }
  });
  const animationRequests: string[] = [];
  const recordRequest = (request: import("@playwright/test").Request) => animationRequests.push(request.url());
  page.on("request", recordRequest);
  const before = await kinetic.boundingBox();
  await page.waitForTimeout(5_200);
  const fidget = page.getByRole("button", { name: "결과에 영향을 주지 않는 대기 인터랙션" });
  await expect(fidget).toBeVisible();
  await fidget.click();
  await page.waitForTimeout(250);
  const productEvents = await page.evaluate(() => (window as typeof window & { __consultantEvents?: Array<Record<string, unknown>> }).__consultantEvents ?? []);
  expect(productEvents.some((event) => event.event === "consultant_task_visible")).toBe(true);
  expect(productEvents.some((event) => event.event === "consultant_phase_changed")).toBe(true);
  expect(productEvents.some((event) => event.event === "consultant_fidget_used" && event.fidgetUseCount === 1)).toBe(true);
  for (const event of productEvents) {
    expect(Object.keys(event).sort()).toEqual(expect.arrayContaining(["event", "taskKind"]));
    expect(event).not.toHaveProperty("sessionId");
    expect(event).not.toHaveProperty("taskId");
    expect(event).not.toHaveProperty("clientX");
    expect(event).not.toHaveProperty("clientY");
  }
  await page.getByRole("button", { name: "연출 멈춤" }).click();
  await expect(kinetic).toHaveAttribute("data-paused", "true");
  await page.waitForTimeout(4_550);
  const after = await kinetic.boundingBox();
  expect(after?.x).toBeCloseTo(before?.x ?? 0, 1);
  expect(after?.y).toBeCloseTo(before?.y ?? 0, 1);
  expect(after?.width).toBeCloseTo(before?.width ?? 0, 1);
  expect(after?.height).toBeCloseTo(before?.height ?? 0, 1);
  const longTasks = await page.evaluate(() => (window as typeof window & { __consultantLongTasks?: number[] }).__consultantLongTasks ?? []);
  expect(longTasks.filter((duration) => duration > 50)).toEqual([]);
  const layoutShift = await page.evaluate(() => ((window as typeof window & { __consultantLayoutShifts?: number[] }).__consultantLayoutShifts ?? []).reduce((sum, value) => sum + value, 0));
  expect(layoutShift).toBe(0);
  page.off("request", recordRequest);
  expect(animationRequests).toEqual([]);
  const overflow = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await dismissGlobalNotices(page);
  await expect(page.locator(".f-consultant-kinetic__canvas path").first()).toHaveCSS("animation-name", "none");
});

test("partial output replaces small talk and failure stops decorative waiting", async ({ page }) => {
  await page.goto("/consulting/e2e-harness?stage=previews&liveness=1&transition=preview-generation&transitionState=partial");
  await dismissGlobalNotices(page);
  const partial = page.locator(".f-consultant-transition");
  await expect(partial).toHaveAttribute("data-task-status", "partial");
  await expect(page.getByRole("heading", { name: "완성된 프리뷰 1개" })).toBeVisible();
  const partialRevealDelay = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return performance.now() - (navigation?.responseEnd ?? 0);
  });
  expect(partialRevealDelay).toBeLessThanOrEqual(300);
  await expect(page.locator(".f-consultant-activity__heading [data-task-status=partial]")).toHaveText("일부 완료 · 생성 계속 중");
  await expect(page.locator(".f-consultant-activity__smalltalk")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "결과에 영향을 주지 않는 대기 인터랙션" })).toHaveCount(0);

  await page.goto("/consulting/e2e-harness?stage=scan&liveness=1&transition=analysis&transitionState=failed");
  await dismissGlobalNotices(page);
  await expect(page.locator(".f-consultant-transition")).toHaveAttribute("data-task-status", "failed");
  await expect(page.locator(".f-consultant-activity__recovery")).toContainText("이미 저장된 사진과 완료 결과는 유지됩니다.");
  await expect(page.locator(".f-consultant-activity__smalltalk")).toHaveCount(0);
  await expect(page.locator(".f-consultant-kinetic__motion")).toHaveCount(0);
});

test("running task resumes after refresh without repeating its visible consultant note", async ({ page }) => {
  const url = "/consulting/e2e-harness?stage=scan&liveness=1&transition=analysis&transitionState=running";
  await page.goto(url);
  await dismissGlobalNotices(page);
  const note = page.locator(".f-consultant-activity__smalltalk > p").last();
  const before = await note.textContent();
  await page.reload();
  await dismissGlobalNotices(page);
  await expect(page.locator(".f-consultant-transition")).toBeVisible();
  await expect(note).not.toHaveText(before ?? "");
});

test("polling failure is not presented as normal waiting and keeps recovery in place", async ({ page }) => {
  await page.route("**/api/consultations/**", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "네트워크 연결이 일시적으로 중단되었습니다." }),
  }));
  await page.goto("/consulting/e2e-harness?stage=scan&liveness=1&polling=1&transition=analysis&transitionState=running");
  await dismissGlobalNotices(page);
  await expect(page.locator(".f-consultant-activity__recovery")).toContainText("네트워크 연결이 일시적으로 중단되었습니다.");
  await expect(page.locator(".f-consultant-activity__smalltalk")).toHaveCount(0);
  await expect(page.locator(".f-consultant-kinetic__motion")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "실패한 작업 상태 다시 확인" })).toBeVisible();
});

test("completed readiness performs its completion moment and automatic handoff within budget", async ({ page }) => {
  const destination = page.waitForRequest((request) => /\/consulting\/[^/]+\/analysis(?:\?|$)/.test(request.url()));
  const startedAt = Date.now();
  await page.goto("/consulting/e2e-harness?stage=scan&liveness=1&transition=analysis&transitionState=complete");
  await dismissGlobalNotices(page);
  await expect(page.locator(".f-consultant-activity__completion")).toBeVisible();
  await destination;
  expect(Date.now() - startedAt).toBeLessThanOrEqual(1_500);
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

test("Analysis renders the persisted facial proportion matrix without inventing physical units", async ({ page }) => {
  await page.route("**/api/consultations/**/photo-assets", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ primaryUrl: FACE_PHOTO_FIXTURE }),
  }));
  await page.route("**/api/v2/consultations/**/evidence", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ evidence: LANDMARK_EVIDENCE }),
  }));
  await page.goto("/consulting/e2e-harness?stage=analysis");
  await dismissGlobalNotices(page);
  const matrix = page.locator('[data-analysis-proportion-matrix="ready"]');
  const blend = page.locator('[data-analysis-face-shape-blend="ready"]');
  const inputPane = page.getByRole("region", { name: "사용자 입력" });
  const outputPane = page.getByRole("region", { name: "AI 출력 및 시스템 데이터" });
  await expect(inputPane.locator('[data-photo-evidence-stage="true"]')).toBeVisible();
  await expect(outputPane.locator('[data-photo-evidence-stage="true"]')).toHaveCount(0);
  await expect(blend).toBeVisible();
  await expect(blend.getByRole("img")).toHaveAttribute("aria-label", /계란형 55%/);
  await expect(blend).toContainText("한국 성인 남성 기준");
  await expect(blend).toContainText("의학적 두상 진단이 아닙니다");
  await expect(matrix).toBeVisible();
  await expect(matrix.getByRole("heading", { name: "사진 좌표에서 계산한 비율 근거" })).toBeVisible();
  await expect(matrix.locator("[data-analysis-measurement-id]" )).toHaveCount(2);
  await expect(matrix.getByLabel(/얼굴 세로 길이 59%/)).toHaveAttribute("value", "0.59");
  await expect(matrix).toContainText("실제 cm가 아닙니다");
});

test("Fashion Scene sends one direction request and lets the server prepare and dispatch all nine slots", async ({ page }) => {
  const slots = ["daily-casual","daily-minimal","daily-athleisure","work-office","work-classic","work-smart","statement-street","statement-formal","statement-date"];
  const fashionDirection = { situation: "daily", genre: "casual", season: "all-season", fit: "regular", exposure: "balanced", budget: "20만 원 이내", avoidItems: [] };
  const sessionIds = slots.map((_, index) => `00000000-0000-4000-8000-${String(index + 31).padStart(12, "0")}`);
  let generatedCount = 0;
  let batchPrepared = false;
  let legacyRecommendationRequests = 0;

  page.on("request", (request) => {
    if (request.url().includes("/api/styling/recommend")) legacyRecommendationRequests += 1;
  });

  await page.route("**/api/style-profile", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ profile: { bodyPhotoPath: "private/body.webp" } }) }));
  await page.route("**/api/v2/consultations/**/fashion-batch", async (route) => {
    const batchPayload = { id: "00000000-0000-4000-8000-000000000099", state: generatedCount ? "generating" : "approved", requestedCount: 9, completedCount: generatedCount, failedCount: 0, quoteId: "batch", slotState: {}, errorCode: null, errorMessage: null, updatedAt: "2026-08-09T00:00:00.000Z" };
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(batchPrepared ? { batch: batchPayload, stylingSessionIds: sessionIds } : { batch: null, stylingSessionIds: [] }) });
    const body = route.request().postDataJSON() as { action?: string };
    if (!body.action) { batchPrepared = true; generatedCount = 9; }
    const state = generatedCount ? "generating" : "approved";
    return route.fulfill({ status: body.action ? 200 : 201, contentType: "application/json", body: JSON.stringify({
      batch: { ...batchPayload, state },
      stylingSessionIds: sessionIds,
    }) });
  });
  await page.route("**/api/v2/consultations/**/fashion-previews", (route) => {
    if (route.request().method() !== "GET") return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ previewSet: { directionSnapshot: fashionDirection } }) });
    const previews = generatedCount === 9 ? slots.map((slotId, index) => ({ stylingSessionId: sessionIds[index], selectionSnapshotId: "00000000-0000-4000-8000-000000000021", slotId, category: index < 3 ? "DAILY" : index < 6 ? "WORK" : "STATEMENT", genre: "casual", direction: fashionDirection, status: "completed", headline: `배치 룩 ${index + 1}`, summary: "배치 결과", palette: [], silhouette: "balanced", neckline: "balanced", items: [], shoppingKeywords: [], imageUrl: FACE_PHOTO_FIXTURE, errorMessage: null, createdAt: "2026-08-09T00:00:00.000Z", updatedAt: null })) : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ previews, previewSet: null }) });
  });

  await page.goto("/consulting/e2e-harness?stage=fashion");
  await dismissGlobalNotices(page);
  await expect(page.locator("[data-fashion-slot-id]")).toHaveCount(9);
  await page.getByRole("button", { name: "이 방향으로 9개 룩 준비" }).click();
  expect(batchPrepared).toBe(true);
  expect(legacyRecommendationRequests).toBe(0);
  await expect.poll(() => generatedCount).toBe(9);
  await expect(page.getByRole("button", { name: /견적 승인/ })).toHaveCount(0);
  await expect(page.getByRole("img", { name: "데일리 캐주얼 AI 패션 프리뷰" })).toBeVisible();
  expect(await page.getByText("장르 선택").count()).toBe(0);
});

test("Aftercare starts from actual service and renders server-generated care as AI output", async ({ page }) => {
  let generated = false;
  await page.route("**/api/v2/consultations/**/aftercare", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(generated ? {
      actualService: { services: ["커트", "펌"], serviceDate: "2026-08-10", designerNotes: "앞머리 길이 조정", confirmedAt: "2026-08-10T10:00:00.000Z" },
      program: {
        schemaVersion: "aftercare-program-v2",
        consultationId: "00000000-0000-4000-8000-000000000001",
        selectionSnapshotId: "00000000-0000-4000-8000-000000000021",
        actualServiceId: "00000000-0000-4000-8000-000000000071",
        version: 1,
        today: ["두피부터 중간 바람으로 말립니다.", "찬바람으로 끝선을 정리합니다."],
        checkpoints: ["D+3", "W+2", "W+6", "W+10"].map((offset) => ({ offset, action: `${offset} 모발 상태와 실루엣을 확인합니다.`, complete: false })),
        concerns: ["강한 열을 한곳에 오래 사용하지 않습니다."],
        satisfaction: null,
        createdAt: "2026-08-10T10:00:00.000Z",
      },
    } : { actualService: null, program: null }),
  }));

  await page.goto("/consulting/e2e-harness?stage=aftercare");
  await dismissGlobalNotices(page);
  await expect(page.getByRole("button", { name: "실제 시술 확정하고 관리 프로그램 자동 생성" })).toBeVisible();
  await expect(page.getByLabel("오늘 할 관리")).toHaveCount(0);

  generated = true;
  await page.reload();
  await dismissGlobalNotices(page);
  const aiOutput = page.getByLabel("AI 출력 및 시스템 데이터");
  await expect(aiOutput.getByText("AI care output")).toBeVisible();
  await expect(aiOutput.getByText("두피부터 중간 바람으로 말립니다.", { exact: true })).toBeVisible();
  await expect(aiOutput.getByText("W+10 모발 상태와 실루엣을 확인합니다.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "관리 프로그램 새 버전 저장" })).toBeVisible();
});

test("Salon Brief auto-loads the durable designer brief without a user save request", async ({ page }) => {
  let automaticBriefRequests = 0;
  await page.route("**/api/v2/consultations/**/salon-brief", (route) => {
    automaticBriefRequests += 1;
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ brief: {
      schemaVersion: "salon-brief-v2",
      consultationId: "00000000-0000-4000-8000-000000000011",
      selectionSnapshotId: "00000000-0000-4000-8000-000000000021",
      version: 1,
      audience: "designer",
      summary: "얼굴 균형과 확정 헤어를 연결한 자동 살롱 요약입니다.",
      cut: { direction: "쇄골 기장과 얼굴선 레이어를 유지합니다." },
      volumeTexture: { direction: "정수리 볼륨과 사이드 무게를 분리합니다." },
      color: null,
      styling: ["얼굴 바깥 방향으로 드라이합니다."],
      cautions: ["실제 모질과 손상도를 현장에서 다시 확인합니다."],
      createdAt: "2026-08-10T10:00:00.000Z",
    } }) });
  });
  await page.route("**/api/consultations/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "harness snapshot write omitted" }) });
  });

  await page.goto("/consulting/e2e-harness?stage=salon-brief");
  await dismissGlobalNotices(page);
  const aiOutput = page.getByLabel("AI 출력 및 시스템 데이터");
  await expect(aiOutput.getByText("얼굴 균형과 확정 헤어를 연결한 자동 살롱 요약입니다.")).toBeVisible();
  await expect(aiOutput.getByText("쇄골 기장과 얼굴선 레이어를 유지합니다.")).toBeVisible();
  expect(automaticBriefRequests).toBe(1);
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
