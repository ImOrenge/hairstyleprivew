import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
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

test("each discovery page owns a unique model and preview asset set", () => {
  const sourcePersonIds = discoverySampleManifests.map((manifest) =>
    getDiscoverySampleAsset(manifest, manifest.sourceAssetId)?.personId,
  );
  assert.equal(new Set(sourcePersonIds).size, discoverySampleManifests.length);

  const previewPaths = new Set<string>();
  const sourceHashes = new Set<string>();
  const previewHashes = new Set<string>();
  for (const manifest of discoverySampleManifests) {
    const source = getDiscoverySampleAsset(manifest, manifest.sourceAssetId);
    const sourcePersonId = source?.personId;
    assert.ok(source);
    const sourcePath = join(appRoot, "public", source.path.slice(1));
    sourceHashes.add(createHash("sha256").update(readFileSync(sourcePath)).digest("hex"));
    const previews = manifest.assets.filter((asset) => asset.role === "preview");
    assert.ok(previews.every((asset) => asset.personId === sourcePersonId));
    for (const preview of previews) {
      assert.equal(previewPaths.has(preview.path), false, `${preview.path} is reused across pages`);
      previewPaths.add(preview.path);
      const previewPath = join(appRoot, "public", preview.path.slice(1));
      previewHashes.add(createHash("sha256").update(readFileSync(previewPath)).digest("hex"));
    }
  }
  assert.equal(sourceHashes.size, discoverySampleManifests.length, "source image bytes are reused");
  assert.equal(previewHashes.size, 63, "preview image bytes are reused");
});

test("all preview candidates map to real catalog-v4 entries", () => {
  const catalogDirectory = join(appRoot, "data", "hairstyle-blueprints", "v4");
  const catalogFiles = [
    "female-short.json",
    "female-medium.json",
    "female-long.json",
    "male-short.json",
    "male-medium.json",
    "male-long.json",
  ];
  const catalog = new Map<string, string>();
  for (const file of catalogFiles) {
    const rows = JSON.parse(readFileSync(join(catalogDirectory, file), "utf8")) as {
      slug: string;
      nameKo: string;
    }[];
    for (const row of rows) catalog.set(row.slug, row.nameKo);
  }

  for (const manifest of discoverySampleManifests) {
    for (const preview of manifest.assets.filter((asset) => asset.role === "preview")) {
      assert.equal(preview.catalogVersion, "catalog-v4");
      assert.ok(preview.catalogStyleSlug);
      assert.equal(catalog.get(preview.catalogStyleSlug), preview.catalogNameKo);
    }
  }
});
