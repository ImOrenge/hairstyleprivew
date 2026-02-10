import { clerkMiddleware } from "@clerk/nextjs/server";

// Next.js 16: proxy.ts replaces middleware.ts
// Proxy runs on Edge runtime by default (no route segment config needed)
export const proxy = clerkMiddleware();
