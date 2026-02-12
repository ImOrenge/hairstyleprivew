import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { buildSignInRedirectUrl, getClerkConfigState } from "./lib/clerk";

const { canUseClerkServer: hasClerkConfig } = getClerkConfigState();
const isProtectedRoute = createRouteMatcher([
  "/upload(.*)",
  "/generate(.*)",
  "/mypage(.*)",
  "/result(.*)",
  "/api/(.*)",
]);

const isWebhookRoute = createRouteMatcher(["/api/payments/webhook"]);

const middleware = hasClerkConfig
  ? clerkMiddleware(async (auth, req) => {
    if (!isProtectedRoute(req) || isWebhookRoute(req)) {
      return NextResponse.next();
    }

    const { userId } = await auth();
    if (userId) {
      return NextResponse.next();
    }

    const returnBackPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
    return NextResponse.redirect(new URL(buildSignInRedirectUrl(returnBackPath), req.url));
  })
  : () => NextResponse.next();

export default middleware;
