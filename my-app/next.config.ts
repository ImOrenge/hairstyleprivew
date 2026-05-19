import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(appDir, "..");
const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;

const nextConfig: NextConfig = {
    outputFileTracingRoot: workspaceRoot,
    images: {
        formats: ["image/avif", "image/webp"],
        remotePatterns: [
            {
                protocol: "https",
                hostname: "img.clerk.com",
            },
        ],
    },
    async headers() {
        const noIndexHeaders = [
            {
                key: "X-Robots-Tag",
                value: "noindex, nofollow, noarchive",
            },
        ];
        const apiNoStoreHeaders = [
            ...noIndexHeaders,
            {
                key: "Cache-Control",
                value: "no-store",
            },
        ];
        const privateRouteSources = [
            "/admin/(.*)",
            "/aftercare/(.*)",
            "/api/(.*)",
            "/b2b/signup",
            "/generate",
            "/generate/(.*)",
            "/home/(.*)",
            "/login",
            "/login/(.*)",
            "/mypage",
            "/personal-color",
            "/result/(.*)",
            "/salon/(.*)",
            "/signup",
            "/signup/(.*)",
            "/styler/(.*)",
            "/upload",
            "/workspace/(.*)",
        ];
        const apiCorsHeaders = appUrl
            ? [
                {
                    source: "/api/(.*)",
                    headers: [
                        {
                            key: "Access-Control-Allow-Origin",
                            value: appUrl,
                        },
                    ],
                },
            ]
            : [];
        const noIndexHeaderRules = privateRouteSources.map((source) => ({
            source,
            headers: source === "/api/(.*)" ? apiNoStoreHeaders : noIndexHeaders,
        }));

        return [
            {
                source: "/(.*)",
                headers: [
                    {
                        key: "X-Frame-Options",
                        value: "DENY",
                    },
                    {
                        key: "X-Content-Type-Options",
                        value: "nosniff",
                    },
                    {
                        key: "Referrer-Policy",
                        value: "strict-origin-when-cross-origin",
                    },
                    {
                        key: "Permissions-Policy",
                        value: "camera=(), microphone=(), geolocation=()",
                    },
                ],
            },
            ...noIndexHeaderRules,
            ...apiCorsHeaders,
        ];
    },
};

export default nextConfig;
