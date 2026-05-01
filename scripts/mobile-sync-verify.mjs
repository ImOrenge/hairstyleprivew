import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const appRoot = path.join(root, "my-app", "app");
const mapPath = path.join(root, "docs", "mobile-port-map.md");
const apiClientPath = path.join(root, "packages", "api-client", "src", "index.ts");

const args = new Set(process.argv.slice(2));
const reportArgIndex = process.argv.indexOf("--report");
const reportPath =
  reportArgIndex >= 0 && process.argv[reportArgIndex + 1]
    ? path.resolve(root, process.argv[reportArgIndex + 1])
    : null;
const runtimeEnabled = args.has("--runtime");
const strictRuntime = args.has("--strict-runtime");
const apiBaseUrl = readArgValue("--api-base-url") || process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000";
const explicitMetroStatusUrl = readArgValue("--metro-status-url") || process.env.MOBILE_METRO_STATUS_URL || null;
const metroStatusUrls = explicitMetroStatusUrl
  ? [explicitMetroStatusUrl]
  : ["http://localhost:8084/status", "http://localhost:8085/status"];

const expectedApiContracts = [
  {
    route: "/api/mobile/me",
    file: "my-app/app/api/mobile/me/route.ts",
    clientMethod: "getMobileMe",
    clientPath: "/api/mobile/me",
  },
  {
    route: "/api/mobile/dashboard",
    file: "my-app/app/api/mobile/dashboard/route.ts",
    clientMethod: "getMobileDashboard",
    clientPath: "/api/mobile/dashboard?service=",
  },
  {
    route: "/api/mobile/payments/prepare",
    file: "my-app/app/api/mobile/payments/prepare/route.ts",
    clientMethod: "prepareMobilePayment",
    clientPath: "/api/mobile/payments/prepare",
  },
  {
    route: "/api/mobile/payments/complete",
    file: "my-app/app/api/mobile/payments/complete/route.ts",
    clientMethod: "completeMobilePayment",
    clientPath: "/api/mobile/payments/complete",
  },
  {
    route: "/api/onboarding",
    file: "my-app/app/api/onboarding/route.ts",
    clientMethod: "submitOnboarding",
    clientPath: "/api/onboarding",
  },
  {
    route: "/api/prompts/generate",
    file: "my-app/app/api/prompts/generate/route.ts",
    clientMethod: "createRecommendations",
    clientPath: "/api/prompts/generate",
  },
  {
    route: "/api/generations/run",
    file: "my-app/app/api/generations/run/route.ts",
    clientMethod: "runGeneration",
    clientPath: "/api/generations/run",
  },
  {
    route: "/api/generations/[id]",
    file: "my-app/app/api/generations/[id]/route.ts",
    clientMethod: "getGeneration",
    clientPath: "/api/generations/",
  },
  {
    route: "/api/style-profile",
    file: "my-app/app/api/style-profile/route.ts",
    clientMethod: "getStyleProfile",
    clientPath: "/api/style-profile",
  },
  {
    route: "/api/style-profile/body-photo",
    file: "my-app/app/api/style-profile/body-photo/route.ts",
    clientMethod: "uploadBodyPhoto",
    clientPath: "/api/style-profile/body-photo",
  },
  {
    route: "/api/styling/hairstyles",
    file: "my-app/app/api/styling/hairstyles/route.ts",
    clientMethod: "getStylingHairstyles",
    clientPath: "/api/styling/hairstyles",
  },
  {
    route: "/api/styling/recommend",
    file: "my-app/app/api/styling/recommend/route.ts",
    clientMethod: "recommendStyling",
    clientPath: "/api/styling/recommend",
  },
  {
    route: "/api/styling/generate",
    file: "my-app/app/api/styling/generate/route.ts",
    clientMethod: "generateStyling",
    clientPath: "/api/styling/generate",
  },
  {
    route: "/api/styling/[id]",
    file: "my-app/app/api/styling/[id]/route.ts",
    clientMethod: "getStylingSession",
    clientPath: "/api/styling/",
  },
  {
    route: "/api/hair-records",
    file: "my-app/app/api/hair-records/route.ts",
    clientMethod: "createHairRecord",
    clientPath: "/api/hair-records",
  },
  {
    route: "/api/mobile/aftercare",
    file: "my-app/app/api/mobile/aftercare/route.ts",
    clientMethod: "getAftercareRecords",
    clientPath: "/api/mobile/aftercare",
  },
  {
    route: "/api/mobile/aftercare/[hairRecordId]",
    file: "my-app/app/api/mobile/aftercare/[hairRecordId]/route.ts",
    clientMethod: "getAftercareGuide",
    clientPath: "/api/mobile/aftercare/",
  },
];

function readArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return null;
  }
  return process.argv[index + 1] || null;
}

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

function parsePortMap() {
  if (!existsSync(mapPath)) {
    return { rows: [], missing: true };
  }

  const rows = [];
  let section = "";
  const text = readFileSync(mapPath, "utf8");
  const rowPattern = /^\|\s*(?<source>[^|]+?)\s*\|\s*(?<target>[^|]+?)\s*\|\s*(?<status>[^|]+?)\s*\|(?<notes>.*)\|$/;

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      section = line.replace(/^##\s+/, "").trim();
      continue;
    }

    const match = line.match(rowPattern);
    if (!match?.groups) {
      continue;
    }

    const source = stripCell(match.groups.source);
    const target = stripCell(match.groups.target);
    const status = stripCell(match.groups.status);
    if (status === "---" || source === "Web route" || source === "API area") {
      continue;
    }

    rows.push({
      section,
      source,
      target,
      status,
      notes: match.groups.notes.trim(),
    });
  }

  return { rows, missing: false };
}

function stripCell(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("`") && trimmed.endsWith("`")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function pageInventory() {
  return walk(appRoot, (file) => file.endsWith("page.tsx"))
    .map((file) => normalizeRoute(file, "page.tsx"))
    .sort();
}

function statusCounts(rows) {
  return rows.reduce(
    (acc, row) => {
      if (row.status in acc) {
        acc[row.status] += 1;
      }
      return acc;
    },
    { inventory: 0, scaffolded: 0, ported: 0, verified: 0 },
  );
}

function routeRows(rows) {
  return rows.filter((row) => row.source.startsWith("/") && !row.source.startsWith("/api/"));
}

function apiRows(rows) {
  return rows.filter((row) => row.source.includes("/api/"));
}

function checkStaticSync() {
  const { rows, missing } = parsePortMap();
  const pages = pageInventory();
  const apiClientText = existsSync(apiClientPath) ? readFileSync(apiClientPath, "utf8") : "";
  const errors = [];
  const warnings = [];
  const notes = [];

  if (missing) {
    errors.push("docs/mobile-port-map.md is missing.");
  }

  const mappedRoutes = new Set(routeRows(rows).map((row) => row.source));
  const unmappedPages = pages.filter((route) => !mappedRoutes.has(route));
  if (unmappedPages.length > 0) {
    errors.push(`Unmapped web routes: ${unmappedPages.join(", ")}`);
  }

  const extraMappedRoutes = [...mappedRoutes].filter((route) => !pages.includes(route));
  if (extraMappedRoutes.length > 0) {
    warnings.push(`Routes in the mobile map but not in the current web page inventory: ${extraMappedRoutes.join(", ")}`);
  }

  const targetChecks = routeRows(rows)
    .filter((row) => row.target.startsWith("apps/"))
    .map((row) => ({
      ...row,
      exists: existsSync(path.join(root, row.target)),
    }));
  const missingActiveTargets = targetChecks.filter((row) => row.status !== "inventory" && !row.exists);
  if (missingActiveTargets.length > 0) {
    errors.push(
      `Active mobile targets missing: ${missingActiveTargets.map((row) => `${row.source} -> ${row.target}`).join(", ")}`,
    );
  }

  const staleInventoryTargets = targetChecks.filter((row) => row.status === "inventory" && row.exists);
  if (staleInventoryTargets.length > 0) {
    warnings.push(
      `Inventory rows with existing native files: ${staleInventoryTargets
        .map((row) => `${row.source} -> ${row.target}`)
        .join(", ")}`,
    );
  }

  const missingInventoryTargets = targetChecks.filter((row) => row.status === "inventory" && !row.exists);
  if (missingInventoryTargets.length > 0) {
    notes.push(`${missingInventoryTargets.length} inventory routes do not have native files yet.`);
  }

  for (const contract of expectedApiContracts) {
    if (!existsSync(path.join(root, contract.file))) {
      errors.push(`Missing API route file for ${contract.route}: ${contract.file}`);
    }
    if (!apiClientText.includes(contract.clientMethod)) {
      errors.push(`Missing API client method ${contract.clientMethod} for ${contract.route}.`);
    }
    if (!apiClientText.includes(contract.clientPath)) {
      errors.push(`Missing API client path ${contract.clientPath} for ${contract.route}.`);
    }
  }

  const counts = statusCounts(rows);
  if (counts.verified === 0) {
    warnings.push("No mobile route is marked verified yet. Runtime E2E evidence is still required before promoting rows.");
  }

  return {
    errors,
    warnings,
    notes,
    rows,
    pages,
    counts,
    targetChecks,
    apiRows: apiRows(rows),
  };
}

async function fetchWithTimeout(url, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text().catch(() => "");
    return { ok: true, status: response.status, text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkRuntimeSmoke() {
  const checks = [];
  const errors = [];
  const warnings = [];

  const unauthApiChecks = [
    { name: "mobile me unauth", url: `${apiBaseUrl.replace(/\/+$/, "")}/api/mobile/me`, expectedStatus: 401 },
    {
      name: "customer dashboard unauth",
      url: `${apiBaseUrl.replace(/\/+$/, "")}/api/mobile/dashboard?service=customer`,
      expectedStatus: 401,
    },
  ];

  for (const check of unauthApiChecks) {
    const result = await fetchWithTimeout(check.url);
    checks.push({ ...check, ...result });
    if (!result.ok) {
      errors.push(`${check.name} failed to connect: ${result.error}`);
    } else if (result.status !== check.expectedStatus) {
      errors.push(`${check.name} expected ${check.expectedStatus} but received ${result.status}.`);
    }
  }

  const metroAttempts = [];
  for (const url of metroStatusUrls) {
    const result = await fetchWithTimeout(url);
    metroAttempts.push({ name: "expo metro status", url, expectedStatus: 200, ...result });
    if (result.ok && result.status === 200 && result.text.includes("packager-status:running")) {
      break;
    }
  }

  const metro = metroAttempts.find(
    (attempt) => attempt.ok && attempt.status === 200 && attempt.text.includes("packager-status:running"),
  ) || metroAttempts[0];
  checks.push(metro);

  if (!metro.ok) {
    const message = `Expo Metro status failed to connect: ${metro.error}`;
    if (strictRuntime) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  } else if (metro.status !== 200 || !metro.text.includes("packager-status:running")) {
    const attemptedUrls = metroAttempts.map((attempt) => attempt.url).join(", ");
    const message = `Expo Metro status expected 200 packager-status:running but received ${metro.status}. Attempted: ${attemptedUrls}.`;
    if (strictRuntime) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  return { checks, errors, warnings };
}

function formatList(items, empty = "None") {
  if (items.length === 0) {
    return `- ${empty}`;
  }
  return items.map((item) => `- ${item}`).join("\n");
}

function formatReport(staticResult, runtimeResult) {
  const activeTargets = staticResult.targetChecks.filter((row) => row.status !== "inventory");
  const missingInventoryTargets = staticResult.targetChecks.filter((row) => row.status === "inventory" && !row.exists);
  const runtimeLines = runtimeResult
    ? runtimeResult.checks.map((check) => {
        if (!check.ok) {
          return `- ${check.name}: failed (${check.error})`;
        }
        return `- ${check.name}: ${check.status}`;
      })
    : ["- Not run. Use `npm run mobile:sync:runtime` for local API and Metro smoke checks."];

  const verdict =
    staticResult.errors.length === 0 && (!runtimeResult || runtimeResult.errors.length === 0)
      ? runtimeResult
        ? "AUTOMATED PASS"
        : "STATIC PASS"
      : "FAIL";
  const allWarnings = runtimeResult ? [...staticResult.warnings, ...runtimeResult.warnings] : staticResult.warnings;
  const allErrors = runtimeResult ? [...staticResult.errors, ...runtimeResult.errors] : staticResult.errors;

  return `# Mobile Web-App Sync Verification Report

Generated: ${new Date().toISOString()}

## Verdict

${verdict}

## Status Counts

- inventory: ${staticResult.counts.inventory}
- scaffolded: ${staticResult.counts.scaffolded}
- ported: ${staticResult.counts.ported}
- verified: ${staticResult.counts.verified}

## Static Sync Checks

- Web page routes inventoried: ${staticResult.pages.length}
- Active mobile targets checked: ${activeTargets.length}
- API contracts checked: ${expectedApiContracts.length}
- Inventory routes without native files: ${missingInventoryTargets.length}

## Runtime Smoke

${runtimeLines.join("\n")}

## Errors

${formatList(allErrors)}

## Warnings

${formatList(allWarnings)}

## Notes

${formatList(staticResult.notes)}

## Android E2E Manual Gate

- Build/install an Android development build for customer, salon, and admin apps.
- Create new customer, salon, and admin test accounts through the mobile auth screens.
- Promote the salon and admin accounts from an existing admin session before validating their apps.
- Validate customer flow: signup, onboarding, mobile me, upload, recommendations, generation run, result selection, my page.
- Validate role gates: customer receives 403 for salon/admin dashboards, salon receives 403 for admin, admin can access customer/salon/admin services.
- PortOne external SDK return is excluded from this run; only prepare/complete server contracts are in scope when explicitly tested.

## Current Sync Gaps

${formatList(
  missingInventoryTargets.map((row) => `${row.source} -> ${row.target}`),
  "No inventory gaps without native files.",
)}
`;
}

function printSummary(staticResult, runtimeResult) {
  const allErrors = runtimeResult ? [...staticResult.errors, ...runtimeResult.errors] : staticResult.errors;
  const allWarnings = runtimeResult ? [...staticResult.warnings, ...runtimeResult.warnings] : staticResult.warnings;

  console.log("Mobile web-app sync verification");
  console.log("--------------------------------");
  console.log(
    `Status: inventory=${staticResult.counts.inventory}, scaffolded=${staticResult.counts.scaffolded}, ported=${staticResult.counts.ported}, verified=${staticResult.counts.verified}`,
  );
  console.log(`Web page routes: ${staticResult.pages.length}`);
  console.log(`API contracts checked: ${expectedApiContracts.length}`);

  if (runtimeResult) {
    console.log("\nRuntime smoke");
    for (const check of runtimeResult.checks) {
      if (check.ok) {
        console.log(`- ${check.name}: ${check.status}`);
      } else {
        console.log(`- ${check.name}: failed (${check.error})`);
      }
    }
  }

  if (staticResult.notes.length > 0) {
    console.log("\nNotes");
    for (const note of staticResult.notes) {
      console.log(`- ${note}`);
    }
  }

  if (allWarnings.length > 0) {
    console.log("\nWarnings");
    for (const warning of allWarnings) {
      console.log(`- ${warning}`);
    }
  }

  if (allErrors.length > 0) {
    console.error("\nErrors");
    for (const error of allErrors) {
      console.error(`- ${error}`);
    }
  }
}

const staticResult = checkStaticSync();
const runtimeResult = runtimeEnabled ? await checkRuntimeSmoke() : null;
const report = formatReport(staticResult, runtimeResult);

printSummary(staticResult, runtimeResult);

if (reportPath) {
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report, "utf8");
  console.log(`\nReport written to ${path.relative(root, reportPath).replaceAll(path.sep, "/")}`);
}

const hasErrors = staticResult.errors.length > 0 || (runtimeResult?.errors.length ?? 0) > 0;
if (hasErrors) {
  process.exit(1);
}
