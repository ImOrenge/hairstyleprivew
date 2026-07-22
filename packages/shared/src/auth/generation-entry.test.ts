import assert from "node:assert/strict";
import test from "node:test";
import {
  getGenerationAccountSetupPath,
  getGenerationContinuationPath,
  parseAccountSetupContinuation,
  resolveGenerationEntryDecision,
} from "./generation-entry.ts";

test("generation entry requires the member account fields before photo upload", () => {
  assert.deepEqual(
    resolveGenerationEntryDecision({
      accountSetupComplete: false,
      accountType: "member",
      styleTarget: null,
    }),
    {
      kind: "account-setup",
      path: "/mypage?tab=account&setup=1&continue=generation-upload",
    },
  );

  assert.deepEqual(
    resolveGenerationEntryDecision({
      accountSetupComplete: true,
      accountType: "member",
      styleTarget: "female",
    }),
    { kind: "allow" },
  );
});

test("generation entry fails closed for missing account type and inconsistent member metadata", () => {
  for (const input of [
    { accountSetupComplete: false, accountType: null, styleTarget: undefined },
    { accountSetupComplete: true, accountType: "member" as const, styleTarget: null },
  ]) {
    assert.equal(resolveGenerationEntryDecision(input).kind, "account-setup");
  }

  assert.deepEqual(
    resolveGenerationEntryDecision({
      accountSetupComplete: true,
      accountType: "member",
      styleTarget: undefined,
    }),
    { kind: "allow" },
  );
});

test("salon owners return to their role home while admins retain customer tooling", () => {
  assert.deepEqual(
    resolveGenerationEntryDecision({
      accountSetupComplete: true,
      accountType: "salon_owner",
      styleTarget: null,
    }),
    { kind: "role-home", path: "/salon/customers" },
  );
  assert.deepEqual(
    resolveGenerationEntryDecision({
      accountSetupComplete: true,
      accountType: "admin",
      styleTarget: null,
    }),
    { kind: "allow" },
  );
});

test("account setup continuation is an enum rather than an arbitrary redirect", () => {
  assert.equal(parseAccountSetupContinuation("generation-upload"), "generation-upload");
  assert.equal(parseAccountSetupContinuation(["generation-submit", "ignored"]), "generation-submit");
  assert.equal(parseAccountSetupContinuation("https://evil.example"), null);
  assert.equal(parseAccountSetupContinuation("/workspace"), null);

  assert.equal(
    getGenerationAccountSetupPath("generation-submit"),
    "/mypage?tab=account&setup=1&continue=generation-submit",
  );
  assert.equal(getGenerationContinuationPath("generation-upload", "web"), "/workspace");
  assert.equal(getGenerationContinuationPath("generation-upload", "native"), "/upload");
  assert.equal(getGenerationContinuationPath("generation-submit", "web"), "/workspace?nextStep=generate");
  assert.equal(getGenerationContinuationPath("generation-submit", "native"), "/generate");
});
