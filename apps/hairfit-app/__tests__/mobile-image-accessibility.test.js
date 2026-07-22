/* global __dirname, describe, expect, test */

const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const appRoot = resolve(__dirname, "..");
const meaningfulImageFiles = [
  "app/index.tsx",
  "app/upload.tsx",
  "app/personal-color.tsx",
  "app/generate/[id].tsx",
  "app/result/[id].tsx",
  "components/styler/MobileStylerSessionView.tsx",
  "components/styler/MobileStylerNewView.tsx",
  "components/styler/MobileStylerHairSelectionModal.tsx",
];

describe("non-aftercare meaningful images", () => {
  test.each(meaningfulImageFiles)("labels every Image in %s", (relativePath) => {
    const source = readFileSync(resolve(appRoot, relativePath), "utf8");
    const imageCount = (source.match(/<Image\b/g) || []).length;
    const labelCount = (source.match(/accessibilityLabel=/g) || []).length;
    const roleCount = (source.match(/accessibilityRole="image"/g) || []).length;

    expect(imageCount).toBeGreaterThan(0);
    expect(labelCount).toBeGreaterThanOrEqual(imageCount);
    expect(roleCount).toBeGreaterThanOrEqual(imageCount);
  });
});
