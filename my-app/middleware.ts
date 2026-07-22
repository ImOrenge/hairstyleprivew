import { clerkClient, clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { buildSignInRedirectUrl, getClerkConfigState, isDevClerkSalonUserId } from "./lib/clerk";
import {
  getCanonicalGenerationEntryPath,
  getLegacyGenerationEntrySource,
} from "./lib/canonical-generation-entry";
import { isAuthorizedGenerationWorkflowCallback } from "./lib/generation-workflow-callback-auth";
import { isAccountType, parseOnboardingMetadata } from "./lib/onboarding";
import { getSubscriptionAccessMode } from "./lib/subscription-access";

const { canUseClerkServer: hasClerkConfig } = getClerkConfigState();
const isProtectedRoute = createRouteMatcher([
  "/admin(.*)",
  "/aftercare(.*)",
  "/home(.*)",
  "/upload(.*)",
  "/workspace(.*)",
  "/generate(.*)",
  "/mypage(.*)",
  "/billing/checkout(.*)",
  "/result(.*)",
  "/salon(.*)",
  "/styler(.*)",
  "/api/(.*)",
]);

const isWebhookRoute = createRouteMatcher([
  "/api/payments/webhook",
  "/api/email/inbound/cloudflare",
]);
const isPublicSupportApiRoute = createRouteMatcher([
  "/api/support/faqs",
  "/api/support/posts",
  "/api/support/posts/(.*)",
]);
const isPublicSubscriptionWaitlistRoute = createRouteMatcher([
  "/api/subscription-waitlist",
]);
const isBillingCheckoutRoute = createRouteMatcher(["/billing/checkout(.*)"]);
const isAccountApiRoute = createRouteMatcher(["/api/account"]);
const isMobileApiRoute = createRouteMatcher(["/api/mobile(.*)"]);
const isMobileGenerationApiRoute = createRouteMatcher([
  "/api/prompts/generate",
  "/api/generations(.*)",
]);
const isMemberProfileApiRoute = createRouteMatcher(["/api/member-profile"]);
const isAdminPageRoute = createRouteMatcher(["/admin(.*)"]);
const isAdminNamespaceApiRoute = createRouteMatcher(["/api/admin(.*)"]);
const isAdminApiRoute = createRouteMatcher(["/api/admin(.*)"]);
const isCatalogSecretAdminApiRoute = createRouteMatcher([
  "/api/admin/hairstyles(.*)",
  "/api/admin/fashion(.*)",
]);
const isSalonRoute = createRouteMatcher(["/salon(.*)"]);
const isHomeRoute = createRouteMatcher(["/home(.*)"]);
const isMyPageRoute = createRouteMatcher(["/mypage"]);
const isWorkspaceRoute = createRouteMatcher(["/workspace(.*)"]);

function redirectLegacyGenerationEntry(req: NextRequest) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return null;
  }

  const targetPath = getCanonicalGenerationEntryPath(req.nextUrl.pathname);
  const source = getLegacyGenerationEntrySource(req.nextUrl.pathname);
  if (!targetPath || !source) {
    return null;
  }

  const targetUrl = new URL(targetPath, req.url);
  console.info(
    "[generation-entry] legacy route redirected",
    JSON.stringify({ source, target: targetPath }),
  );

  const response = NextResponse.redirect(targetUrl, 307);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("x-hairfit-generation-entry", `legacy-${source}`);
  return response;
}

function hasValidCatalogAdminSecret(req: NextRequest) {
  const providedSecrets = [
    req.headers.get("x-admin-secret")?.trim() ?? "",
    req.headers.get("apikey")?.trim() ?? "",
    req.headers.get("authorization")?.trim().match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "",
  ].filter(Boolean);
  if (providedSecrets.length === 0) {
    return false;
  }

  const allowedSecrets = [
    process.env.INTERNAL_API_SECRET?.trim() ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "",
  ].filter((secret) => secret && !secret.includes("YOUR_"));

  return allowedSecrets.some((secret) => providedSecrets.includes(secret));
}

function clerkConfigRequiredResponse(req: NextRequest) {
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication is not configured" }, { status: 503 });
  }

  const returnBackPath = `${url.pathname}${url.search}`;
  return NextResponse.redirect(new URL(buildSignInRedirectUrl(returnBackPath), req.url));
}

function isMutationRequest(req: NextRequest) {
  return req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
}

function isPublicWaitlistCheckoutRoute(req: NextRequest) {
  return (
    req.method === "GET" &&
    isBillingCheckoutRoute(req) &&
    getSubscriptionAccessMode() === "waitlist"
  );
}

function getMobileCorsHeaders(req: NextRequest) {
  const headers = new Headers();
  const origin = req.headers.get("origin");

  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  headers.set("Access-Control-Max-Age", "600");
  return headers;
}

function isMobileSessionApiRoute(req: NextRequest) {
  return (
    isMobileApiRoute(req) ||
    isMobileGenerationApiRoute(req) ||
    isMemberProfileApiRoute(req) ||
    isAccountApiRoute(req)
  );
}

function withMobileCors(req: NextRequest, response: NextResponse) {
  if (!isMobileSessionApiRoute(req)) {
    return response;
  }

  getMobileCorsHeaders(req).forEach((value, key) => {
    response.headers.set(key, value);
  });
  return response;
}

function mobileCorsPreflight(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getMobileCorsHeaders(req),
  });
}

async function loadDbAccount(userId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    return null;
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const { data, error } = await supabase
      .from("users")
      .select("account_type")
      .eq("id", userId)
      .maybeSingle<{ account_type?: string | null }>();

    if (error) {
      console.error("[middleware] Failed to read DB role", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("[middleware] Failed to create Supabase role client", error);
    return null;
  }
}

const clerkAppMiddleware = hasClerkConfig
  ? clerkMiddleware(async (auth, req) => {
      const legacyGenerationRedirect = redirectLegacyGenerationEntry(req);
      if (legacyGenerationRedirect) {
        return legacyGenerationRedirect;
      }

      if (isMobileSessionApiRoute(req) && req.method === "OPTIONS") {
        return mobileCorsPreflight(req);
      }

      if (await isAuthorizedGenerationWorkflowCallback(req)) {
        return NextResponse.next();
      }

      if (
        !isProtectedRoute(req) ||
        isWebhookRoute(req) ||
        isPublicWaitlistCheckoutRoute(req) ||
        (isPublicSupportApiRoute(req) && !isMutationRequest(req)) ||
        (isPublicSubscriptionWaitlistRoute(req) && req.method === "POST")
      ) {
        return withMobileCors(req, NextResponse.next());
      }

      if (isCatalogSecretAdminApiRoute(req) && hasValidCatalogAdminSecret(req)) {
        return withMobileCors(req, NextResponse.next());
      }

      const authObject = isMobileSessionApiRoute(req)
        ? await auth({ acceptsToken: "session_token" })
        : await auth();
      const { userId } = authObject;
      const returnBackPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
      const isApiRequest = req.nextUrl.pathname.startsWith("/api/");
      if (!userId) {
        if (isApiRequest) {
          return withMobileCors(req, NextResponse.json({ error: "Authentication required" }, { status: 401 }));
        }

        return NextResponse.redirect(new URL(buildSignInRedirectUrl(returnBackPath), req.url));
      }

      try {
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        const metadata = parseOnboardingMetadata(user.publicMetadata);
        const dbAccount = await loadDbAccount(userId);
        const dbAccountType = isAccountType(dbAccount?.account_type) ? dbAccount.account_type : null;
        const effectiveAccountType = isDevClerkSalonUserId(userId)
          ? "salon_owner"
          : dbAccountType ?? metadata.accountType;
        const adminPageRequest = isAdminPageRoute(req);
        const adminApiRequest = isAdminApiRoute(req) && !isCatalogSecretAdminApiRoute(req);
        const adminRestrictedRequest = adminPageRequest || adminApiRequest;
        const adminNamespaceApiRequest = isAdminNamespaceApiRoute(req);

        if (isApiRequest && effectiveAccountType === "admin" && isMutationRequest(req) && !adminNamespaceApiRequest) {
          return withMobileCors(
            req,
            NextResponse.json(
              { error: "Admin writes are only allowed through admin APIs" },
              { status: 403 },
            ),
          );
        }

        if (adminRestrictedRequest && effectiveAccountType !== "admin") {
          if (adminApiRequest) {
            return withMobileCors(req, NextResponse.json({ error: "Admin account required" }, { status: 403 }));
          }

          return NextResponse.redirect(new URL("/home", req.url));
        }

        if (isSalonRoute(req) && effectiveAccountType !== "salon_owner" && effectiveAccountType !== "admin") {
          return NextResponse.redirect(new URL("/home", req.url));
        }

        if (isHomeRoute(req) && effectiveAccountType === "salon_owner") {
          return NextResponse.redirect(new URL("/salon/customers", req.url));
        }

        if (isMyPageRoute(req) && effectiveAccountType === "salon_owner") {
          return NextResponse.redirect(new URL("/salon/customers", req.url));
        }

        if (isWorkspaceRoute(req) && effectiveAccountType === "salon_owner") {
          return NextResponse.redirect(new URL("/salon/customers", req.url));
        }
      } catch (error) {
        console.error("[middleware] Failed to read account metadata", error);
      }

      return withMobileCors(req, NextResponse.next());
    })
  : null;

const proxy = hasClerkConfig && clerkAppMiddleware
  ? (req: NextRequest, event: NextFetchEvent) => {
      return clerkAppMiddleware(req, event);
    }
  : async (req: NextRequest) => {
      const legacyGenerationRedirect = redirectLegacyGenerationEntry(req);
      if (legacyGenerationRedirect) {
        return legacyGenerationRedirect;
      }

      if (isMobileSessionApiRoute(req) && req.method === "OPTIONS") {
        return mobileCorsPreflight(req);
      }

      if (await isAuthorizedGenerationWorkflowCallback(req)) {
        return NextResponse.next();
      }

      if (
        !isProtectedRoute(req) ||
        isWebhookRoute(req) ||
        isPublicWaitlistCheckoutRoute(req) ||
        (isPublicSupportApiRoute(req) && !isMutationRequest(req)) ||
        (isPublicSubscriptionWaitlistRoute(req) && req.method === "POST")
      ) {
        return withMobileCors(req, NextResponse.next());
      }

      if (isCatalogSecretAdminApiRoute(req) && hasValidCatalogAdminSecret(req)) {
        return withMobileCors(req, NextResponse.next());
      }

      return withMobileCors(req, clerkConfigRequiredResponse(req));
    };

export default proxy;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
