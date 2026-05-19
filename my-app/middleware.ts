import { clerkClient, clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { buildSignInRedirectUrl, getClerkConfigState, isDevClerkSalonUserId } from "./lib/clerk";
import { isAccountType, parseOnboardingMetadata } from "./lib/onboarding";
import { enforceTrafficGuard, withTrafficSecurityHeaders } from "./lib/traffic-guard";

const { canUseClerkServer: hasClerkConfig } = getClerkConfigState();
const isProtectedRoute = createRouteMatcher([
  "/admin(.*)",
  "/aftercare(.*)",
  "/home(.*)",
  "/upload(.*)",
  "/workspace(.*)",
  "/generate(.*)",
  "/mypage(.*)",
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
const isAccountApiRoute = createRouteMatcher(["/api/account"]);
const isMobileApiRoute = createRouteMatcher(["/api/mobile(.*)"]);
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

function clerkConfigRequiredResponse(req: NextRequest) {
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication is not configured" }, { status: 503 });
  }

  return NextResponse.redirect(new URL("/login", req.url));
}

function isMutationRequest(req: NextRequest) {
  return req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
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
  return isMobileApiRoute(req) || isMemberProfileApiRoute(req) || isAccountApiRoute(req);
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

function withResponseGuards(req: NextRequest, response: NextResponse) {
  return withTrafficSecurityHeaders(req, withMobileCors(req, response));
}

function mobileCorsPreflight(req: NextRequest) {
  return withResponseGuards(req, new NextResponse(null, {
    status: 204,
    headers: getMobileCorsHeaders(req),
  }));
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
      const trafficGuardResponse = enforceTrafficGuard(req);
      if (trafficGuardResponse) {
        return withResponseGuards(req, trafficGuardResponse);
      }

      if (isMobileSessionApiRoute(req) && req.method === "OPTIONS") {
        return mobileCorsPreflight(req);
      }

      if (!isProtectedRoute(req) || isWebhookRoute(req) || (isPublicSupportApiRoute(req) && !isMutationRequest(req))) {
        return withResponseGuards(req, NextResponse.next());
      }

      const authObject = isMobileSessionApiRoute(req)
        ? await auth({ acceptsToken: "session_token" })
        : await auth();
      const { userId } = authObject;
      const returnBackPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
      const isApiRequest = req.nextUrl.pathname.startsWith("/api/");
      if (!userId) {
        if (isApiRequest) {
          return withResponseGuards(req, NextResponse.json({ error: "Authentication required" }, { status: 401 }));
        }

        return withResponseGuards(req, NextResponse.redirect(new URL(buildSignInRedirectUrl(returnBackPath), req.url)));
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
          return withResponseGuards(
            req,
            NextResponse.json(
              { error: "Admin writes are only allowed through admin APIs" },
              { status: 403 },
            ),
          );
        }

        if (adminRestrictedRequest && effectiveAccountType !== "admin") {
          if (adminApiRequest) {
            return withResponseGuards(req, NextResponse.json({ error: "Admin account required" }, { status: 403 }));
          }

          return withResponseGuards(req, NextResponse.redirect(new URL("/home", req.url)));
        }

        if (isSalonRoute(req) && effectiveAccountType !== "salon_owner" && effectiveAccountType !== "admin") {
          return withResponseGuards(req, NextResponse.redirect(new URL("/home", req.url)));
        }

        if (isHomeRoute(req) && effectiveAccountType === "salon_owner") {
          return withResponseGuards(req, NextResponse.redirect(new URL("/salon/customers", req.url)));
        }

        if (isMyPageRoute(req) && effectiveAccountType === "salon_owner") {
          return withResponseGuards(req, NextResponse.redirect(new URL("/salon/customers", req.url)));
        }

        if (isWorkspaceRoute(req) && effectiveAccountType === "salon_owner") {
          return withResponseGuards(req, NextResponse.redirect(new URL("/salon/customers", req.url)));
        }
      } catch (error) {
        console.error("[middleware] Failed to read account metadata", error);
      }

      return withResponseGuards(req, NextResponse.next());
    })
  : null;

const proxy = hasClerkConfig && clerkAppMiddleware
  ? (req: NextRequest, event: NextFetchEvent) => {
      return clerkAppMiddleware(req, event);
    }
  : (req: NextRequest) => {
      const trafficGuardResponse = enforceTrafficGuard(req);
      if (trafficGuardResponse) {
        return withResponseGuards(req, trafficGuardResponse);
      }

      if (isMobileSessionApiRoute(req) && req.method === "OPTIONS") {
        return mobileCorsPreflight(req);
      }

      if (!isProtectedRoute(req) || isWebhookRoute(req) || (isPublicSupportApiRoute(req) && !isMutationRequest(req))) {
        return withResponseGuards(req, NextResponse.next());
      }

      return withResponseGuards(req, clerkConfigRequiredResponse(req));
    };

export default proxy;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
