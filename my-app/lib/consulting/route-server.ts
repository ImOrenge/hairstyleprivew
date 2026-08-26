import "server-only";

import { auth } from "@clerk/nextjs/server";
import { unstable_rethrow } from "next/navigation";

export async function readConsultationRouteUserId() {
  try {
    const { userId } = await auth();
    return userId;
  } catch (error) {
    unstable_rethrow(error);
    console.error("[consulting] Clerk auth context unavailable", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}

export async function loadConsultationRouteData<T>(operation: string, loader: () => Promise<T>) {
  try {
    return { ok: true as const, data: await loader() };
  } catch (error) {
    unstable_rethrow(error);
    console.error("[consulting] Server route data unavailable", {
      operation,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return { ok: false as const, data: null };
  }
}
