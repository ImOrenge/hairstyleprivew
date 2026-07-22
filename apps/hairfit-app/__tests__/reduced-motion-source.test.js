/* global __dirname, describe, expect, test */

const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const appRoot = resolve(__dirname, "..");

describe("mobile reduced-motion source adoption", () => {
  test("applies the shared motion policy to every non-aftercare animated modal", () => {
    const home = readFileSync(resolve(appRoot, "app/index.tsx"), "utf8");
    const styler = readFileSync(
      resolve(appRoot, "components/styler/MobileStylerHairSelectionModal.tsx"),
      "utf8",
    );

    expect(home).toMatch(/resolveMotionAwareModalAnimation\(reduceMotion, "fade"\)/);
    expect(styler).toMatch(/resolveMotionAwareModalAnimation\(reduceMotion, "slide"\)/);
    expect(home).not.toMatch(/animationType="fade"/);
    expect(styler).not.toMatch(/animationType="slide"/);
  });
});
