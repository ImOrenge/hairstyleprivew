import assert from "node:assert/strict";
import test from "node:test";
import { isMissingOptionalTableError } from "./supabase-errors.ts";

test("recognizes PostgreSQL and PostgREST missing-table responses", () => {
  assert.equal(isMissingOptionalTableError({ code: "42P01", message: "relation does not exist" }), true);
  assert.equal(isMissingOptionalTableError({ code: "PGRST205", message: "Could not find the table in the schema cache" }), true);
  assert.equal(isMissingOptionalTableError({ code: null, message: "Could not find the table 'public.example' in the schema cache" }), true);
});

test("does not hide permission, missing-column, or connectivity failures", () => {
  assert.equal(isMissingOptionalTableError({ code: "42501", message: "permission denied" }), false);
  assert.equal(isMissingOptionalTableError({ code: "PGRST204", message: "column missing" }), false);
  assert.equal(isMissingOptionalTableError({ code: "PGRST002", message: "schema cache unavailable" }), false);
  assert.equal(isMissingOptionalTableError(null), false);
});
