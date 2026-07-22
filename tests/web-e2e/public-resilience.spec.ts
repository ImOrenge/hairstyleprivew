import { expect, test } from "@playwright/test";

const motionSelectors = [
  ".review-roll",
  '[class*="liveDot"]',
  '[class*="scanLine"]',
  '[class*="workflowStep"]',
  '[class*="gridCard"]',
] as const;

async function readMotionState(page: import("@playwright/test").Page) {
  return page.evaluate((selectors) => selectors.map((selector) => {
    const element = document.querySelector(selector);
    return {
      animationName: element ? getComputedStyle(element).animationName : null,
      selector,
    };
  }), motionSelectors);
}

test("homepage stops continuous motion when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/", { waitUntil: "load" });

  const animatedState = await readMotionState(page);
  expect(animatedState.every((item) => item.animationName && item.animationName !== "none")).toBe(true);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedState = await readMotionState(page);
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  expect(reducedState).toEqual(motionSelectors.map((selector) => ({ animationName: "none", selector })));
});

test("B2B inquiry preserves input and recovers after an offline submission", async ({ page }) => {
  await page.route("https://challenges.cloudflare.com/**", async (route) => {
    await route.fulfill({ body: "", contentType: "application/javascript", status: 200 });
  });
  await page.addInitScript(() => {
    type MockTurnstileOptions = {
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
    };
    type MockWindow = Window & {
      __hairfitTurnstileCallback?: (token: string) => void;
      __hairfitTurnstileExpiredCallback?: () => void;
      turnstile?: {
        remove: () => void;
        render: (container: HTMLElement, options: MockTurnstileOptions) => string;
        reset: () => void;
      };
    };
    const target = window as MockWindow;
    target.turnstile = {
      render: (_container, options) => {
        target.__hairfitTurnstileCallback = options.callback;
        target.__hairfitTurnstileExpiredCallback = options["expired-callback"];
        queueMicrotask(() => options.callback?.("e2e-initial-token"));
        return "e2e-turnstile";
      },
      reset: () => queueMicrotask(() => target.__hairfitTurnstileCallback?.("e2e-retry-token")),
      remove: () => undefined,
    };
  });

  await page.goto("/b2b/contact", { waitUntil: "load" });

  const automaticNotice = page.getByRole("dialog");
  if (await automaticNotice.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(automaticNotice).toBeHidden();
  }

  const form = page.locator("#b2b-lead-form");
  const companyName = form.getByLabel("살롱명 / 회사명");
  const contactName = form.getByLabel("담당자명");
  const email = form.getByLabel("이메일");
  const message = form.getByLabel("도입 목적과 문의 내용");
  const submit = form.getByRole("button", { name: "문의 보내기" });

  await companyName.fill("오프라인 테스트 살롱");
  await contactName.fill("테스트 담당자");
  await email.fill("offline@example.com");
  await message.fill("오프라인 이후 입력을 보존하고 다시 접수합니다.");
  await expect(submit).toBeEnabled();

  await page.evaluate(() => {
    (window as Window & { __hairfitTurnstileExpiredCallback?: () => void })
      .__hairfitTurnstileExpiredCallback?.();
  });
  await expect(form.getByRole("alert")).toHaveText("보안 확인 시간이 만료되었습니다. 다시 확인해 주세요.");
  await expect(submit).toBeDisabled();

  await page.evaluate(() => {
    (window as Window & { __hairfitTurnstileCallback?: (token: string) => void })
      .__hairfitTurnstileCallback?.("e2e-refreshed-token");
  });
  await expect(form.getByRole("alert")).toBeHidden();
  await expect(submit).toBeEnabled();

  let requestAttempt = 0;
  await page.route("**/api/b2b/lead", async (route) => {
    requestAttempt += 1;
    if (requestAttempt === 1) {
      await route.abort("internetdisconnected");
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ webhookDelivered: true }),
      status: 201,
    });
  });

  await submit.click();
  await expect(form.getByRole("alert")).toHaveText("네트워크 연결을 확인한 뒤 입력 내용을 유지한 채 다시 시도해 주세요.");
  await expect(companyName).toHaveValue("오프라인 테스트 살롱");
  await expect(contactName).toHaveValue("테스트 담당자");
  await expect(email).toHaveValue("offline@example.com");
  await expect(message).toHaveValue("오프라인 이후 입력을 보존하고 다시 접수합니다.");

  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(form.getByRole("status")).toHaveText("문의가 접수되었습니다. 확인 후 연락드리겠습니다.");
  await expect(companyName).toHaveValue("");
  expect(requestAttempt).toBe(2);
});
