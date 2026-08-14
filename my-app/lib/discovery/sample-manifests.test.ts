import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { discoverySampleManifests, getDiscoverySampleAsset } from "./sample-manifests.ts";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("all seven samples have one source, nine previews, one OG and three strategies", () => {
  assert.equal(discoverySampleManifests.length, 7);
  assert.equal(new Set(discoverySampleManifests.map((manifest) => manifest.id)).size, 7);
  for (const manifest of discoverySampleManifests) {
    assert.equal(manifest.status, "approved");
    assert.equal(manifest.assets.filter((asset) => asset.role === "source").length, 1);
    assert.equal(manifest.assets.filter((asset) => asset.role === "preview").length, 9);
    assert.equal(manifest.assets.filter((asset) => asset.role === "og").length, 1);
    assert.deepEqual(manifest.strategies.map((strategy) => [strategy.id, strategy.assetIds.length]), [["BALANCE", 3], ["IMAGE", 3], ["LIFESTYLE", 3]]);
  }
});

test("sample paths and recorded byte sizes match repository assets", () => {
  for (const manifest of discoverySampleManifests) {
    assert.equal(new Set(manifest.assets.map((asset) => asset.id)).size, manifest.assets.length);
    for (const asset of manifest.assets) {
      const assetPath = join(appRoot, "public", asset.path.slice(1));
      assert.equal(existsSync(assetPath), true, `${asset.path} is missing`);
      assert.equal(statSync(assetPath).size, asset.bytes, `${asset.path} byte size drifted`);
      assert.ok(asset.width > 0 && asset.height > 0 && asset.alt && asset.licenseRef && asset.consentRef);
      assert.equal(asset.status, "approved");
    }
    for (const strategy of manifest.strategies) {
      for (const assetId of strategy.assetIds) assert.equal(getDiscoverySampleAsset(manifest, assetId)?.role, "preview");
    }
  }
});
