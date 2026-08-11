import { runWithCloudflareRequestContext } from "../../.open-next/cloudflare/init.js";
import { handler } from "../../.open-next/server-functions/default/handler.mjs";

const hairFitOpenNextServer = {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === "/.well-known/hairfit-deployment") {
      return Response.json(
        {
          service: "hairstyleprivew",
          sourceRevision: env.HAIRFIT_SOURCE_REVISION ?? "unknown",
        },
        {
          headers: {
            "cache-control": "no-store, max-age=0",
          },
        },
      );
    }

    return runWithCloudflareRequestContext(request, env, ctx, () => handler(request, env, ctx));
  },
};

export default hairFitOpenNextServer;
