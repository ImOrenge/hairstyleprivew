import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateMobileAppUpdate,
  selectGooglePlayProductionRelease,
} from "./app-version.ts";

test("selects the highest active production version code", () => {
  const release = selectGooglePlayProductionRelease([
    { track: "internal", releases: [{ status: "completed", versionCodes: ["99"] }] },
    {
      track: "production",
      releases: [
        { name: "1.5.1", status: "completed", versionCodes: ["4"], inAppUpdatePriority: 2 },
        { name: "1.6.0", status: "inProgress", versionCodes: ["5", "6"], inAppUpdatePriority: 5 },
        { name: "draft", status: "draft", versionCodes: ["100"] },
      ],
    },
  ]);

  assert.deepEqual(release, {
    versionCode: 6,
    versionName: "1.6.0",
    updatePriority: 5,
  });
});

test("ignores unavailable, halted, and malformed releases", () => {
  assert.equal(selectGooglePlayProductionRelease([]), null);
  assert.equal(selectGooglePlayProductionRelease([
    {
      track: "production",
      releases: [
        { status: "halted", versionCodes: ["8"] },
        { status: "completed", versionCodes: ["invalid"] },
      ],
    },
  ]), null);
});

test("detects optional and required updates from native build numbers", () => {
  assert.deepEqual(
    evaluateMobileAppUpdate("4", { latestVersionCode: 6, minimumVersionCode: 3 }),
    { available: true, required: false },
  );
  assert.deepEqual(
    evaluateMobileAppUpdate(2, { latestVersionCode: 6, minimumVersionCode: 3 }),
    { available: true, required: true },
  );
  assert.deepEqual(
    evaluateMobileAppUpdate("6", { latestVersionCode: 6, minimumVersionCode: 3 }),
    { available: false, required: false },
  );
  assert.deepEqual(
    evaluateMobileAppUpdate(null, { latestVersionCode: 6, minimumVersionCode: 3 }),
    { available: false, required: false },
  );
});
