import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const base = defineCloudflareConfig();
const appDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "app");

function collectRouteHandlers(relativeDirectory: string): `app/${string}/route`[] {
  const root = path.join(appDirectory, relativeDirectory);
  const routes: `app/${string}/route`[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(candidate);
      if (entry.isFile() && /^route\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
        const routeDirectory = path.relative(appDirectory, directory).replaceAll("\\", "/");
        routes.push(`app/${routeDirectory}/route`);
      }
    }
  };
  visit(root);
  return routes.sort();
}

const consultationWorkerRoutes = Array.from(new Set([
  ...collectRouteHandlers("api/consultations"),
  ...collectRouteHandlers("api/v2/consultations"),
  "app/api/generations/run/route" as const,
  "app/api/personal-color/analyze/route" as const,
  "app/api/style-profile/body-photo/route" as const,
  "app/consulting/[sessionId]/[stage]/page" as const,
  "app/consulting/new/page" as const,
  "app/consulting/share/[token]/page" as const,
]));

export default {
  ...base,
  functions: {
    media: {
      ...base.default,
      routes: consultationWorkerRoutes,
      patterns: [
        "/api/consultations/*",
        "/api/generations/run",
        "/api/personal-color/analyze",
        "/api/style-profile/body-photo",
        "/api/v2/consultations/*",
        "/consulting/*",
      ],
    },
  },
};
