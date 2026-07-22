import { describe, expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "node:path";

const appRoot = path.resolve(process.cwd());

function read(relativePath: string) {
  return readFileSync(path.join(appRoot, relativePath), "utf8");
}

describe("network recovery adoption", () => {
  test("wraps the app once and refreshes critical read models after reconnect", () => {
    const layout = read("app/_layout.tsx");
    const home = read("app/index.tsx");
    const generation = read("app/generate/[id].tsx");
    const result = read("app/result/[id].tsx");
    const styler = read("components/styler/useMobileStylerNewController.ts");

    expect(layout).toContain("<NetworkRecoveryProvider>");
    expect(home).toContain("[api, isLoaded, isSignedIn, recoveryToken]");
    expect(generation).toContain('networkAvailability === "offline"');
    expect(generation).toContain("[isAuthLoaded, isSignedIn, load, recoveryToken, resumeTarget]");
    expect(result).toContain("[api, generationId, recoveryToken, showMessage, variantFromRoute]");
    expect(styler).toContain("[api, recoveryToken]");
    expect(styler).toContain("[api, generationId, recoveryToken, selectedVariantId]");
  });

  test("does not replay recommendation, generation, or paid execution commands on reconnect", () => {
    const styler = read("components/styler/useMobileStylerNewController.ts");
    const recoveryEffects = styler.match(/useEffect\([\s\S]*?recoveryToken[\s\S]*?\);/g) || [];
    const joined = recoveryEffects.join("\n");

    expect(joined).not.toContain("recommendStyling(");
    expect(joined).not.toContain("generateStyling(");
    expect(joined).not.toContain("handleGenerate(");
  });
});
