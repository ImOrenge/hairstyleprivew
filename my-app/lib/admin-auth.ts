import "server-only";

import { getApiContext, requirePageAccess } from "./rbac-server";

export async function getAdminApiContext() {
  return getApiContext("admin:write");
}

export async function requireAdminPageAccess(path = "/admin/stats") {
  return requirePageAccess("admin:read", path);
}
