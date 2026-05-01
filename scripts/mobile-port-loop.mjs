import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const appRoot = path.join(root, "my-app", "app");

const requiredFiles = [
  "docs/mobile-porting-loop.md",
  "docs/mobile-port-map.md",
  "apps/customer-mobile/package.json",
  "apps/salon-mobile/package.json",
  "apps/admin-mobile/package.json",
  "packages/shared/package.json",
  "packages/api-client/package.json",
  "packages/ui-native/package.json",
  "packages/payments-portone/package.json",
];

function walk(dir, matcher, acc = []) {
  if (!existsSync(dir)) {
    return acc;
  }

  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, matcher, acc);
    } else if (matcher(fullPath)) {
      acc.push(fullPath);
    }
  }

  return acc;
}

function normalizeRoute(filePath, marker) {
  const relative = path.relative(appRoot, filePath).replaceAll(path.sep, "/");
  const withoutMarker = relative.slice(0, -marker.length);
  const parts = withoutMarker
    .split("/")
    .filter(Boolean)
    .filter((part) => !(part.startsWith("(") && part.endsWith(")")));

  if (parts.length === 0) {
    return "/";
  }

  return `/${parts.join("/")}`;
}

function ownerForRoute(route) {
  if (route.startsWith("/admin")) {
    return "admin";
  }
  if (route.startsWith("/salon")) {
    return "salon";
  }
  return "customer";
}

function ownerForApi(route) {
  if (route.startsWith("/api/admin")) {
    return "admin";
  }
  if (route.startsWith("/api/salon")) {
    return "salon";
  }
  if (route.startsWith("/api/email") || route.startsWith("/api/payments/webhook")) {
    return "backend";
  }
  return "customer";
}

function printTable(title, rows) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
  for (const row of rows) {
    console.log(`${row.owner.padEnd(8)} ${row.route}`);
  }
}

const pages = walk(appRoot, (file) => file.endsWith("page.tsx"))
  .map((file) => normalizeRoute(file, "page.tsx"))
  .sort()
  .map((route) => ({ route, owner: ownerForRoute(route) }));

const apis = walk(path.join(appRoot, "api"), (file) => file.endsWith("route.ts"))
  .map((file) => `/api/${normalizeRoute(file, "route.ts").replace(/^\/api\/?/, "")}`)
  .sort()
  .map((route) => ({ route, owner: ownerForApi(route) }));

if (process.argv.includes("--inventory")) {
  printTable("Web page route inventory", pages);
  printTable("API route inventory", apis);
  process.exit(0);
}

const missing = requiredFiles.filter((file) => !existsSync(path.join(root, file)));

printTable("Web page route inventory", pages);
printTable("API route inventory", apis);

console.log("\nMobile porting loop");
console.log("-------------------");
console.log("1. Pick one web route from the inventory.");
console.log("2. Capture current web behavior and API calls.");
console.log("3. Port the native screen into the owning Expo app.");
console.log("4. Wire the shared API client and role-aware navigation.");
console.log("5. Verify empty, loading, success, error, and unauthorized states.");

if (missing.length > 0) {
  console.error("\nMissing mobile porting assets:");
  for (const file of missing) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log("\nLoop assets are present.");
