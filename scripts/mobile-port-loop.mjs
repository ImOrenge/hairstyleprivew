import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const webAppRoot = path.join(root, "my-app", "app");
const nativeAppRoot = path.join(root, "apps", "hairfit-app");

const requiredFiles = [
  "docs/mobile-port-map.md",
  "apps/hairfit-app/package.json",
  "apps/hairfit-app/app.json",
  "apps/hairfit-app/app/index.tsx",
  "apps/hairfit-app/app/admin/index.tsx",
  "apps/hairfit-app/app/admin/stats.tsx",
  "apps/hairfit-app/app/salon/index.tsx",
  "apps/hairfit-app/app/salon/customers/index.tsx",
  "packages/shared/package.json",
  "packages/api-client/package.json",
  "packages/ui-native/package.json",
  "packages/payments-portone/package.json",
];

const parityRoutes = [
  {
    service: "shared",
    route: "/",
    target: "apps/hairfit-app/app/index.tsx",
    focus: "role-aware service entry from MobileBootstrap.services",
  },
  {
    service: "customer",
    route: "/mypage",
    target: "apps/hairfit-app/app/mypage.tsx",
    focus: "2-column metrics, section tabs, usage/payment cards",
  },
  {
    service: "salon",
    route: "/salon/customers",
    target: "apps/hairfit-app/app/salon/customers/index.tsx",
    focus: "CRM summary metrics, search/filter, customer cards, matching/aftercare panels",
  },
  {
    service: "admin",
    route: "/admin/stats",
    target: "apps/hairfit-app/app/admin/stats.tsx",
    focus: "range controls, KPI grid, B2B lead card, daily trend",
  },
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
  const relative = path.relative(webAppRoot, filePath).replaceAll(path.sep, "/");
  const withoutMarker = relative.slice(0, -marker.length);
  const parts = withoutMarker
    .split("/")
    .filter(Boolean)
    .filter((part) => !(part.startsWith("(") && part.endsWith(")")));

  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

function serviceForRoute(route) {
  if (route.startsWith("/admin")) {
    return "admin";
  }
  if (route.startsWith("/salon")) {
    return "salon";
  }
  return "customer";
}

function serviceForApi(route) {
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
    console.log(`${row.service.padEnd(8)} ${row.route}`);
  }
}

const pages = walk(webAppRoot, (file) => file.endsWith("page.tsx"))
  .map((file) => normalizeRoute(file, "page.tsx"))
  .sort()
  .map((route) => ({ route, service: serviceForRoute(route) }));

const apis = walk(path.join(webAppRoot, "api"), (file) => file.endsWith("route.ts"))
  .map((file) => `/api/${normalizeRoute(file, "route.ts").replace(/^\/api\/?/, "")}`)
  .sort()
  .map((route) => ({ route, service: serviceForApi(route) }));

if (process.argv.includes("--inventory")) {
  printTable("Web page route inventory", pages);
  printTable("API route inventory", apis);
  process.exit(0);
}

const missing = requiredFiles.filter((file) => !existsSync(path.join(root, file)));

printTable("Web page route inventory", pages);
printTable("API route inventory", apis);

console.log("\nUnified native app");
console.log("------------------");
console.log(`Target: ${path.relative(root, nativeAppRoot).replaceAll(path.sep, "/")}`);
console.log("Expo workspace: @hairfit/app");
console.log("Deep links keep the Next.js route shape for customer, salon, and admin screens.");

console.log("\nNext.js mobile parity loop");
console.log("--------------------------");
for (const item of parityRoutes) {
  console.log(`${item.service.padEnd(8)} ${item.route} -> ${item.target}`);
  console.log(`         ${item.focus}`);
}

if (missing.length > 0) {
  console.error("\nMissing mobile porting assets:");
  for (const file of missing) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log("\nUnified app assets are present.");
