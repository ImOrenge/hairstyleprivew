"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback } from "react";
import { authenticatedFetchWithRetry } from "../lib/authenticated-fetch";

export function useAuthenticatedFetch() {
  const { getToken } = useAuth();
  return useCallback(
    (input: RequestInfo | URL, init?: RequestInit) =>
      authenticatedFetchWithRetry(input, init, { getToken }),
    [getToken],
  );
}
