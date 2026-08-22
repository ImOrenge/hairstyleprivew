import { expect, test } from "@playwright/test";

test("makeup opens a standalone resumable interview before recommendation", async ({ page }) => {
  await page.goto("/e2e-harness/makeup-interview");
  await expect(page.getByRole("region", { name: "메이크업 방향 인터뷰" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "메이크업 방향 인터뷰 목록" }).getByRole("listitem")).toHaveCount(7);
  await expect(page.getByRole("radio")).toHaveCount(6);
  await page.getByRole("radio", { name: "풀 메이크업" }).check();
  await expect(page.getByText(/저장됨/)).toBeVisible();
  await expect(page.getByRole("button", { name: /대표 모드/ }).locator(".f-consulting-interview__topic-marker")).toHaveText("✓");
  await expect(page.getByRole("heading", { name: "주 사용 상황과 보조 상황을 정해주세요" })).toBeVisible();
  const overflow = await page.locator(".f-consulting-interview").evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const responsiveOverflow = await page.locator(".f-consulting-interview").evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    expect(responsiveOverflow.scrollWidth).toBeLessThanOrEqual(responsiveOverflow.clientWidth + 1);
  }
});

test("makeup keeps the latest rapid selection while autosaves are serialized", async ({ page }) => {
  await page.goto("/e2e-harness/makeup-interview?saveDelay=1");
  const fixture = page.getByTestId("makeup-interview-fixture");

  await page.getByRole("radio", { name: "풀 메이크업" }).check();
  await page.waitForTimeout(250);
  await page.getByRole("radio", { name: "패션 에디토리얼" }).check();
  await page.waitForTimeout(450);

  await expect(page.getByRole("radio", { name: "패션 에디토리얼" })).toBeChecked();
  await expect(page.getByText("답변 저장 중")).toBeVisible();
  await expect(page.getByText(/저장됨/)).toBeVisible();
  await expect(fixture).toHaveAttribute("data-saved-mode", "fashion_editorial");
  await expect(fixture).toHaveAttribute("data-save-count", "2");
  await expect(page.getByText(/오프라인|다른 화면의 변경/)).toHaveCount(0);
});

test("makeup stays inside the consultation journey with stage selection and a recommended handoff", async ({ page }) => {
  await page.goto("/consulting/e2e-harness?stage=makeup");

  const navigation = page.getByRole("navigation", { name: "상담 단계 이동" });
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: "Chapters" }).click();

  const stageMap = page.getByRole("dialog", { name: "4 CHAPTERS" });
  await expect(stageMap.getByRole("link", { name: /STYLE DESIGN/ })).toHaveAttribute("aria-current", "step");
  await expect(stageMap.getByText("FINAL REPORT", { exact: true })).toBeVisible();
  await stageMap.getByRole("button", { name: "전체 단계 닫기" }).click();

  const recommended = navigation.getByRole("link", { name: "AI 추천 작업: 패션 방향 정하기" });
  await expect(recommended).toBeVisible();
  await recommended.click();
  await expect(page).toHaveURL(/\/consulting\/e2e-harness\?stage=fashion$/);
});

test("makeup direction presents separated color callouts, local eye guides, and rich technical output", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto("/consulting/e2e-harness?stage=makeup");
  const fixture = page.getByTestId("makeup-direction-fixture");
  await expect(fixture).toBeVisible();
  await expect(fixture.locator("[data-makeup-dense-atlas]")).toBeAttached();
  const colorInfo = fixture.locator("[data-makeup-color-info]");
  await expect(colorInfo).toHaveCount(0);
  await expect(fixture.locator("table")).toHaveCount(0);
  const browCallout = fixture.getByRole("button", { name: "눈썹 색상 정보", exact: true });
  await browCallout.hover();
  await expect(colorInfo).toBeVisible();
  await page.mouse.move(1, 1);
  await expect(colorInfo).toHaveCount(0);
  await browCallout.click();
  await page.getByRole("button", { name: "Chapters" }).focus();
  await expect(colorInfo).toBeVisible();
  const [desktopStageBox, desktopInfoBox] = await Promise.all([
    fixture.locator(".makeup-direction-map__stage").boundingBox(),
    colorInfo.boundingBox(),
  ]);
  expect(desktopStageBox).not.toBeNull();
  expect(desktopInfoBox).not.toBeNull();
  expect(desktopInfoBox!.y).toBeGreaterThanOrEqual(desktopStageBox!.y);
  expect(desktopInfoBox!.y + desktopInfoBox!.height).toBeLessThanOrEqual(desktopStageBox!.y + desktopStageBox!.height + 1);
  await expect(fixture.locator("[data-makeup-semantic-zone], [data-makeup-application-line], [data-makeup-zone-trace]")).toHaveCount(0);
  await fixture.getByRole("button", { name: "블러셔 색상 정보" }).click();
  await expect(fixture.getByRole("button", { name: "블러셔 색상 정보" })).toHaveAttribute("aria-pressed", "true");
  await expect(fixture.locator("svg")).toHaveAttribute("viewBox", "0 0 1000 1250");
  await expect(fixture.locator("[data-makeup-topology-version='makeup-dense-atlas-v3']")).toBeVisible();
  await expect(fixture.locator("[data-makeup-connector-geometry-source='precision-atlas-v3']").first()).toBeVisible();
  await expect(fixture.locator("svg")).toHaveAttribute("data-makeup-render-mode", "callout-infographic");
  const topologyPointCount = Number(await fixture.locator("[data-makeup-topology-point-count]").getAttribute("data-makeup-topology-point-count"));
  expect(topologyPointCount).toBeGreaterThanOrEqual(200);
  await expect(fixture.locator("svg")).toHaveAttribute("data-display-mode", "application");
  await expect(fixture.locator("[data-makeup-atlas-line]")).toHaveCount(0);
  await expect(fixture.locator("[data-makeup-application-guide], [data-makeup-semantic-zone], [data-makeup-guide-arrow], [data-makeup-zone-landmark-line], [data-makeup-zone-landmark-tick]")).toHaveCount(0);
  await expect(fixture.locator("[data-makeup-eye-feature-guide^='eyeliner-']")).toHaveCount(2);
  await expect(fixture.locator("[data-makeup-eye-feature-guide^='lashes-']")).toHaveCount(10);
  await expect(fixture.locator("svg path")).toHaveCount(11);
  expect(Number(await fixture.locator("[data-makeup-dense-atlas]").getAttribute("data-suppressed-duplicate-segment-count"))).toBeGreaterThanOrEqual(0);
  await expect(fixture.locator("svg circle, svg ellipse, svg polygon, svg marker")).toHaveCount(0);
  expect(await fixture.locator("svg path").evaluateAll((paths) => paths.filter((path) => /[zZ]\s*$/.test(path.getAttribute("d") ?? "")).length)).toBe(0);
  const colorCallouts = fixture.locator("[data-makeup-color-callout]");
  await expect(colorCallouts).toHaveCount(9);
  await expect(fixture.locator("[data-makeup-color-callout='eyeshadow']")).toBeVisible();
  await expect(fixture.locator("[data-makeup-color-callout='eyeliner']")).toBeVisible();
  await expect(fixture.locator("[data-makeup-color-callout='lashes']")).toBeVisible();
  await expect(fixture.locator("[data-makeup-callout-connector]")).toHaveCount(9);
  await expect(fixture.locator("[data-makeup-callout-anchor-source='precision-atlas-v3']")).toHaveCount(9);
  const calloutIds = await colorCallouts.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-makeup-color-callout")));
  expect(new Set(calloutIds).size).toBe(9);
  const calloutBoxes = await colorCallouts.evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  }));
  for (let left = 0; left < calloutBoxes.length; left += 1) {
    for (let right = left + 1; right < calloutBoxes.length; right += 1) {
      const a = calloutBoxes[left]; const b = calloutBoxes[right];
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
    }
  }
  await expect(fixture.locator("[data-complexion-guide-source]")).toHaveAttribute("data-complexion-guide-source", "server");
  const noseCallout = fixture.locator("[data-makeup-color-callout='nose_contour']");
  await noseCallout.click();
  await expect(fixture.locator("[data-makeup-visible-callout]")).toHaveAttribute("data-makeup-visible-callout", "nose_contour");
  await expect(fixture.locator("[data-makeup-callout-connector='nose_contour']")).toBeVisible();
  await expect(noseCallout).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "docs/hairfit-v2/evidence/p06-makeup-zone-direction-desktop.png", fullPage: true });
  await expect(fixture.getByText("AI 메이크업 디렉터 리포트", { exact: true })).toBeVisible();
  await expect(fixture.getByText("셀프 메이크업 적용 순서", { exact: true })).toBeVisible();
  await expect(fixture.getByText("메이크업 아티스트용 상세 명세", { exact: true })).toBeVisible();
  await expect(fixture.getByText("브랜드와 관계없이 활용할 검색어", { exact: true })).toBeVisible();
  await expect(fixture.getByText("아티스트에게 리포트 전달", { exact: true })).toBeVisible();
  await expect(fixture.getByRole("checkbox")).not.toBeChecked();
  await page.screenshot({ path: "docs/hairfit-v2/evidence/p07-makeup-routine-brief-share-desktop.png", fullPage: true });
  expect(consoleErrors).toEqual([]);
});

test("diagnostic fixture keeps structure and precision modes out of the customer default", async ({ page }) => {
  await page.goto("/consulting/e2e-harness?stage=makeup&diagnostics=1");
  const fixture = page.getByTestId("makeup-direction-fixture");
  await expect(fixture.locator("[data-makeup-semantic-fixture-state='running']")).toBeVisible();
  await expect(fixture.locator("[data-makeup-semantic-fixture-state='completed']")).toBeVisible();
  await expect(fixture.locator("[data-makeup-color-info]")).toBeVisible();
  await expect(fixture.locator("table caption")).toContainText("색, 위치, 방향, 강도, 질감");
  await fixture.locator("[data-makeup-atlas-mode='precision']").click();
  await expect(fixture.locator("[data-makeup-atlas-line]")).toHaveCount(46);
  expect(await fixture.locator("[data-makeup-atlas-tick]").count()).toBeGreaterThanOrEqual(300);
  const interactionMs = await fixture.evaluate(async (root) => {
    const started = performance.now();
    (root.querySelector("[data-makeup-atlas-mode='structure']") as HTMLButtonElement).click();
    await new Promise(requestAnimationFrame);
    return performance.now() - started;
  });
  expect(interactionMs).toBeLessThanOrEqual(50);
  await expect(fixture.locator("[data-makeup-atlas-line]")).toHaveCount(14);
  await expect(fixture.locator("[data-makeup-atlas-tick]")).toHaveCount(0);
  await fixture.locator("[data-makeup-atlas-mode='application']").click();
  await expect(fixture.locator("[data-makeup-atlas-line], [data-makeup-semantic-zone]")).toHaveCount(0);
  await expect(fixture.locator("[data-makeup-eye-feature-guide^='eyeliner-']")).toHaveCount(2);
});

test("makeup callouts remain distinct and operable at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/consulting/e2e-harness?stage=makeup");
  const fixture = page.getByTestId("makeup-direction-fixture");
  await expect(fixture.getByText("7 module toolbar", { exact: true })).toHaveCount(0);
  await expect(fixture.getByText("Active zone detail", { exact: true })).toHaveCount(0);
  await fixture.getByRole("button", { name: "아이라인 색상 정보" }).click();
  await expect(fixture.getByRole("button", { name: "아이라인 색상 정보" })).toHaveAttribute("aria-pressed", "true");
  const mobileInfo = fixture.locator("[data-makeup-color-info]");
  await expect(mobileInfo).toBeVisible();
  const [mobileStageBox, mobileInfoBox] = await Promise.all([
    fixture.locator(".makeup-direction-map__stage").boundingBox(),
    mobileInfo.boundingBox(),
  ]);
  expect(mobileStageBox).not.toBeNull();
  expect(mobileInfoBox).not.toBeNull();
  expect(mobileInfoBox!.y).toBeGreaterThanOrEqual(mobileStageBox!.y + mobileStageBox!.height);
  await fixture.getByRole("button", { name: "속눈썹 색상 정보" }).click();
  await expect(fixture.getByRole("button", { name: "속눈썹 색상 정보" })).toHaveAttribute("aria-pressed", "true");
  const jawCallout = fixture.locator("[data-makeup-color-callout='jaw_shadow']");
  await jawCallout.focus();
  await jawCallout.click();
  await expect(fixture.locator("[data-makeup-visible-callout]")).toHaveAttribute("data-makeup-visible-callout", "jaw_shadow");
});

test("professional makeup report keeps fallback visible, replaces it asynchronously, and recovers by keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/consulting/e2e-harness?stage=makeup&reportState=preparing");
  const fixture = page.getByTestId("makeup-direction-fixture");
  const report = fixture.locator("[data-makeup-professional-report]");
  await expect(report).toHaveAttribute("data-makeup-professional-report", "preparing");
  await expect(report.getByRole("heading", { name: "확정한 분위기를 실제 메이크업으로 연결했어요" })).toBeVisible();
  await expect(report).toHaveAttribute("data-makeup-professional-report", "ready");
  await expect(report.getByRole("heading", { name: "딥 웜 컬러와 헤어 흐름을 잇는 내추럴 메이크업" })).toBeVisible();
  const overflow = await fixture.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  const specification = fixture.getByText("메이크업 아티스트용 상세 명세", { exact: true });
  await specification.focus();
  await page.keyboard.press("Enter");
  await expect(specification.locator("xpath=..")).toHaveAttribute("open", "");
  await page.emulateMedia({ media: "print" });
  await expect(report).toBeVisible();

  await page.goto("/consulting/e2e-harness?stage=makeup&reportState=failed");
  const retry = page.getByRole("button", { name: "해설 다시 준비하기" });
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-makeup-professional-report]")).toHaveAttribute("data-makeup-professional-report", "preparing");
  await expect(page.locator("[data-makeup-professional-report]")).toHaveAttribute("data-makeup-professional-report", "ready");
});
