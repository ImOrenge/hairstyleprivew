import { SALON_CONNECTION_CONSENT_VERSION } from "@hairfit/shared/salon/connection-consent";
import { NextResponse } from "next/server";
import {
  LINKED_MEMBER_COLUMNS,
  MATCH_REQUEST_COLUMNS,
  getSalonOwnerContext,
  isSalonMatchStatus,
  normalizeMatchCandidate,
  runList,
  trimString,
} from "../../../../lib/salon-crm";
import { collectCursorFilteredPage } from "../../../../lib/cursor-filtered-page";
import { decodeListCursor, encodeListCursor } from "../../../../lib/list-cursor";

const MATCH_SCAN_BATCH_SIZE = 100;

function escapeSearchValue(value: string) {
  return value.replace(/[%,()]/g, "");
}

function parseLimit(raw: string | null) {
  if (!raw) return 20;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(50, Math.max(10, Math.floor(parsed)));
}

function paginationErrorKind(error: unknown) {
  if (!error || typeof error !== "object") return "unknown_error";
  const candidate = error as { code?: unknown; name?: unknown };
  const value = typeof candidate.code === "string"
    ? candidate.code
    : typeof candidate.name === "string"
      ? candidate.name
      : "unknown_error";
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "unknown_error";
}

export async function GET(request: Request) {
  const context = await getSalonOwnerContext("read");
  if (!context.ok) {
    return context.response;
  }

  const url = new URL(request.url);
  const q = escapeSearchValue(trimString(url.searchParams.get("q"), 80)).toLowerCase();
  const statusParam = url.searchParams.get("status");
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursorParam = url.searchParams.get("cursor");
  const cursor = decodeListCursor(cursorParam);
  if (cursorParam && !cursor) {
    return NextResponse.json({ error: "Invalid pagination cursor" }, { status: 400 });
  }

  try {
    const page = await collectCursorFilteredPage({
      cursor,
      limit,
      batchSize: MATCH_SCAN_BATCH_SIZE,
      loadBatch: async (scanCursor, batchSize) => {
        let query = context.supabase
          .from("salon_match_requests")
          .select(MATCH_REQUEST_COLUMNS)
          .eq("owner_user_id", context.userId)
          .eq("consent_version", SALON_CONNECTION_CONSENT_VERSION)
          .order("updated_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(batchSize);

        if (statusParam === "all") {
          query = query.in("status", ["pending", "linked"]);
        } else if (isSalonMatchStatus(statusParam) && statusParam !== "revoked") {
          query = query.eq("status", statusParam);
        } else {
          query = query.eq("status", "pending");
        }

        if (scanCursor) {
          query = query.or(
            `updated_at.lt.${scanCursor.sortValue},and(updated_at.eq.${scanCursor.sortValue},id.lt.${scanCursor.id})`,
          );
        }

        const { data: rows, error } = await runList<Record<string, unknown>>(query);
        if (error) {
          throw new Error(error.message);
        }

        const requestRows = rows || [];
        const memberIds = Array.from(
          new Set(
            requestRows
              .map((row) => (typeof row.member_user_id === "string" ? row.member_user_id : ""))
              .filter(Boolean),
          ),
        );

        let memberById = new Map<string, Record<string, unknown>>();
        if (memberIds.length > 0) {
          const { data: memberRows, error: memberError } = await runList<Record<string, unknown>>(
            context.supabase
              .from("users")
              .select(LINKED_MEMBER_COLUMNS)
              .in("id", memberIds)
              .limit(batchSize),
          );

          if (memberError) {
            throw new Error(memberError.message);
          }
          memberById = new Map((memberRows || []).map((row) => [String(row.id || ""), row]));
        }

        return requestRows.map((row) => {
          const candidate = normalizeMatchCandidate(
            row,
            memberById.get(String(row.member_user_id || "")) || null,
          );
          const matchesSearch = candidate && (!q || [candidate.member.displayName, candidate.member.email]
            .some((value) => value.toLowerCase().includes(q)));

          return {
            cursor: {
              id: String(row.id || ""),
              sortValue: String(row.updated_at || ""),
            },
            value: matchesSearch ? candidate : null,
          };
        });
      },
    });

    console.info("[salon-match-pagination]", {
      event: "salon_match_pagination_read",
      status: statusParam || "pending",
      qApplied: Boolean(q),
      cursorApplied: Boolean(cursor),
      limit,
      returned: page.items.length,
      scanned: page.scanned,
      hasMore: Boolean(page.nextCursor),
    });

    return NextResponse.json(
      {
        candidates: page.items,
        limit,
        nextCursor: page.nextCursor
          ? encodeListCursor(page.nextCursor.sortValue, page.nextCursor.id)
          : null,
      },
      { status: 200, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[salon-match-pagination]", {
      event: "salon_match_pagination_failed",
      status: statusParam || "pending",
      qApplied: Boolean(q),
      cursorApplied: Boolean(cursor),
      limit,
      errorKind: paginationErrorKind(error),
    });
    return NextResponse.json({ error: "Failed to load match candidates" }, { status: 500 });
  }
}
