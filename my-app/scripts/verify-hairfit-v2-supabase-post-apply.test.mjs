import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  POST_APPLY_CONFIRMATION,
  POST_APPLY_TABLES,
  projectFingerprintFromUrl,
  validatePostApplyRequest,
} from "./verify-hairfit-v2-supabase-post-apply.mjs";
import { EXPECTED_LINKED_PROJECT_FINGERPRINT } from "./apply-hairfit-v2-supabase-migrations.mjs";

test("post-apply verification covers every Personal Color and Makeup internal table", () => {
  for (const table of [
    "personal_color_capture_assets", "face_observation_bundles", "personal_color_profiles_v2",
    "personal_color_drape_sessions", "makeup_direction_snapshots", "makeup_routines",
    "makeup_artist_briefs", "makeup_brief_shares", "personal_color_training_consent_events",
  ]) assert.equal(POST_APPLY_TABLES.includes(table), true, table);
  assert.equal(new Set(POST_APPLY_TABLES).size, POST_APPLY_TABLES.length);
});

test("Supabase URL is reduced to a project fingerprint and rejects other hosts", () => {
  assert.equal(projectFingerprintFromUrl("https://fixture-project-ref.supabase.co"), "99a81a85eacb");
  assert.throws(() => projectFingerprintFromUrl("https://example.com"), /approved Supabase/u);
  assert.throws(() => projectFingerprintFromUrl("http://fixture-project-ref.supabase.co"), /HTTPS/u);
});

test("remote post-apply verification requires exact target and confirmation", () => {
  assert.throws(() => validatePostApplyRequest({
    run: true,
    confirmation: POST_APPLY_CONFIRMATION,
    projectFingerprint: "unexpected",
  }), /unexpected Supabase/u);
  assert.throws(() => validatePostApplyRequest({
    run: true,
    confirmation: "yes",
    projectFingerprint: EXPECTED_LINKED_PROJECT_FINGERPRINT,
  }), /requires/u);
  assert.doesNotThrow(() => validatePostApplyRequest({
    run: true,
    confirmation: POST_APPLY_CONFIRMATION,
    projectFingerprint: EXPECTED_LINKED_PROJECT_FINGERPRINT,
  }));
});

test("anon denial uses a zero-row GET so PostgreSQL 42501 remains observable", () => {
  const source = readFileSync(new URL("./verify-hairfit-v2-supabase-post-apply.mjs", import.meta.url), "utf8");
  assert.match(source, /anon\.from\(table\)\.select\("id"\)\.limit\(0\)/u);
  assert.doesNotMatch(source, /anon\.from\(table\)\.select\("id", \{ head: true/u);
});
