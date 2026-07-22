export type GooglePlayPurchaseIdentityError =
  | "purchase_account_mismatch"
  | "purchase_product_mismatch"
  | "purchase_identity_mismatch";

export function validateGooglePlayPurchaseToken(value: string) {
  const token = value.trim();
  return token.length > 0 && token.length <= 4096;
}
export function isExpectedGooglePlayPackage(actual: string | null, expected: string) {
  return actual === expected;
}

export function validateGooglePlayPurchaseIdentity(input: {
  intentUserId: string;
  expectedUserId?: string;
  intentProductKey: string;
  expectedProductKey: string;
  intentProductId: string;
  expectedProductId: string;
  intentAccountId: string;
  purchaseAccountId: string | null;
  intentProfileId: string;
  purchaseProfileId: string | null;
}): GooglePlayPurchaseIdentityError | null {
  if (input.expectedUserId && input.expectedUserId !== input.intentUserId) {
    return "purchase_account_mismatch";
  }
  if (
    input.intentProductId !== input.expectedProductId ||
    input.intentProductKey !== input.expectedProductKey
  ) {
    return "purchase_product_mismatch";
  }
  if (
    input.purchaseAccountId !== input.intentAccountId ||
    input.purchaseProfileId !== input.intentProfileId
  ) {
    return "purchase_identity_mismatch";
  }
  return null;
}
