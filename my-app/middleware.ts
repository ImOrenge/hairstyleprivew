import { clerkMiddleware } from "@clerk/nextjs/server";
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

const middleware = hasClerkConfig
  ? clerkMiddleware()
  : () => NextResponse.next();

export default middleware;
