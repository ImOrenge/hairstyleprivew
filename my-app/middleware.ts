import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const secretKey = process.env.CLERK_SECRET_KEY;
const hasClerkConfig =
  typeof publishableKey === "string" &&
  publishableKey.startsWith("pk_") &&
  !publishableKey.includes("YOUR_") &&
  typeof secretKey === "string" &&
  secretKey.startsWith("sk_") &&
  !secretKey.includes("YOUR_");

const isProtectedRoute = createRouteMatcher([
  "/upload(.*)",
  "/generate(.*)",
  "/mypage(.*)",
  "/result(.*)",
]);

const middleware = hasClerkConfig
  ? clerkMiddleware(async (auth, req) => {
      if (!isProtectedRoute(req)) {
        return NextResponse.next();
      }

      const { userId } = await auth();
      if (userId) {
        return NextResponse.next();
      }

      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("redirect_url", req.url);
      return NextResponse.redirect(loginUrl);
    })
  : () => NextResponse.next();

export default middleware;
