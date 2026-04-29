import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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
    const value = line.slice(equalIndex + 1).trim();
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

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function createWebhook(secret) {
  try {
    return new Webhook(secret);
  } catch {
    try {
      return new Webhook(secret, { format: "raw" });
    } catch (secondError) {
      const message = secondError instanceof Error ? secondError.message : String(secondError);
      console.error("Invalid PORTONE_V2_WEBHOOK_SECRET format.");
      console.error("Use the PortOne V2 webhook signing secret value.");
      console.error(`Details: ${message}`);
      process.exit(2);
    }
  }
}

const envPath = resolve(process.cwd(), ".env.local");
loadEnvFile(envPath);

const webhookSecret = process.env.PORTONE_V2_WEBHOOK_SECRET?.trim();
if (!webhookSecret) {
  console.error("Missing PORTONE_V2_WEBHOOK_SECRET. Add it to .env.local or env vars.");
  process.exit(1);
}

const positional = getPositionalArgs();
const endpoint = getArg(
  "url",
  positional.find((arg) => arg.startsWith("http://") || arg.startsWith("https://")) ||
    "http://localhost:3000/api/payments/webhook",
);
const paymentId = getArg("paymentId", positional[0] || randomId("payment"));
const storeId = getArg("storeId", "store_test");
const transactionId = getArg("transactionId", randomId("tx"));
const type = getArg("type", "Transaction.Paid");

const event = {
  type,
  timestamp: new Date().toISOString(),
  data: {
    paymentId,
    storeId,
    transactionId,
  },
};

const payload = JSON.stringify(event);
const webhookId = randomId("msg");
const timestamp = new Date();
const signature = createWebhook(webhookSecret).sign(webhookId, timestamp, payload);

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
console.log(`[portone:webhook:test] paymentId=${paymentId}`);
console.log(`[portone:webhook:test] response=${body}`);
