import { WorkerEntrypoint } from "cloudflare:workers";

import { runWithCloudflareRequestContext } from "../../.open-next/cloudflare/init.js";
import { handler as middlewareHandler } from "../../.open-next/middleware/handler.mjs";

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

    return runWithCloudflareRequestContext(request, this.env, this.ctx, async () => {
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
