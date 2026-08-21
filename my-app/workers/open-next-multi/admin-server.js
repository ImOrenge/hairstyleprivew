import { runWithCloudflareRequestContext } from "../../.open-next/cloudflare/init.js";
import { handler } from "../../.open-next/server-functions/admin/handler.mjs";

const hairFitAdminServer = {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === "/.well-known/hairfit-admin-deployment") {
      return Response.json(
        {
          service: "hairfit-admin",
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

export default hairFitAdminServer;
