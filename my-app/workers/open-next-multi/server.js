import { runWithCloudflareRequestContext } from "../../.open-next/cloudflare/init.js";
import { handler } from "../../.open-next/server-functions/default/handler.mjs";

const hairFitOpenNextServer = {
  async fetch(request, env, ctx) {
    return runWithCloudflareRequestContext(request, env, ctx, () => handler(request, env, ctx));
  },
};

export default hairFitOpenNextServer;
