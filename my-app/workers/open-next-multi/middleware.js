import { WorkerEntrypoint } from "cloudflare:workers";

import { runWithCloudflareRequestContext } from "../../.open-next/cloudflare/init.js";
import { handler as middlewareHandler } from "../../.open-next/middleware/handler.mjs";

export default class HairFitOpenNextRouter extends WorkerEntrypoint {
  async fetch(request) {
    return runWithCloudflareRequestContext(request, this.env, this.ctx, async () => {
      const requestOrResponse = await middlewareHandler(request, this.env, this.ctx);

      if (requestOrResponse instanceof Response) {
        return requestOrResponse;
      }

      requestOrResponse.headers.set(
        "Cloudflare-Workers-Version-Overrides",
        `hairstyleprivew="${this.env.WORKER_VERSION_ID}"`,
      );

      return this.env.DEFAULT_WORKER.fetch(requestOrResponse, {
        redirect: "manual",
        cf: { cacheEverything: false },
      });
    });
  }
}
