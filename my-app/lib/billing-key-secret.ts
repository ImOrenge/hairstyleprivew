import "server-only";

const ENCRYPTION_VERSION = "v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function requireSecret() {
  const secret = process.env.BILLING_KEY_ENCRYPTION_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing BILLING_KEY_ENCRYPTION_SECRET");
  }
  return secret;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey() {
  const secretHash = await crypto.subtle.digest("SHA-256", encoder.encode(requireSecret()));
  return crypto.subtle.importKey("raw", secretHash, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function deriveHmacKey() {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(requireSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export function isBillingKeyEncryptionConfigured() {
  return Boolean(process.env.BILLING_KEY_ENCRYPTION_SECRET?.trim());
}

export async function encryptBillingKey(plainBillingKey: string) {
  const key = await deriveAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plainBillingKey),
  );

  return [
    ENCRYPTION_VERSION,
    bytesToBase64(iv),
    bytesToBase64(new Uint8Array(encrypted)),
  ].join(".");
}

export async function decryptBillingKey(encryptedBillingKey: string) {
  const [version, ivBase64, encryptedBase64] = encryptedBillingKey.split(".");
  if (version !== ENCRYPTION_VERSION || !ivBase64 || !encryptedBase64) {
    throw new Error("Unsupported encrypted billing key format");
  }

  const key = await deriveAesKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivBase64) },
    key,
    base64ToBytes(encryptedBase64),
  );

  return decoder.decode(decrypted);
}

export async function hashBillingKey(plainBillingKey: string) {
  const key = await deriveHmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(plainBillingKey));
  return `hmac-sha256:${bytesToBase64(new Uint8Array(signature))}`;
}

export function maskBillingKey(plainBillingKey: string) {
  return plainBillingKey.length <= 8
    ? `${plainBillingKey.slice(0, 2)}...`
    : `${plainBillingKey.slice(0, 6)}...${plainBillingKey.slice(-2)}`;
}
