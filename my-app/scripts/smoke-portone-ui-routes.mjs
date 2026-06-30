import assert from "node:assert/strict";

function getArg(name, fallback) {
  const prefixed = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefixed));
  if (direct) return direct.slice(prefixed.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }

  return fallback;
}

function showHelp() {
  console.log(`Smoke-test PortOne billing UI routes against a running Next server.

Usage:
  npm run portone:ui:smoke -- --baseUrl=http://localhost:3010

Checks:
  /billing renders the self-serve Basic/Standard/Pro pricing page.
  /billing/checkout?plan=basic renders the PortOne payment method and buyer information form.
  /mypage?tab=plan redirects unauthenticated users to login while preserving tab=plan.
  /api/payments/billing-key/prepare returns 401 for unauthenticated subscription attempts.
`);
}

function urlFor(baseUrl, path) {
  return new URL(path, baseUrl).toString();
}

async function fetchOrExplain(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not reach ${url}. Start Next first, e.g. npm --prefix my-app run dev -- --port 3010. ${message}`);
  }
}

function assertBodyIncludes(body, expected, label) {
  assert.ok(body.includes(expected), `${label}: expected HTML to include ${JSON.stringify(expected)}`);
}

async function checkBillingPage(baseUrl) {
  const response = await fetchOrExplain(urlFor(baseUrl, "/billing"));
  assert.equal(response.status, 200, "/billing should return 200");

  const body = await response.text();
  for (const expected of [
    "플랜 결제",
    "Basic",
    "Standard",
    "Pro",
    "₩9,900",
    "₩19,900",
    "₩49,900",
    "Basic 시작",
    "Standard 시작",
    "Pro 시작",
    "매월 자동 결제",
  ]) {
    assertBodyIncludes(body, expected, "/billing");
  }

  assert.ok(!body.includes("NaN"), "/billing should not render NaN");
  assert.ok(!body.includes(">undefined<"), "/billing should not render undefined text nodes");
}

async function checkBillingCheckoutPage(baseUrl) {
  const response = await fetchOrExplain(urlFor(baseUrl, "/billing/checkout?plan=basic"));
  assert.equal(response.status, 200, "/billing/checkout?plan=basic should return 200");

  const body = await response.text();
  for (const expected of [
    "결제수단 선택",
    "카드 정기결제",
    "구매자 정보",
    "구매자 이름",
    "이메일",
    "결제창 열기",
    "Basic",
    "₩9,900",
  ]) {
    assertBodyIncludes(body, expected, "/billing/checkout?plan=basic");
  }

  assert.ok(!body.includes("NaN"), "/billing/checkout should not render NaN");
  assert.ok(!body.includes(">undefined<"), "/billing/checkout should not render undefined text nodes");
}

async function checkMyPagePlanRedirect(baseUrl) {
  const response = await fetchOrExplain(urlFor(baseUrl, "/mypage?tab=plan"), {
    redirect: "manual",
  });
  assert.ok(
    response.status === 307 || response.status === 308,
    `/mypage?tab=plan should redirect unauthenticated users, got ${response.status}`,
  );

  const location = response.headers.get("location");
  assert.ok(location, "/mypage?tab=plan redirect should include location header");
  const redirectUrl = new URL(location, baseUrl);
  assert.equal(redirectUrl.pathname, "/login", "/mypage?tab=plan should redirect to login");
  assert.equal(
    redirectUrl.searchParams.get("redirect_url"),
    "/mypage?tab=plan",
    "login redirect should preserve the plan tab return path",
  );
}

async function checkPrepareRequiresAuth(baseUrl) {
  const response = await fetchOrExplain(urlFor(baseUrl, "/api/payments/billing-key/prepare"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan: "basic" }),
  });
  assert.equal(response.status, 401, "billing-key prepare should require auth");
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    return;
  }

  const baseUrl = getArg("baseUrl", "http://localhost:3010").replace(/\/+$/, "");

  await checkBillingPage(baseUrl);
  await checkBillingCheckoutPage(baseUrl);
  await checkMyPagePlanRedirect(baseUrl);
  await checkPrepareRequiresAuth(baseUrl);

  console.log(`[portone:ui:smoke] UI route smoke passed baseUrl=${baseUrl}`);
}

main().catch((error) => {
  console.error("[portone:ui:smoke] failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
