/* global __dirname, describe, expect, test */

const { readdirSync, readFileSync } = require("node:fs");
const { join, relative } = require("node:path");
const {
  getNativeScreenMigrationSummary,
  NATIVE_SCREEN_MIGRATION_MAP,
} = require("../lib/native-screen-migration");

const sourceRoot = join(__dirname, "..");
const appRoot = join(sourceRoot, "app");

function routeFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(absolute);
    if (!entry.name.endsWith(".tsx") || entry.name === "_layout.tsx") return [];
    return [`app/${relative(appRoot, absolute).replaceAll("\\", "/")}`];
  });
}

describe("native screen migration map", () => {
  test("covers every Expo route exactly once", () => {
    const actualRoutes = routeFiles(appRoot).sort();
    const mappedRoutes = NATIVE_SCREEN_MIGRATION_MAP.map((item) => item.file).sort();

    expect(new Set(mappedRoutes).size).toBe(mappedRoutes.length);
    expect(mappedRoutes).toEqual(actualRoutes);
    expect(getNativeScreenMigrationSummary()).toEqual({ alias: 4, compatibility: 2, migrated: 30 });
  });

  test("non-aftercare routes own AppScreen directly instead of the Screen alias", () => {
    const migratedAppScreens = NATIVE_SCREEN_MIGRATION_MAP.filter(
      (item) => item.targetShell === "AppScreen" && item.state === "migrated",
    );
    const compatibilityRoutes = NATIVE_SCREEN_MIGRATION_MAP.filter(
      (item) => item.state === "compatibility",
    );

    expect(migratedAppScreens).toHaveLength(22);
    expect(compatibilityRoutes.map((item) => item.file).sort()).toEqual([
      "app/aftercare.tsx",
      "app/aftercare/[hairRecordId].tsx",
    ]);

    for (const route of migratedAppScreens) {
      const source = readFileSync(join(sourceRoot, route.shellOwner), "utf8");
      expect(source).toContain("import { AppScreen } from");
      expect(source).toContain("<AppScreen");
      expect(source).not.toMatch(
        /import\s+\{[^}]*\bScreen\b[^}]*\}\s+from\s+"@hairfit\/ui-native"/s,
      );
    }
  });

  test("migrated long-list routes use the direct list shell without nested scroll ownership", () => {
    const listRoutes = NATIVE_SCREEN_MIGRATION_MAP.filter(
      (item) => item.targetShell === "VirtualizedListScreen",
    );

    expect(listRoutes).toHaveLength(5);
    for (const route of listRoutes) {
      const source = readFileSync(join(__dirname, "..", route.file), "utf8");
      const relativeImport = route.file.includes("salon/customers")
        ? "../../../components/app/VirtualizedListScreen"
        : "../../components/app/VirtualizedListScreen";
      expect(source).toContain(`from "${relativeImport}"`);
      expect(source).not.toMatch(/<Screen\s+scroll=\{false\}/);
      expect(source).not.toMatch(/<FlatList/);
    }
  });

  test("TypeScript and Metro keep the same explicit compatibility boundary", () => {
    const bridge = readFileSync(join(__dirname, "..", "lib", "ui-native.tsx"), "utf8");
    const tsconfig = readFileSync(join(__dirname, "..", "tsconfig.json"), "utf8");
    const metro = readFileSync(join(__dirname, "..", "metro.config.js"), "utf8");

    expect(bridge).toContain("AppScreen as Screen");
    expect(bridge).toContain("VirtualizedListScreen");
    expect(bridge).toContain("FormScreen");
    expect(tsconfig).toMatch(/"@hairfit\/ui-native"\s*:\s*\[\s*"lib\/ui-native\.tsx"/);
    expect(metro).toContain('moduleName === "@hairfit/ui-native"');
    expect(metro).toContain("appUiNativePath");
  });
});
