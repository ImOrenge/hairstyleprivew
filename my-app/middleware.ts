import { clerkClient, clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { buildSignInRedirectUrl, getClerkConfigState } from "./lib/clerk";
import { buildOnboardingRedirectUrl, normalizeAppPath, parseOnboardingMetadata } from "./lib/onboarding";

const { canUseClerkServer: hasClerkConfig } = getClerkConfigState();
const isProtectedRoute = createRouteMatcher([
  "/onboarding(.*)",
  "/upload(.*)",
  "/generate(.*)",
  "/mypage(.*)",
  "/result(.*)",
  "/salon(.*)",
  "/styler(.*)",
  "/api/(.*)",
]);

const isWebhookRoute = createRouteMatcher(["/api/payments/webhook"]);
const isOnboardingRoute = createRouteMatcher(["/onboarding(.*)"]);
const isOnboardingApiRoute = createRouteMatcher(["/api/onboarding(.*)"]);
const isSalonRoute = createRouteMatcher(["/salon(.*)"]);
const isMyPageRoute = createRouteMatcher(["/mypage"]);

const middleware = hasClerkConfig
  ? clerkMiddleware(async (auth, req) => {
    if (!isProtectedRoute(req) || isWebhookRoute(req)) {
      return NextResponse.next();
    }

    const { userId } = await auth();
    const returnBackPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
    if (!userId) {
      return NextResponse.redirect(new URL(buildSignInRedirectUrl(returnBackPath), req.url));
    }

    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const metadata = parseOnboardingMetadata(user.publicMetadata);
      const onboardingAllowed = isOnboardingRoute(req) || isOnboardingApiRoute(req);

      if (!metadata.onboardingComplete || !metadata.accountType) {
        if (onboardingAllowed) {
          return NextResponse.next();
        }

        return NextResponse.redirect(new URL(buildOnboardingRedirectUrl(returnBackPath), req.url));
      }

      if (isOnboardingRoute(req)) {
        const redirectTo = normalizeAppPath(req.nextUrl.searchParams.get("return_url"), "/mypage");
        return NextResponse.redirect(new URL(redirectTo, req.url));
      }

      if (isSalonRoute(req) && metadata.accountType !== "salon_owner") {
        return NextResponse.redirect(new URL("/mypage", req.url));
      }

      if (isMyPageRoute(req) && metadata.accountType === "salon_owner") {
        return NextResponse.redirect(new URL("/salon/customers", req.url));
      }
    } catch (error) {
      console.error("[middleware] Failed to read onboarding metadata", error);
    }

    return NextResponse.next();
  })
  : () => NextResponse.next();

export default middleware;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
