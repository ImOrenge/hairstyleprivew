import "server-only";

const VERSION = "v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function requireSecret() {
  const secret = process.env.GOOGLE_PLAY_TOKEN_ENCRYPTION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("GOOGLE_PLAY_TOKEN_ENCRYPTION_SECRET must contain at least 32 characters");
  }
  return secret;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function aesKey() {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(requireSecret()));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function hmacKey() {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(requireSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export function isGooglePlayTokenEncryptionConfigured() {
  return (process.env.GOOGLE_PLAY_TOKEN_ENCRYPTION_SECRET?.trim().length ?? 0) >= 32;
}

export async function encryptGooglePlayPurchaseToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await aesKey(),
    encoder.encode(token),
  );
  return `${VERSION}.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptGooglePlayPurchaseToken(value: string) {
  const [version, iv, payload] = value.split(".");
  if (version !== VERSION || !iv || !payload) {
    throw new Error("Unsupported Google Play purchase token format");
  }
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(iv) },
    await aesKey(),
    base64ToBytes(payload),
  );
  return decoder.decode(decrypted);
}

export async function hashGooglePlayPurchaseToken(token: string) {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(token));
  return `hmac-sha256:${bytesToBase64(new Uint8Array(signature))}`;
}

export async function obfuscateGooglePlayAccountId(userId: string) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    encoder.encode(`account:${userId}`),
  );
  return bytesToBase64(new Uint8Array(signature))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}
