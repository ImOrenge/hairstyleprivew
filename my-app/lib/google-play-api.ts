import "server-only";

import {
  GOOGLE_PLAY_PACKAGE_NAME,
  getGooglePlayProductById,
  type GooglePlayCatalogProduct,
} from "@hairfit/shared";
import { normalizeGooglePlayPurchase } from "./google-play-contract";

const API_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKEN_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
let cachedToken: { value: string; expiresAt: number } | null = null;

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function encodeJson(value: unknown) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function privateKeyBytes() {
  const pem = env("GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY").replaceAll("\\n", "\n");
  const content = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/gu, "");
  const binary = atob(content);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function serviceAccountAssertion() {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const payload = encodeJson({
    iss: env("GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL"),
    scope: TOKEN_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  });
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes(),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

async function accessToken(force = false) {
  if (!force && cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: await serviceAccountAssertion(),
    }),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof data.access_token !== "string") {
    throw new Error(`Google Play OAuth failed with HTTP ${response.status}`);
  }
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  cachedToken = { value: data.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return cachedToken.value;
}

async function googleRequest(path: string, init: RequestInit = {}, retry = true) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (response.status === 401 && retry) {
    await accessToken(true);
    return googleRequest(path, init, false);
  }
  const body = await response.text().catch(() => "");
  const data = body ? JSON.parse(body) as unknown : {};
  if (!response.ok) {
    throw new Error(`Google Play API failed with HTTP ${response.status}`);
  }
  return data;
}

function packageName() {
  return process.env.GOOGLE_PLAY_PACKAGE_NAME?.trim() || GOOGLE_PLAY_PACKAGE_NAME;
}

export function isGooglePlayApiConfigured() {
  return Boolean(
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL?.trim() &&
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY?.trim(),
  );
}

export async function getGooglePlayPurchase(product: GooglePlayCatalogProduct, purchaseToken: string) {
  const app = encodeURIComponent(packageName());
  const token = encodeURIComponent(purchaseToken);
  const path = product.productType === "subscription"
    ? `/applications/${app}/purchases/subscriptionsv2/tokens/${token}`
    : `/applications/${app}/purchases/products/${encodeURIComponent(product.productId)}/tokens/${token}`;
  const raw = await googleRequest(path);
  return normalizeGooglePlayPurchase(product, raw);
}

export async function getGooglePlaySubscriptionByToken(purchaseToken: string) {
  const path = `/applications/${encodeURIComponent(packageName())}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const raw = await googleRequest(path);
  const root = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
  const lineItem = Array.isArray(root.lineItems) && root.lineItems[0] && typeof root.lineItems[0] === "object"
    ? root.lineItems[0] as Record<string, unknown>
    : {};
  const product = getGooglePlayProductById(lineItem.productId);
  if (!product || product.productType !== "subscription") {
    throw new Error("Google Play subscription product is not allowlisted");
  }
  return { product, purchase: normalizeGooglePlayPurchase(product, raw) };
}

export async function acknowledgeGooglePlayPurchase(
  product: GooglePlayCatalogProduct,
  purchaseToken: string,
) {
  const app = encodeURIComponent(packageName());
  const productId = encodeURIComponent(product.productId);
  const token = encodeURIComponent(purchaseToken);
  const path = product.productType === "subscription"
    ? `/applications/${app}/purchases/subscriptions/${productId}/tokens/${token}:acknowledge`
    : `/applications/${app}/purchases/products/${productId}/tokens/${token}:acknowledge`;
  await googleRequest(path, { method: "POST", body: "{}" });
}

export async function consumeGooglePlayPurchase(productId: string, purchaseToken: string) {
  const path = `/applications/${encodeURIComponent(packageName())}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:consume`;
  await googleRequest(path, { method: "POST", body: "{}" });
}

export async function verifyGooglePubSubAuthorization(authorization: string | null) {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return false;
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
  if (!response.ok) return false;
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  return payload.aud === env("GOOGLE_PLAY_PUBSUB_AUDIENCE") &&
    payload.email === env("GOOGLE_PLAY_PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL") &&
    (payload.email_verified === "true" || payload.email_verified === true);
}
