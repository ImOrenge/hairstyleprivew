import { WorkerEntrypoint } from "cloudflare:workers";

import { handleImageRequest } from "../../.open-next/cloudflare/images.js";
import { runWithCloudflareRequestContext } from "../../.open-next/cloudflare/init.js";
import { resolveLocalImageAssetUrl } from "./image-route.js";
import { classifyServerRoute } from "./server-route.js";

function fetchPinnedServer(service, request, workerName, versionId) {
  const downstreamHeaders = new Headers(request.headers);
  downstreamHeaders.set(
    "Cloudflare-Workers-Version-Overrides",
    `${workerName}="${versionId}"`,
  );
  const downstreamRequest = new Request(request, {
    headers: downstreamHeaders,
  });

  return service.fetch(downstreamRequest, {
    redirect: "manual",
    cf: { cacheEverything: false },
  });
}

async function fetchPinnedServerDiagnostic(service, request, workerName, versionId) {
  const response = await fetchPinnedServer(service, request, workerName, versionId);
  const headers = new Headers(response.headers);
  headers.set("x-hairfit-pinned-server-version", versionId);
  headers.set("x-hairfit-pinned-worker", workerName);
  headers.set("cache-control", "no-store, max-age=0");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const SERVER_VERIFIED_CALLBACK_PATHS = new Set([
  "/api/generations/run",
  "/api/generations/prepare",
  "/api/generations/workflow-dispatch",
  "/api/generations/cleanup-stale-originals",
  "/api/generations/notifications/drain",
  "/api/styling/run",
  "/api/styling/fail",
  "/api/styling/workflow-dispatch",
  "/api/styling/notifications/drain",
]);
const SERVER_VERIFIED_CALLBACK_DETAIL = /^\/api\/(?:generations|styling)\/[0-9a-f-]+\/(?:notify|cleanup-original)\/?$/i;

function isServerVerifiedRequest(pathname) {
  return (
    SERVER_VERIFIED_CALLBACK_PATHS.has(pathname) ||
    SERVER_VERIFIED_CALLBACK_DETAIL.test(pathname) ||
    pathname.startsWith("/api/admin/hairstyles/") ||
    pathname.startsWith("/api/admin/fashion/")
  );
}

function resolveServerTarget(pathname, env) {
  const route = classifyServerRoute(pathname);
  if (route === "media") {
    return {
      service: env.MEDIA_WORKER,
      workerName: "hairfit-media",
      versionId: env.MEDIA_WORKER_VERSION_ID,
    };
  }
  if (route === "admin") {
    return {
      service: env.ADMIN_WORKER,
      workerName: "hairfit-admin",
      versionId: env.ADMIN_WORKER_VERSION_ID,
    };
  }
  return {
    service: env.DEFAULT_WORKER,
    workerName: "hairstyleprivew",
    versionId: env.WORKER_VERSION_ID,
  };
}

function fetchServerTarget(target, request) {
  return fetchPinnedServer(
    target.service,
    request,
    target.workerName,
    target.versionId,
  );
}

const ROUTER_AUTH_ENV_NAMES = [
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function ensureMiddlewareProcessEnv(env) {
  for (const name of ROUTER_AUTH_ENV_NAMES) {
    if (typeof env[name] === "string" && env[name].length > 0) {
      process.env[name] = env[name];
    }
  }

  // Next.js replaces NEXT_PUBLIC_* references while compiling middleware.
  // Mirror the runtime binding to the server-only alias so Clerk's dynamic
  // middleware options cannot fall back to a development key baked at build time.
  if (
    typeof env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY === "string" &&
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 0
  ) {
    process.env.CLERK_PUBLISHABLE_KEY = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  }
}

export default class HairFitOpenNextRouter extends WorkerEntrypoint {
  async fetch(request) {
    ensureMiddlewareProcessEnv(this.env);
    const pathname = new URL(request.url).pathname;
    if (pathname === "/_next/image") {
      const localAssetUrl = resolveLocalImageAssetUrl(request.url);
      if (localAssetUrl) {
        return this.env.ASSETS.fetch(localAssetUrl);
      }

      return handleImageRequest(new URL(request.url), request.headers, this.env);
    }

    if (pathname === "/.well-known/hairfit-router") {
      return Response.json(
        {
          service: "hairstyleprivew-router",
          pinnedServerVersion: this.env.WORKER_VERSION_ID,
          pinnedMediaVersion: this.env.MEDIA_WORKER_VERSION_ID,
          pinnedAdminVersion: this.env.ADMIN_WORKER_VERSION_ID,
        },
        {
          headers: {
            "cache-control": "no-store, max-age=0",
          },
        },
      );
    }

    if (
      pathname === "/.well-known/hairfit-deployment" ||
      pathname === "/.well-known/hairfit-media-deployment" ||
      pathname === "/.well-known/hairfit-admin-deployment"
    ) {
      const target = resolveServerTarget(pathname, this.env);
      return fetchPinnedServerDiagnostic(
        target.service,
        request,
        target.workerName,
        target.versionId,
      );
    }

    // These handlers perform their own constant-time secret verification on the
    // server Worker. The router intentionally does not duplicate callback/admin
    // secrets, so it forwards only this narrow allow-list before Clerk middleware.
    if (isServerVerifiedRequest(pathname)) {
      return fetchServerTarget(resolveServerTarget(pathname, this.env), request);
    }

    return runWithCloudflareRequestContext(request, this.env, this.ctx, async () => {
      // The compiled middleware reads process.env while its module initializes.
      // Load it only after OpenNext has installed the per-request env context.
      const { handler: middlewareHandler } = await import(
        "../../.open-next/middleware/handler.mjs"
      );
      const requestOrResponse = await middlewareHandler(request, this.env, this.ctx);

      if (requestOrResponse instanceof Response) {
        return requestOrResponse;
      }

      const downstreamPathname = new URL(requestOrResponse.url).pathname;
      return fetchServerTarget(
        resolveServerTarget(downstreamPathname, this.env),
        requestOrResponse,
      );
    });
  }
}
