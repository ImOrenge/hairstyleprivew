import { clerkClient, clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { buildSignInRedirectUrl, getClerkConfigState, isDevClerkSalonUserId } from "./lib/clerk";
import {
  buildOnboardingRedirectUrl,
  isAccountType,
  isMemberStyleTarget,
  MEMBER_GENDER_REQUIRED_CODE,
  normalizeAppPath,
  parseOnboardingMetadata,
} from "./lib/onboarding";

const { canUseClerkServer: hasClerkConfig } = getClerkConfigState();
const isProtectedRoute = createRouteMatcher([
  "/onboarding(.*)",
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
const isOnboardingRoute = createRouteMatcher(["/onboarding(.*)"]);
const isOnboardingApiRoute = createRouteMatcher(["/api/onboarding(.*)"]);
const isMobileApiRoute = createRouteMatcher(["/api/mobile(.*)"]);
const isMobileBootstrapApiRoute = createRouteMatcher(["/api/mobile/me"]);
const isMemberProfileApiRoute = createRouteMatcher(["/api/member-profile"]);
const isPromptGenerateApiRoute = createRouteMatcher(["/api/prompts/generate"]);
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

function withMobileCors(req: NextRequest, response: NextResponse) {
  if (!isMobileApiRoute(req) && !isMemberProfileApiRoute(req)) {
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

async function loadDbOnboarding(userId: string) {
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
      .select("account_type,onboarding_completed_at")
      .eq("id", userId)
      .maybeSingle<{ account_type?: string | null; onboarding_completed_at?: string | null }>();

    if (error) {
      console.error("[middleware] Failed to read DB role", error);
      return null;
    }

    if (!data) {
      return null;
    }

    const { data: memberProfile, error: memberError } = await supabase
      .from("member_profiles")
      .select("style_target")
      .eq("user_id", userId)
      .maybeSingle<{ style_target?: string | null }>();

    if (memberError) {
      console.error("[middleware] Failed to read DB member profile", memberError);
      return null;
    }

    return {
      ...data,
      member_style_target: memberProfile?.style_target ?? null,
    };
  } catch (error) {
    console.error("[middleware] Failed to create Supabase role client", error);
    return null;
  }
}

const clerkAppMiddleware = hasClerkConfig
  ? clerkMiddleware(async (auth, req) => {
    if ((isMobileApiRoute(req) || isMemberProfileApiRoute(req)) && req.method === "OPTIONS") {
      return mobileCorsPreflight(req);
    }

    if (!isProtectedRoute(req) || isWebhookRoute(req) || (isPublicSupportApiRoute(req) && !isMutationRequest(req))) {
      return withMobileCors(req, NextResponse.next());
    }

    const authObject =
      isMobileApiRoute(req) || isMemberProfileApiRoute(req)
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
      const dbOnboarding = await loadDbOnboarding(userId);
      const dbAccountType = isAccountType(dbOnboarding?.account_type) ? dbOnboarding.account_type : null;
      const dbMemberStyleTarget = isMemberStyleTarget(dbOnboarding?.member_style_target)
        ? dbOnboarding.member_style_target
        : null;
      const isDevSalonOwner = isDevClerkSalonUserId(userId);
      const effectiveAccountType = isDevSalonOwner ? "salon_owner" : dbAccountType ?? metadata.accountType;
      const dbOnboardingComplete =
        effectiveAccountType === "admin" ||
        Boolean(
          dbOnboarding?.onboarding_completed_at &&
            (effectiveAccountType === "salon_owner" ||
              (effectiveAccountType === "member" && dbMemberStyleTarget)),
        );
      const effectiveOnboardingComplete =
        isDevSalonOwner ||
        dbOnboardingComplete ||
        (!dbOnboarding && Boolean(metadata.onboardingComplete && effectiveAccountType));
      const onboardingAllowed =
        isOnboardingRoute(req) ||
        isOnboardingApiRoute(req) ||
        isMobileBootstrapApiRoute(req) ||
        isMemberProfileApiRoute(req);
      const adminPageRequest = isAdminPageRoute(req);
      const adminApiRequest = isAdminApiRoute(req) && !isCatalogSecretAdminApiRoute(req);
      const adminRestrictedRequest = adminPageRequest || adminApiRequest;
      const adminNamespaceApiRequest = isAdminNamespaceApiRoute(req);

      if (!effectiveOnboardingComplete || !effectiveAccountType) {
        if (onboardingAllowed) {
          return NextResponse.next();
        }

        if (adminApiRequest) {
          return withMobileCors(req, NextResponse.json({ error: "Admin account required" }, { status: 403 }));
        }

        if (isPromptGenerateApiRoute(req)) {
          return withMobileCors(
            req,
            NextResponse.json(
              {
                error: "회원정보에서 성별을 선택한 뒤 헤어스타일을 생성해 주세요.",
                code: MEMBER_GENDER_REQUIRED_CODE,
                redirectTo: buildOnboardingRedirectUrl("/generate"),
              },
              { status: 428 },
            ),
          );
        }

        if (isApiRequest) {
          return withMobileCors(req, NextResponse.json({ error: "Onboarding required" }, { status: 403 }));
        }

        return NextResponse.redirect(new URL(buildOnboardingRedirectUrl(returnBackPath), req.url));
      }

      if (isOnboardingRoute(req)) {
        const redirectTo = normalizeAppPath(
          req.nextUrl.searchParams.get("return_url"),
          effectiveAccountType === "admin"
            ? "/admin/stats"
            : effectiveAccountType === "salon_owner"
              ? "/salon/customers"
              : "/home",
        );
        return NextResponse.redirect(new URL(redirectTo, req.url));
      }

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
      console.error("[middleware] Failed to read onboarding metadata", error);
    }

    return withMobileCors(req, NextResponse.next());
  })
  : null;

const proxy = hasClerkConfig && clerkAppMiddleware
  ? (req: NextRequest, event: NextFetchEvent) => {
      return clerkAppMiddleware(req, event);
    }
  : (req: NextRequest) => {
      if ((isMobileApiRoute(req) || isMemberProfileApiRoute(req)) && req.method === "OPTIONS") {
        return mobileCorsPreflight(req);
      }

      if (!isProtectedRoute(req) || isWebhookRoute(req) || (isPublicSupportApiRoute(req) && !isMutationRequest(req))) {
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
