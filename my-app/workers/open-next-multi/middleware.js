import { WorkerEntrypoint } from "cloudflare:workers";

import { runWithCloudflareRequestContext } from "../../.open-next/cloudflare/init.js";

function fetchPinnedServer(service, request, versionId) {
  const downstreamHeaders = new Headers(request.headers);
  downstreamHeaders.set(
    "Cloudflare-Workers-Version-Overrides",
    `hairstyleprivew="${versionId}"`,
  );
  const downstreamRequest = new Request(request, {
    headers: downstreamHeaders,
  });

  return service.fetch(downstreamRequest, {
    redirect: "manual",
    cf: { cacheEverything: false },
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

export default class HairFitOpenNextRouter extends WorkerEntrypoint {
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/.well-known/hairfit-router") {
      return Response.json(
        {
          service: "hairstyleprivew-router",
          pinnedServerVersion: this.env.WORKER_VERSION_ID,
        },
        {
          headers: {
            "cache-control": "no-store, max-age=0",
          },
        },
      );
    }

    if (pathname === "/.well-known/hairfit-deployment") {
      return fetchPinnedServer(this.env.DEFAULT_WORKER, request, this.env.WORKER_VERSION_ID);
    }

    // These handlers perform their own constant-time secret verification on the
    // server Worker. The router intentionally does not duplicate callback/admin
    // secrets, so it forwards only this narrow allow-list before Clerk middleware.
    if (isServerVerifiedRequest(pathname)) {
      return fetchPinnedServer(this.env.DEFAULT_WORKER, request, this.env.WORKER_VERSION_ID);
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

      return fetchPinnedServer(
        this.env.DEFAULT_WORKER,
        requestOrResponse,
        this.env.WORKER_VERSION_ID,
      );
    });
  }
}
