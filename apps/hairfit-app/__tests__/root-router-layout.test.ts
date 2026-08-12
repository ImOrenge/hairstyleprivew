import { describe, expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "node:path";

const appRoot = path.resolve(process.cwd());

function read(relativePath: string) {
  return readFileSync(path.join(appRoot, relativePath), "utf8");
}

describe("root router layout", () => {
  test("ships the splash-screen native module required by the development client", () => {
    const manifest = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
    };

    expect(manifest.dependencies?.["expo-dev-client"]).toBeDefined();
    expect(manifest.dependencies?.["expo-splash-screen"]).toBe("~55.0.23");
  });

  test("owns the route stack while keeping role navigation outside the active screen", () => {
    const layout = read("app/_layout.tsx");
    const scaffoldOpen = layout.indexOf("<RoleNavigationScaffold>");
    const stack = layout.indexOf('<Stack screenOptions={{ headerShown: false }} />');
    const scaffoldClose = layout.indexOf("</RoleNavigationScaffold>");

    expect(layout).toContain('import { Stack } from "expo-router"');
    expect(layout).not.toContain('import { Slot } from "expo-router"');
    expect(scaffoldOpen).toBeGreaterThan(-1);
    expect(stack).toBeGreaterThan(scaffoldOpen);
    expect(scaffoldClose).toBeGreaterThan(stack);
  });

  test("keeps app-wide recovery and generation providers outside the route stack", () => {
    const layout = read("app/_layout.tsx");
    const stack = layout.indexOf("<Stack");

    for (const provider of [
      "<PushNotificationProvider>",
      "<NetworkRecoveryProvider>",
      "<AppVersionProvider>",
      "<GenerationFlowProvider>",
    ]) {
      expect(layout.indexOf(provider)).toBeGreaterThan(-1);
      expect(layout.indexOf(provider)).toBeLessThan(stack);
    }
  });
});
