import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../lib/admin-auth";

interface SearchParams {
  searchParams?: URLSearchParams;
}

interface RefundRequestSupabase {
  from: (table: string) => {
    select: (columns: string) => {
      order: (column: string, options?: { ascending?: boolean }) => {
        limit: (count: number) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
      };
      eq: (column: string, value: unknown) => {
        order: (column: string, options?: { ascending?: boolean }) => {
          limit: (count: number) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
}

function normalizeStatus(value: string | null): string | null {
  if (!value || value === "all") return null;
  return [
    "pending",
    "approved",
    "completed",
    "failed",
    "manual_review_required",
    "rejected",
  ].includes(value)
    ? value
    : null;
}

export async function GET(request: Request) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const { searchParams }: SearchParams = new URL(request.url);
  const status = normalizeStatus(searchParams?.get("status") ?? null);
  const supabase = context.supabase as unknown as RefundRequestSupabase;
  const columns = [
    "id",
    "payment_transaction_id",
    "user_id",
    "requested_by",
    "approved_by",
    "refund_type",
    "amount_krw",
    "reason",
    "status",
    "portone_cancel_id",
    "requested_at",
    "approved_at",
    "completed_at",
    "failed_code",
    "failed_message",
    "metadata",
    "created_at",
    "updated_at",
    "payment_transactions(id,user_id,provider,provider_order_id,status,amount,currency,credits_to_grant,paid_at,created_at)",
  ].join(",");

  const query = supabase.from("payment_refund_requests").select(columns);
  const { data, error } = status
    ? await query.eq("status", status).order("requested_at", { ascending: false }).limit(100)
    : await query.order("requested_at", { ascending: false }).limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ refundRequests: data ?? [] }, { status: 200 });
}
