import type { MetadataRoute } from "next";
import { getSiteUrl } from "../lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: [
          "Amazonbot",
          "Applebot-Extended",
          "Bytespider",
          "CCBot",
          "ChatGPT-User",
          "ClaudeBot",
          "GPTBot",
          "PerplexityBot",
        ],
        disallow: "/",
      },
      {
        userAgent: "*",
        allow: ["/", "/support", "/privacy-policy", "/terms-of-service", "/b2b/contact"],
        disallow: [
          "/admin/",
          "/aftercare/",
          "/api/",
          "/b2b/signup",
          "/generate",
          "/home",
          "/login",
          "/mypage",
          "/personal-color",
          "/result/",
          "/salon/",
          "/signup",
          "/styler/",
          "/upload",
          "/workspace/",
        ],
        crawlDelay: 10,
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
