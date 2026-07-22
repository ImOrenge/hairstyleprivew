import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createGenerationOwnerReset,
  doesGenerationOwnerSnapshotMatch,
  getGenerationOwnerSnapshot,
  isGenerationOwnerCurrent,
  normalizeGenerationOwnerId,
} from "./generation-owner-state.ts";

test("an account transition clears every in-memory generation secret", () => {
  const accountAState = {
    originalImage: { name: "account-a-face.webp" },
    previewUrl: "blob:account-a-face",
    draftReceipt: { draftId: "account-a-draft" },
    generationQuote: { quoteId: "account-a-quote" },
    generationId: "account-a-generation",
    latestPredictionId: "account-a-prediction",
    latestOutputUrl: "https://private.example/account-a.webp",
    recommendationGrid: [{ id: "account-a-variant" }],
    selectedVariantId: "account-a-variant",
    isGenerating: true,
  };

  const accountBState = {
    ...accountAState,
    ...createGenerationOwnerReset("user_account_b", 2),
  };

  assert.equal(accountBState.originalImage, null);
  assert.equal(accountBState.previewUrl, null);
  assert.equal(accountBState.draftReceipt, null);
  assert.equal(accountBState.generationQuote, null);
  assert.equal(accountBState.generationId, null);
  assert.equal(accountBState.latestPredictionId, null);
  assert.equal(accountBState.latestOutputUrl, null);
  assert.deepEqual(accountBState.recommendationGrid, []);
  assert.equal(accountBState.selectedVariantId, null);
  assert.equal(accountBState.isGenerating, false);
  assert.equal(accountBState.generationOwnerId, "user_account_b");
  assert.equal(accountBState.imageHydrated, false);
});

test("stale async hydration cannot publish an earlier owner's image", () => {
  assert.equal(isGenerationOwnerCurrent("user_account_b", 2, "user_account_a", 1), false);
  assert.equal(isGenerationOwnerCurrent("user_account_b", 2, "user_account_b", 2), true);
});

test("a stale account A response cannot mutate account B after reset", () => {
  const accountA = {
    generationOwnerBound: true,
    generationOwnerId: "user_account_a",
    generationOwnerRevision: 1,
  };
  const accountARequest = getGenerationOwnerSnapshot(accountA);
  assert.ok(accountARequest);

  const accountBAfterSwitch = createGenerationOwnerReset("user_account_b", 2);
  assert.equal(
    doesGenerationOwnerSnapshotMatch(accountBAfterSwitch, accountARequest),
    false,
  );
});

test("an account A WebP conversion finishing after account B binds is rejected", () => {
  const conversionStartedForAccountA = {
    ownerId: "user_account_a",
    ownerRevision: 7,
  };
  const storeAfterAccountBSignedIn = createGenerationOwnerReset("user_account_b", 8);

  assert.equal(
    doesGenerationOwnerSnapshotMatch(
      storeAfterAccountBSignedIn,
      conversionStartedForAccountA,
    ),
    false,
  );
});

test("accepts Clerk-safe owner ids and rejects ambiguous cache namespaces", () => {
  assert.equal(normalizeGenerationOwnerId(" user_account_a "), "user_account_a");
  assert.equal(normalizeGenerationOwnerId(""), null);
  assert.equal(normalizeGenerationOwnerId("user/account-a"), null);
});

test("the root layout gates page content through the Clerk generation boundary", () => {
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const boundary = readFileSync(
    new URL("../components/providers/GenerationAuthBoundary.tsx", import.meta.url),
    "utf8",
  );

  assert.match(layout, /<GenerationAuthBoundary>\s*\{children\}\s*<\/GenerationAuthBoundary>/);
  assert.match(boundary, /useAuth\(\)/);
  assert.match(boundary, /bindGenerationOwner\(activeOwnerId\)/);
  assert.match(boundary, /generationOwnerId !== activeOwnerId/);
  assert.match(boundary, /activeOwnerId !== null && !imageHydrated/);

  const hook = readFileSync(new URL("../hooks/useGenerate.ts", import.meta.url), "utf8");
  assert.match(hook, /assertGenerationOwnerCurrent/);
  assert.match(hook, /isGenerationOwnerSnapshotCurrent/);

  const store = readFileSync(new URL("../store/useGenerationStore.ts", import.meta.url), "utf8");
  const workspaceController = readFileSync(
    new URL(
      "../components/workspace/useCustomerGenerationController.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const personalColor = readFileSync(
    new URL("../components/personal-color/PersonalColorDiagnosisPageClient.tsx", import.meta.url),
    "utf8",
  );
  assert.match(store, /setOriginalImage: \(file, ownerSnapshot\)/);
  assert.match(workspaceController, /setOriginalImage\(webpFile, ownerSnapshot\)/);
  assert.match(personalColor, /setOriginalImage\(file, ownerSnapshot!\)/);
});
