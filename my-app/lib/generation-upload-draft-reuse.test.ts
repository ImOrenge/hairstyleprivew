import assert from "node:assert/strict";
import test from "node:test";
import { evaluateGenerationDraftReuse, uploadGenerationDraftWithSingleRecovery } from "./generation-upload-draft-reuse.ts";

const now = Date.parse("2026-08-27T00:00:00.000Z");
const valid = {
  id: "draft-1",
  client_request_id: "request-1",
  state: "ready",
  original_image_path: "user/draft.webp",
  uploaded_at: "2026-08-26T00:00:00.000Z",
  expires_at: "2026-08-28T00:00:00.000Z",
};

test("ready and accepted drafts with durable storage metadata are reusable", () => {
  assert.deepEqual(evaluateGenerationDraftReuse(valid, now), { reusable: true });
  assert.deepEqual(evaluateGenerationDraftReuse({ ...valid, state: "accepted" }, now), { reusable: true });
});

test("expired drafts request a new photo upload", () => {
  const decision = evaluateGenerationDraftReuse({ ...valid, expires_at: "2026-08-26T00:00:00.000Z" }, now);
  assert.equal(decision.reusable, false);
  if (!decision.reusable) {
    assert.equal(decision.code, "DRAFT_EXPIRED");
    assert.equal(decision.status, 410);
  }
});

test("drafts without a reusable state or storage path are rejected", () => {
  for (const row of [{ ...valid, state: "uploading" }, { ...valid, original_image_path: "" }]) {
    const decision = evaluateGenerationDraftReuse(row, now);
    assert.equal(decision.reusable, false);
    if (!decision.reusable) assert.equal(decision.code, "DRAFT_NOT_REUSABLE");
  }
});

test("new and reusable draft responses complete without a second upload", async () => {
  for (const status of [201, 200]) {
    const requests: string[] = [];
    const result = await uploadGenerationDraftWithSingleRecovery({
      initialClientRequestId: "stable-id",
      createFreshClientRequestId: () => "fresh-id",
      postDraft: async (clientRequestId) => {
        requests.push(clientRequestId);
        return { response: { ok: true, status }, data: { draftId: clientRequestId } };
      },
    });
    assert.equal(result.response.status, status);
    assert.deepEqual(requests, ["stable-id"]);
  }
});

test("an expired draft retries exactly once with a fresh UUID", async () => {
  const requests: string[] = [];
  const result = await uploadGenerationDraftWithSingleRecovery({
    initialClientRequestId: "expired-id",
    createFreshClientRequestId: () => "fresh-id",
    postDraft: async (clientRequestId) => {
      requests.push(clientRequestId);
      return clientRequestId === "expired-id"
        ? { response: { ok: false, status: 410 }, data: { code: "DRAFT_EXPIRED" } }
        : { response: { ok: true, status: 201 }, data: { draftId: clientRequestId } };
    },
  });
  assert.equal(result.response.status, 201);
  assert.deepEqual(requests, ["expired-id", "fresh-id"]);
});
