import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const webAppRoot = path.join(root, "my-app", "app");
const nativeAppRoot = path.join(root, "apps", "hairfit-app");
const mapPath = path.join(root, "docs", "mobile-port-map.md");
const apiClientPath = path.join(root, "packages", "api-client", "src", "index.ts");
const nativeUiPath = path.join(root, "packages", "ui-native", "src", "index.tsx");
const nativeUiBridgePath = path.join(nativeAppRoot, "lib", "ui-native.tsx");
const appScreenPath = path.join(nativeAppRoot, "components", "app", "AppScreen.tsx");
const formScreenPath = path.join(nativeAppRoot, "components", "app", "FormScreen.tsx");
const sharedIndexPath = path.join(root, "packages", "shared", "src", "index.ts");
const generationContractPath = path.join(root, "packages", "shared", "src", "generation", "contract.ts");
const billingContractPath = path.join(root, "packages", "shared", "src", "billing", "policy-selectors.ts");
const rootPackagePath = path.join(root, "package.json");
const nativePackagePath = path.join(nativeAppRoot, "package.json");
const nativeAppJsonPath = path.join(nativeAppRoot, "app.json");

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
const metroStatusUrls = explicitMetroStatusUrl ? [explicitMetroStatusUrl] : ["http://localhost:8084/status"];

const expectedAppIdentity = {
  packageName: "@hairfit/app",
  slug: "hairfit-app",
  scheme: "hairfit",
  bundleIdentifier: "com.hairfit.app",
  androidPackage: "com.hairfit.app",
};

const removedAppDirs = ["apps/customer-mobile", "apps/admin-mobile", "apps/salon-mobile"];

const expectedRoutes = [
  {
    route: "/",
    file: "apps/hairfit-app/app/index.tsx",
    markers: ["getMobileMe", "MobileBootstrap", "/salon/customers", "/admin", "onRequestClose", "onAccessibilityEscape", "useNetworkRecovery", "recoveryToken"],
  },
  {
    route: "/account",
    file: "apps/hairfit-app/app/account.tsx",
    markers: ["getMobileMe", "signOut", "getRoleHomeRoute"],
    relatedFiles: [
      {
        file: "apps/hairfit-app/app/_layout.tsx",
        markers: ["RoleNavigationScaffold", "<Stack screenOptions={{ headerShown: false }} />", "NetworkRecoveryProvider"],
      },
      {
        file: "apps/hairfit-app/components/app/RoleNavigationScaffold.tsx",
        markers: ['accessibilityRole="tablist"', 'accessibilityRole="tab"', "router.replace"],
      },
      {
        file: "apps/hairfit-app/lib/role-navigation.ts",
        markers: ["getRoleNavigationItems", "isRoleNavigationHidden", "resolveRoleNavigationRole"],
      },
    ],
  },
  {
    route: "/login",
    file: "apps/hairfit-app/app/(auth)/login.tsx",
    markers: ["validateLoginFields", "mapAuthFormError", "beginSecondFactor", "AuthSecondFactorPanel", "errorFocusRequest"],
    relatedFiles: [
      {
        file: "apps/hairfit-app/lib/auth-form.ts",
        markers: ["validateLoginFields", "validateSignupFields", "mapAuthFormError"],
      },
    ],
  },
  {
    route: "/forgot-password",
    file: "apps/hairfit-app/app/(auth)/forgot-password.tsx",
    markers: ["findPasswordResetEmailFactor", "resetPassword", "beginSecondFactor", "consumeAuthResumePath"],
    relatedFiles: [
      {
        file: "apps/hairfit-app/components/auth/AuthSecondFactorPanel.tsx",
        markers: ["accessibilityState", "TextField", "onSelect", "onCancel"],
      },
      {
        file: "apps/hairfit-app/lib/auth-resume.ts",
        markers: ["AUTH_RESUME_WINDOW_MS", "pending-resume-target.v2", "signOutAndClearAuthResume"],
      },
    ],
  },
  {
    route: "/signup",
    file: "apps/hairfit-app/app/(auth)/signup.tsx",
    markers: ["validateSignupFields", "mapAuthFormError", "errorFocusRequest"],
  },
  {
    route: "/upload",
    file: "apps/hairfit-app/app/upload.tsx",
    markers: [
      "prepareGenerationDraft",
      "isUploadingPortrait",
      "useSafeBackNavigation",
      "PhotoLibraryPermissionRecovery",
      "usePhotoLibraryPermissionRecovery",
      "mapMobileUserError",
    ],
    relatedFiles: [
      {
        file: "apps/hairfit-app/hooks/useSafeBackNavigation.ts",
        markers: ["BackHandler.addEventListener", '"hardwareBackPress"', "router.canGoBack", "consumeSafeBackNavigation"],
      },
      {
        file: "apps/hairfit-app/lib/photo-library-permission.ts",
        markers: ["canAskAgain", ': "settings"', "openPhotoLibrarySettings"],
      },
      {
        file: "apps/hairfit-app/hooks/usePhotoLibraryPermissionRecovery.ts",
        markers: ["getPhotoLibraryPermissionState", "photoPermissionRequiresSettings", "Linking.openSettings"],
      },
      {
        file: "apps/hairfit-app/lib/mobile-user-message.ts",
        markers: ["mapMobileUserError", "status === 401", "status === 413", "status === 429"],
      },
      {
        file: "apps/hairfit-app/components/app/PhotoLibraryPermissionRecovery.tsx",
        markers: ["앱 설정 열기", 'accessibilityLiveRegion="polite"', "onOpenSettings"],
      },
    ],
  },
  {
    route: "/personal-color",
    file: "apps/hairfit-app/app/personal-color.tsx",
    markers: [
      "PersonalColorDiagnosisProgress",
      "PersonalColorSwatchAnalysisColumn",
      "PhotoLibraryPermissionRecovery",
      "usePhotoLibraryPermissionRecovery",
      "mapMobileUserError",
    ],
    relatedFiles: [
      {
        file: "apps/hairfit-app/components/PersonalColorDiagnosisProgress.tsx",
        markers: [
          "useReducedMotionPreference",
          "accessibilityValue",
          "팔레트 비교 과정",
          "실제 측정 점수가 아닙니다",
        ],
      },
      {
        file: "apps/hairfit-app/hooks/useReducedMotionPreference.ts",
        markers: [
          "AccessibilityInfo.isReduceMotionEnabled",
          '"reduceMotionChanged"',
          "resolveMotionAwareModalAnimation",
        ],
      },
    ],
  },
  {
    route: "/generate",
    file: "apps/hairfit-app/app/generate.tsx",
    markers: ["createPaidActionQuote", "acceptGenerationDraft", "draftReceiptHydrated", "acceptedAt", "useSafeBackNavigation"],
  },
  {
    route: "/generate/[id]",
    file: "apps/hairfit-app/app/generate/[id].tsx",
    markers: ["getGenerationStatus", "AppState.addEventListener", "백그라운드 생성 중", "useSafeBackNavigation", "networkAvailability", "recoveryToken"],
  },
  {
    route: "/styler/new",
    file: "apps/hairfit-app/app/styler/new.tsx",
    markers: ["MobileStylerNewFeature"],
    relatedFiles: [
      {
        file: "apps/hairfit-app/components/styler/MobileStylerNewFeature.tsx",
        markers: ["useSafeBackNavigation", "isBackNavigationBlocked", "notifyBackNavigationBlocked"],
      },
      {
        file: "apps/hairfit-app/components/styler/useMobileStylerNewController.ts",
        markers: ["usePhotoLibraryPermissionRecovery", "mapMobileUserError", "openBodyPhotoPermissionSettings", "deleteBodyPhoto", "hairListError"],
      },
      {
        file: "packages/api-client/src/index.ts",
        markers: ["deleteBodyPhoto()"],
      },
      {
        file: "apps/hairfit-app/components/styler/MobileStylerNewView.tsx",
        markers: ["PhotoLibraryPermissionRecovery", "photoPermissionRequiresSettings", "전신 사진 개인정보 안내", "3 견적·생성"],
      },
      {
        file: "apps/hairfit-app/components/styler/MobileStylerHairSelectionModal.tsx",
        markers: ["onRequestClose={onClose}", "onAccessibilityEscape={onClose}", "최근 완성 결과에서 하나를 선택하세요", 'accessibilityLiveRegion="assertive"'],
      },
    ],
  },
  {
    route: "/styler/[id]",
    file: "apps/hairfit-app/app/styler/[id].tsx",
    markers: ["MobileStylerSessionFeature"],
    relatedFiles: [
      {
        file: "apps/hairfit-app/components/styler/useMobileStylerSessionController.ts",
        markers: ["mapMobileUserError", "refreshSession({ silent: true })", "stylingQuoteRefreshMessage"],
      },
      {
        file: "apps/hairfit-app/components/styler/MobileStylerSessionView.tsx",
        markers: ["생성 실패 안내", 'accessibilityLiveRegion="assertive"', 'accessibilityRole="image"'],
      },
    ],
  },
  {
    route: "/mypage",
    file: "apps/hairfit-app/app/mypage.tsx",
    markers: ['getMobileDashboard("customer")', "MobileMyPageActivePanel", "MobileMyPageTabNavigation"],
    relatedFiles: [
      {
        file: "apps/hairfit-app/lib/mypage.ts",
        markers: ["generationDestination", "getMobileMyPageTabHref"],
      },
      {
        file: "apps/hairfit-app/components/mypage/panels/MobileMyPagePlanPanel.tsx",
        markers: ['router.push("/billing")'],
      },
    ],
  },
  {
    route: "/billing",
    file: "apps/hairfit-app/app/billing.tsx",
    markers: [
      'getMobileDashboard("customer")',
      "creditPolicy",
      "prepareMobilePayment",
      "completeMobilePayment",
      'router.replace("/mypage?tab=plan")',
      "useSafeBackNavigation",
    ],
  },
  {
    route: "/payments/complete",
    file: "apps/hairfit-app/app/payments/complete.tsx",
    markers: ["completePendingPaymentCallback", "isVerifying", "useSafeBackNavigation"],
  },
  { route: "/salon", file: "apps/hairfit-app/app/salon/index.tsx", markers: ['getMobileDashboard("salon")', 'router.push("/salon/customers")'] },
  {
    route: "/salon/customers",
    file: "apps/hairfit-app/app/salon/customers/index.tsx",
    markers: ["listSalonCustomers", "pendingAftercare", "/salon/customers/"],
  },
  { route: "/admin", file: "apps/hairfit-app/app/admin/index.tsx", markers: ['getMobileDashboard("admin")', 'router.push("/admin/stats")'] },
  {
    route: "/admin/stats",
    file: "apps/hairfit-app/app/admin/stats.tsx",
    markers: ['getMobileDashboard("admin", { range })', "daily.map", "maxDaily", "DimensionValue"],
  },
];

const expectedApiContracts = [
  { route: "/api/mobile/me", file: "my-app/app/api/mobile/me/route.ts", clientMethod: "getMobileMe", clientPath: "/api/mobile/me" },
  {
    route: "/api/mobile/dashboard",
    file: "my-app/app/api/mobile/dashboard/route.ts",
    clientMethod: "getMobileDashboard",
    clientPath: "/api/mobile/dashboard?${params.toString()}",
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
    route: "/api/generations/start",
    file: "my-app/app/api/generations/start/route.ts",
    clientMethod: "startGeneration",
    clientPath: "/api/generations/start",
  },
  {
    route: "/api/generations/[id]/status",
    file: "my-app/app/api/generations/[id]/status/route.ts",
    clientMethod: "getGenerationStatus",
    clientPath: "/api/generations/${encodeURIComponent(generationId)}/status",
  },
  { route: "/api/mobile/aftercare", file: "my-app/app/api/mobile/aftercare/route.ts", clientMethod: "getAftercareRecords", clientPath: "/api/mobile/aftercare" },
];

const expectedNativePrimitiveMarkers = [
  'background: "#f6f5f1"',
  'background: "#050505"',
  "export function MetricGrid",
  "export function MetricTile",
  "export interface TextFieldProps extends TextInputProps",
  "forwardRef<TextInput, TextFieldProps>",
  "error?: ReactNode",
  "aria-describedby",
  "aria-errormessage",
  "allowFontScaling",
  "shouldStackDenseNativeLayout",
  'accessibilityLiveRegion="polite"',
  'accessibilityRole = "button"',
  "accessibilityRole={accessibilityRole}",
  "export interface ButtonProps extends Omit<PressableProps",
  "loading?: boolean",
  "busy: loading",
];

const forbiddenNativeUiMarkers = [
  "export function Screen",
  "export function AppScreen",
  "HeaderNavigationProvider",
  "SafeAreaView",
  "screenPattern",
];

const expectedUiBridgeMarkers = [
  'export * from "../../../packages/ui-native/src/index"',
  "AppScreen as Screen",
  'from "../components/app/AppScreen"',
  "RoleNavigationScaffold",
];

const expectedAppScreenMarkers = [
  "export function AppScreen",
  "SafeAreaView",
  "PatternLayer",
  "footerOverlay?: ReactNode",
  "인터넷 연결이 끊겼습니다",
  'accessibilityLiveRegion="assertive"',
];

const expectedFormScreenMarkers = [
  "errorFocusRef",
  "errorFocusRequest",
  ".focus()",
];

const expectedGenerationContractMarkers = [
  'export const GENERATION_STATUSES = ["queued", "processing", "completed", "failed"]',
  "export function normalizeGenerationStatus",
  "export function generationDestination",
  "export function isGenerationSelectionLocked",
];

const expectedBillingContractMarkers = [
  "export interface ProductCreditPolicySnapshot",
  "export const DEFAULT_PRODUCT_CREDIT_POLICY",
  "export function estimateHairstyleGenerations",
  "export function aftercareProgramCredits",
];

function readArgValue(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] || null;
}

function readText(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
}

function readJson(filePath) {
  const text = readText(filePath);
  if (!text) return null;
  return JSON.parse(text);
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
  const relative = path.relative(webAppRoot, filePath).replaceAll(path.sep, "/");
  const withoutMarker = relative.slice(0, -marker.length);
  const parts = withoutMarker
    .split("/")
    .filter(Boolean)
    .filter((part) => !(part.startsWith("(") && part.endsWith(")")));

  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

function parsePortMap() {
  const text = readText(mapPath);
  if (text === null) {
    return { rows: [], missing: true };
  }

  const rows = [];
  const rowPattern = /^\|\s*(?<source>[^|]+?)\s*\|\s*(?<target>[^|]+?)\s*\|\s*(?<service>[^|]+?)\s*\|\s*(?<status>[^|]+?)\s*\|(?<notes>.*)\|$/;

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(rowPattern);
    if (!match?.groups) continue;

    const source = stripCell(match.groups.source);
    const target = stripCell(match.groups.target);
    const service = stripCell(match.groups.service);
    const status = stripCell(match.groups.status);
    if (source === "Web route" || source === "---" || status === "---") continue;

    rows.push({ source, target, service, status, notes: match.groups.notes.trim() });
  }

  return { rows, missing: false };
}

function stripCell(value) {
  const trimmed = value.trim();
  return trimmed.startsWith("`") && trimmed.endsWith("`") ? trimmed.slice(1, -1) : trimmed;
}

function statusCounts(rows) {
  return rows.reduce(
    (acc, row) => {
      if (row.status in acc) acc[row.status] += 1;
      return acc;
    },
    { inventory: 0, scaffolded: 0, ported: 0, verified: 0 },
  );
}

function checkStaticSync() {
  const errors = [];
  const warnings = [];
  const notes = [];
  const checks = [];
  const map = parsePortMap();
  const rows = map.rows;
  const counts = statusCounts(rows);
  const rootPackage = readJson(rootPackagePath);
  const nativePackage = readJson(nativePackagePath);
  const nativeAppJson = readJson(nativeAppJsonPath);
  const rootPackageText = readText(rootPackagePath) ?? "";
  const apiClientText = readText(apiClientPath) ?? "";
  const nativeUiText = readText(nativeUiPath) ?? "";
  const nativeUiBridgeText = readText(nativeUiBridgePath) ?? "";
  const appScreenText = readText(appScreenPath) ?? "";
  const formScreenText = readText(formScreenPath) ?? "";
  const sharedIndexText = readText(sharedIndexPath) ?? "";
  const generationContractText = readText(generationContractPath) ?? "";
  const billingContractText = readText(billingContractPath) ?? "";
  const pages = walk(webAppRoot, (file) => file.endsWith("page.tsx")).map((file) => normalizeRoute(file, "page.tsx"));

  if (map.missing) errors.push("docs/mobile-port-map.md is missing.");
  if (!existsSync(nativeAppRoot)) errors.push("Unified native app directory is missing: apps/hairfit-app.");

  for (const dir of removedAppDirs) {
    const ok = !existsSync(path.join(root, dir));
    checks.push({ label: `${dir} removed`, ok });
    if (!ok) errors.push(`Removed split app directory still exists: ${dir}`);
  }

  if (nativePackage?.name !== expectedAppIdentity.packageName) {
    errors.push(`Native package name must be ${expectedAppIdentity.packageName}.`);
  }
  if (nativeAppJson?.expo?.slug !== expectedAppIdentity.slug) {
    errors.push(`Expo slug must be ${expectedAppIdentity.slug}.`);
  }
  if (nativeAppJson?.expo?.scheme !== expectedAppIdentity.scheme) {
    errors.push(`Expo scheme must remain ${expectedAppIdentity.scheme}.`);
  }
  if (nativeAppJson?.expo?.ios?.bundleIdentifier !== expectedAppIdentity.bundleIdentifier) {
    errors.push(`iOS bundleIdentifier must be ${expectedAppIdentity.bundleIdentifier}.`);
  }
  if (nativeAppJson?.expo?.android?.package !== expectedAppIdentity.androidPackage) {
    errors.push(`Android package must be ${expectedAppIdentity.androidPackage}.`);
  }

  for (const marker of ["@hairfit/admin-mobile", "@hairfit/customer-mobile", "@hairfit/salon-mobile", "mobile:admin", "mobile:customer", "mobile:salon"]) {
    if (rootPackageText.includes(marker)) {
      errors.push(`Root package still references split mobile app marker: ${marker}`);
    }
  }

  if (rootPackage?.scripts?.mobile !== "npm --workspace @hairfit/app run start --") {
    errors.push("Root mobile script must run @hairfit/app.");
  }
  if (rootPackage?.scripts?.["mobile:android"] !== "npm --workspace @hairfit/app run android --") {
    errors.push("Root mobile:android script must run @hairfit/app.");
  }
  if (rootPackage?.scripts?.["mobile:ios"] !== "npm --workspace @hairfit/app run ios --") {
    errors.push("Root mobile:ios script must run @hairfit/app.");
  }

  for (const contract of expectedRoutes) {
    const fullPath = path.join(root, contract.file);
    const text = readText(fullPath);
    const exists = text !== null;
    checks.push({ label: `${contract.route} route exists`, ok: exists });
    if (!exists) {
      errors.push(`Missing native route file: ${contract.file}`);
      continue;
    }

    for (const marker of contract.markers) {
      const ok = text.includes(marker);
      checks.push({ label: `${contract.route} includes ${marker}`, ok });
      if (!ok) errors.push(`${contract.file} is missing marker: ${marker}`);
    }

    for (const related of contract.relatedFiles ?? []) {
      const relatedText = readText(path.join(root, related.file));
      const relatedExists = relatedText !== null;
      checks.push({
        label: `${contract.route} related file ${related.file} exists`,
        ok: relatedExists,
      });
      if (!relatedExists) {
        errors.push(`Missing native route dependency: ${related.file}`);
        continue;
      }

      for (const marker of related.markers) {
        const ok = relatedText.includes(marker);
        checks.push({ label: `${contract.route} related file includes ${marker}`, ok });
        if (!ok) errors.push(`${related.file} is missing marker: ${marker}`);
      }
    }
  }

  for (const row of rows.filter((row) => row.source.startsWith("/") && !row.source.startsWith("/api/") && row.status !== "inventory")) {
    const ok = existsSync(path.join(root, row.target));
    checks.push({ label: `${row.source} mapped target exists`, ok });
    if (!ok) errors.push(`Active mobile target missing: ${row.source} -> ${row.target}`);
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

  for (const marker of expectedNativePrimitiveMarkers) {
    const ok = nativeUiText.includes(marker);
    checks.push({ label: `native primitive marker ${marker}`, ok });
    if (!ok) errors.push(`Native UI primitive package missing marker: ${marker}`);
  }

  for (const marker of ["response.status === 401", "skipCache: true"]) {
    const ok = apiClientText.includes(marker);
    checks.push({ label: `API auth recovery marker ${marker}`, ok });
    if (!ok) errors.push(`API client auth recovery is missing marker: ${marker}`);
  }

  for (const marker of forbiddenNativeUiMarkers) {
    const ok = !nativeUiText.includes(marker);
    checks.push({ label: `native primitive package excludes ${marker}`, ok });
    if (!ok) errors.push(`Native UI primitive package still owns app-shell marker: ${marker}`);
  }

  for (const marker of expectedUiBridgeMarkers) {
    const ok = nativeUiBridgeText.includes(marker);
    checks.push({ label: `native UI bridge marker ${marker}`, ok });
    if (!ok) errors.push(`Native UI app bridge missing marker: ${marker}`);
  }

  for (const marker of expectedAppScreenMarkers) {
    const ok = appScreenText.includes(marker);
    checks.push({ label: `AppScreen marker ${marker}`, ok });
    if (!ok) errors.push(`App-owned Screen implementation missing marker: ${marker}`);
  }

  for (const marker of expectedFormScreenMarkers) {
    const ok = formScreenText.includes(marker);
    checks.push({ label: `FormScreen marker ${marker}`, ok });
    if (!ok) errors.push(`App-owned FormScreen implementation missing marker: ${marker}`);
  }

  for (const marker of expectedGenerationContractMarkers) {
    const ok = generationContractText.includes(marker);
    checks.push({ label: `shared generation contract ${marker}`, ok });
    if (!ok) errors.push(`Shared generation contract missing marker: ${marker}`);
  }

  for (const marker of expectedBillingContractMarkers) {
    const ok = billingContractText.includes(marker);
    checks.push({ label: `shared billing contract ${marker}`, ok });
    if (!ok) errors.push(`Shared billing contract missing marker: ${marker}`);
  }

  for (const marker of [
    'export * from "./billing/policy-selectors"',
    'export * from "./generation/contract"',
  ]) {
    const ok = sharedIndexText.includes(marker);
    checks.push({ label: `shared package export ${marker}`, ok });
    if (!ok) errors.push(`Shared package index missing contract export: ${marker}`);
  }

  const mapText = readText(mapPath) ?? "";
  for (const marker of removedAppDirs) {
    if (mapText.includes(marker)) {
      errors.push(`Mobile port map still references removed app directory: ${marker}`);
    }
  }

  if (counts.verified === 0) {
    warnings.push("No mobile route is marked verified yet. Runtime E2E evidence is still required before promoting rows.");
  }

  notes.push(`Web page routes inventoried: ${pages.length}`);

  return { errors, warnings, notes, checks, rows, counts, pages };
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
  const base = apiBaseUrl.replace(/\/+$/, "");

  for (const check of [
    { name: "mobile me unauth", url: `${base}/api/mobile/me`, expectedStatus: 401 },
    { name: "customer dashboard unauth", url: `${base}/api/mobile/dashboard?service=customer`, expectedStatus: 401 },
  ]) {
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

  const metro =
    metroAttempts.find((attempt) => attempt.ok && attempt.status === 200 && attempt.text.includes("packager-status:running")) ||
    metroAttempts[0];
  checks.push(metro);

  if (!metro.ok) {
    const message = `Expo Metro status failed to connect: ${metro.error}`;
    if (strictRuntime) errors.push(message);
    else warnings.push(message);
  } else if (metro.status !== 200 || !metro.text.includes("packager-status:running")) {
    const message = `Expo Metro status expected 200 packager-status:running but received ${metro.status}.`;
    if (strictRuntime) errors.push(message);
    else warnings.push(message);
  }

  return { checks, errors, warnings };
}

function formatList(items, empty = "None") {
  return items.length === 0 ? `- ${empty}` : items.map((item) => `- ${item}`).join("\n");
}

function formatReport(staticResult, runtimeResult) {
  const allErrors = runtimeResult ? [...staticResult.errors, ...runtimeResult.errors] : staticResult.errors;
  const allWarnings = runtimeResult ? [...staticResult.warnings, ...runtimeResult.warnings] : staticResult.warnings;
  const runtimeLines = runtimeResult
    ? runtimeResult.checks.map((check) => (check.ok ? `- ${check.name}: ${check.status}` : `- ${check.name}: failed (${check.error})`))
    : [
        "- Not run. No runtime claim is made by this report.",
        "- Use `npm run mobile:sync:runtime` when the local API and Metro are already running.",
      ];
  const verdict =
    allErrors.length > 0
      ? "FAIL"
      : !runtimeResult
        ? "STATIC CONTRACT PASS"
        : runtimeResult.warnings.length > 0
          ? "STATIC PASS; RUNTIME SMOKE PARTIAL"
          : "STATIC + RUNTIME SMOKE PASS";

  return `# Mobile Web-App Sync Verification Report

Generated: ${new Date().toISOString()}

## Verdict

${verdict}

This report is a source-contract and availability smoke report. It is not an authenticated native-device E2E result, and it does not promote any route to \`verified\`.

## Status Counts

- inventory: ${staticResult.counts.inventory}
- scaffolded: ${staticResult.counts.scaffolded}
- ported: ${staticResult.counts.ported}
- verified: ${staticResult.counts.verified}

## Static Contract Checks

- Native target: apps/hairfit-app
- Web page routes inventoried: ${staticResult.pages.length}
- Checks passed: ${staticResult.checks.filter((check) => check.ok).length}/${staticResult.checks.length}
- Scope: source files, route map, package ownership, and shared contract markers only

## Runtime Smoke

${runtimeLines.join("\n")}

## Errors

${formatList(allErrors)}

## Warnings

${formatList(allWarnings)}

## Notes

${formatList(staticResult.notes)}
`;
}

function printSummary(staticResult, runtimeResult) {
  const allErrors = runtimeResult ? [...staticResult.errors, ...runtimeResult.errors] : staticResult.errors;
  const allWarnings = runtimeResult ? [...staticResult.warnings, ...runtimeResult.warnings] : staticResult.warnings;

  console.log("Mobile web-app sync verification");
  console.log("--------------------------------");
  console.log("Native target: apps/hairfit-app");
  console.log(
    `Status: inventory=${staticResult.counts.inventory}, scaffolded=${staticResult.counts.scaffolded}, ported=${staticResult.counts.ported}, verified=${staticResult.counts.verified}`,
  );
  console.log(`Checks passed: ${staticResult.checks.filter((check) => check.ok).length}/${staticResult.checks.length}`);

  if (runtimeResult) {
    console.log("\nRuntime smoke");
    for (const check of runtimeResult.checks) {
      console.log(check.ok ? `- ${check.name}: ${check.status}` : `- ${check.name}: failed (${check.error})`);
    }
  }

  if (staticResult.notes.length > 0) {
    console.log("\nNotes");
    for (const note of staticResult.notes) console.log(`- ${note}`);
  }

  if (allWarnings.length > 0) {
    console.log("\nWarnings");
    for (const warning of allWarnings) console.log(`- ${warning}`);
  }

  if (allErrors.length > 0) {
    console.error("\nErrors");
    for (const error of allErrors) console.error(`- ${error}`);
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

if (staticResult.errors.length > 0 || (runtimeResult?.errors.length ?? 0) > 0) {
  process.exit(1);
}
