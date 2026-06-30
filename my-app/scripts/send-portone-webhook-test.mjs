import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Webhook } from "standardwebhooks";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalIndex = line.indexOf("=");
    if (equalIndex < 1) {
      continue;
    }

    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function getArg(name, fallback) {
  const prefixed = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefixed));
  if (!direct) {
    const index = process.argv.findIndex((arg) => arg === `--${name}`);
    if (index >= 0) {
      const next = process.argv[index + 1];
      if (next && !next.startsWith("--")) {
        return next;
      }
    }
    return fallback;
  }
  return direct.slice(prefixed.length);
}

function getPositionalArgs() {
  return process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function showHelp() {
  console.log(`Send a signed PortOne webhook smoke payload.

Usage:
  npm run portone:webhook:test -- --url http://localhost:3010/api/payments/webhook --type Transaction.Ready --paymentId <payment-id>
  npm run portone:webhook:test -- --deployProbe --url https://<your-domain>/api/payments/webhook
  npm run portone:webhook:test -- --deployProbe

Options:
  --url <url>                  Target webhook URL. Defaults to localhost, or public app URL in --deployProbe mode.
  --deployProbe                Probe a deployed public HTTPS webhook route with a signed non-mutating Transaction.Ready event.
  --type <event-type>          Event type. Defaults to Transaction.Paid, or Transaction.Ready in --deployProbe mode.
  --paymentId <payment-id>     Payment ID. Defaults to a random id.
  --billingKey <billing-key>   Optional billing key for BillingKey.Deleted events.
  --storeId <store-id>         Store ID in the smoke payload.
  --transactionId <tx-id>      Transaction ID in the smoke payload.
  --amount <amount>            Optional amount total in the payload.
  --currency <currency>        Optional amount currency. Defaults to KRW.
  --expectStatus <status>      Fail when the response status differs.
  --expectBodyIncludes <text>  Fail when the response body does not include text.

Deploy probe defaults:
  type=Transaction.Ready
  expectStatus=202
  expectBodyIncludes="payment transaction not found"
`);
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function readEnv(name) {
  return process.env[name]?.trim() || "";
}

function readPublicAppUrl() {
  return (
    readEnv("NEXT_PUBLIC_SITE_URL") ||
    readEnv("NEXT_PUBLIC_APP_URL") ||
    readEnv("APP_URL") ||
    readEnv("SITE_URL")
  );
}

function isPublicHttpsWebhookUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  const isLocalhost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local");

  return (
    url.protocol === "https:" &&
    !isLocalhost &&
    url.pathname === "/api/payments/webhook"
  );
}

function createWebhook(secret) {
  const payload = JSON.stringify({ type: "Smoke.RoundTrip", data: {} });
  const id = "msg_roundtrip";
  const date = new Date();
  const headers = {
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(date.getTime() / 1000)),
  };

  for (const candidate of [
    { label: "default", options: undefined },
    { label: "raw", options: { format: "raw" } },
  ]) {
    try {
      const webhook = candidate.options ? new Webhook(secret, candidate.options) : new Webhook(secret);
      const signature = webhook.sign(id, date, payload);
      webhook.verify(payload, { ...headers, "webhook-signature": signature });
      return { webhook, label: candidate.label };
    } catch {
      // Try the next supported secret format.
    }
  }

  console.error("Invalid PORTONE_V2_WEBHOOK_SECRET format.");
  console.error("Use the PortOne V2 webhook signing secret value.");
  process.exit(2);
}

function loadLocalEnv() {
  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = resolve(appDir, "..");
  for (const path of [
    resolve(repoRoot, ".env.local"),
    resolve(repoRoot, ".env"),
    resolve(appDir, ".env.local"),
    resolve(appDir, ".env"),
  ]) {
    loadEnvFile(path);
  }
}

loadLocalEnv();

if (hasFlag("help") || hasFlag("h")) {
  showHelp();
  process.exit(0);
}

const webhookSecret = process.env.PORTONE_V2_WEBHOOK_SECRET?.trim();
if (!webhookSecret) {
  console.error("Missing PORTONE_V2_WEBHOOK_SECRET. Add it to .env.local or env vars.");
  process.exit(1);
}

const positional = getPositionalArgs();
const deployProbe = hasFlag("deployProbe");
const explicitEndpoint =
  getArg(
    "url",
    positional.find((arg) => arg.startsWith("http://") || arg.startsWith("https://")) || "",
  ) || "";
const publicAppUrl = readPublicAppUrl();
const endpoint = getArg(
  "url",
  explicitEndpoint ||
    (deployProbe && publicAppUrl
      ? new URL("/api/payments/webhook", publicAppUrl).toString()
      : "http://localhost:3000/api/payments/webhook"),
);
const positionalPaymentId = positional.find((arg) => !arg.startsWith("http://") && !arg.startsWith("https://"));
const paymentId = getArg(
  "paymentId",
  positionalPaymentId || randomId(deployProbe ? "deploy_webhook_probe" : "payment"),
);
const billingKey = getArg("billingKey", "");
const storeId = getArg(
  "storeId",
  readEnv("NEXT_PUBLIC_PORTONE_V2_STORE_ID") || readEnv("PORTONE_V2_STORE_ID") || "store_test",
);
const transactionId = getArg("transactionId", randomId("tx"));
const type = getArg("type", deployProbe ? "Transaction.Ready" : "Transaction.Paid");
const amount = Number(getArg("amount", "0"));
const currency = getArg("currency", "KRW");
const expectedStatusRaw = getArg("expectStatus", deployProbe ? "202" : "");
const expectedStatus = expectedStatusRaw ? Number(expectedStatusRaw) : null;
const expectedBodyIncludes = getArg(
  "expectBodyIncludes",
  deployProbe ? "payment transaction not found" : "",
);

if (deployProbe && !isPublicHttpsWebhookUrl(endpoint)) {
  console.error(
    "[portone:webhook:test] --deployProbe requires a public HTTPS URL ending with /api/payments/webhook",
  );
  console.error(
    "[portone:webhook:test] pass --url=https://<your-domain>/api/payments/webhook or set NEXT_PUBLIC_SITE_URL",
  );
  process.exit(2);
}

if (expectedStatusRaw && !Number.isInteger(expectedStatus)) {
  console.error(`[portone:webhook:test] invalid --expectStatus: ${expectedStatusRaw}`);
  process.exit(2);
}

const event = {
  type,
  timestamp: new Date().toISOString(),
  data: {
    paymentId,
    storeId,
    transactionId,
    ...(billingKey ? { billingKey } : {}),
    ...(Number.isFinite(amount) && amount > 0
      ? { amount: { total: amount, currency } }
      : {}),
  },
};

const payload = JSON.stringify(event);
const webhookId = randomId("msg");
const timestamp = new Date();
const signer = createWebhook(webhookSecret);
const signature = signer.webhook.sign(webhookId, timestamp, payload);

let response;
try {
  response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": webhookId,
      "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "webhook-signature": signature,
    },
    body: payload,
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[portone:webhook:test] request failed: ${message}`);
  process.exit(3);
}

const body = await response.text();
console.log(`[portone:webhook:test] status=${response.status}`);
console.log(`[portone:webhook:test] endpoint=${endpoint}`);
console.log(`[portone:webhook:test] type=${type}`);
console.log(`[portone:webhook:test] secretFormat=${signer.label}`);
console.log(`[portone:webhook:test] paymentId=${paymentId}`);
console.log(`[portone:webhook:test] response=${body}`);

if (expectedStatus !== null && response.status !== expectedStatus) {
  console.error(
    `[portone:webhook:test] expected status ${expectedStatus}, received ${response.status}`,
  );
  process.exit(4);
}

if (expectedBodyIncludes && !body.includes(expectedBodyIncludes)) {
  console.error(
    `[portone:webhook:test] expected response body to include: ${expectedBodyIncludes}`,
  );
  process.exit(5);
}
