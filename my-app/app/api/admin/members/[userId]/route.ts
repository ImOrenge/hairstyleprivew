import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../lib/admin-auth";
import { trimText } from "../../../../../lib/onboarding";

interface Params {
  params: Promise<{ userId: string }>;
}

type QueryResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
type QueryListResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

function isMissingRelation(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("does not exist") || normalized.includes("schema cache");
}

async function optionalSingle<T>(query: QueryResult<T>) {
  const { data, error } = await query;
  if (error) {
    if (isMissingRelation(error.message)) {
      return null;
    }
    throw new Error(error.message);
  }

  return data ?? null;
}

async function optionalList<T>(query: QueryListResult<T>) {
  const { data, error } = await query;
  if (error) {
    if (isMissingRelation(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function GET(_request: Request, { params }: Params) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const resolvedParams = await params;
  const targetUserId = trimText(resolvedParams.userId, 160);
  if (!targetUserId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  try {
    const user = await optionalSingle<Record<string, unknown>>(
      context.supabase
        .from("users")
        .select("id,email,display_name,avatar_url,account_type,credits,onboarding_completed_at,created_at,updated_at")
        .eq("id", targetUserId)
        .maybeSingle<Record<string, unknown>>(),
    );

    if (!user) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const [
      memberProfile,
      salonProfile,
      styleProfile,
      generations,
      stylingSessions,
      hairRecords,
      payments,
      creditLedger,
      subscriptions,
      salonCustomers,
      salonAftercare,
    ] = await Promise.all([
      optionalSingle<Record<string, unknown>>(
        context.supabase
          .from("member_profiles")
          .select("*")
          .eq("user_id", targetUserId)
          .maybeSingle<Record<string, unknown>>(),
      ),
      optionalSingle<Record<string, unknown>>(
        context.supabase
          .from("salon_profiles")
          .select("*")
          .eq("user_id", targetUserId)
          .maybeSingle<Record<string, unknown>>(),
      ),
      optionalSingle<Record<string, unknown>>(
        context.supabase
          .from("user_style_profiles")
          .select("*")
          .eq("user_id", targetUserId)
          .maybeSingle<Record<string, unknown>>(),
      ),
      optionalList<Record<string, unknown>>(
        context.supabase
          .from("generations")
          .select("id,status,prompt_used,generated_image_path,credits_used,created_at,updated_at")
          .eq("user_id", targetUserId)
          .order("created_at", { ascending: false })
          .limit(10) as unknown as QueryListResult<Record<string, unknown>>,
      ),
      optionalList<Record<string, unknown>>(
        context.supabase
          .from("styling_sessions")
          .select("id,status,genre,occasion,mood,generated_image_path,credits_used,created_at,updated_at")
          .eq("user_id", targetUserId)
          .order("created_at", { ascending: false })
          .limit(10) as unknown as QueryListResult<Record<string, unknown>>,
      ),
      optionalList<Record<string, unknown>>(
        context.supabase
          .from("user_hair_records")
          .select("id,style_name,service_type,service_date,next_visit_target_days,created_at")
          .eq("user_id", targetUserId)
          .order("created_at", { ascending: false })
          .limit(10) as unknown as QueryListResult<Record<string, unknown>>,
      ),
      optionalList<Record<string, unknown>>(
        context.supabase
          .from("payment_transactions")
          .select("id,status,currency,amount,credits_to_grant,paid_at,created_at")
          .eq("user_id", targetUserId)
          .order("created_at", { ascending: false })
          .limit(10) as unknown as QueryListResult<Record<string, unknown>>,
      ),
      optionalList<Record<string, unknown>>(
        context.supabase
          .from("credit_ledger")
          .select("id,entry_type,amount,balance_after,reason,created_at")
          .eq("user_id", targetUserId)
          .order("created_at", { ascending: false })
          .limit(10) as unknown as QueryListResult<Record<string, unknown>>,
      ),
      optionalList<Record<string, unknown>>(
        context.supabase
          .from("user_subscriptions")
          .select("id,plan_key,status,current_period_start,current_period_end,created_at,updated_at")
          .eq("user_id", targetUserId)
          .order("created_at", { ascending: false })
          .limit(5) as unknown as QueryListResult<Record<string, unknown>>,
      ),
      optionalList<Record<string, unknown>>(
        context.supabase
          .from("salon_customers")
          .select("id,owner_user_id,linked_user_id,source,name,phone,email,next_follow_up_at,archived_at,created_at,updated_at")
          .eq("owner_user_id", targetUserId)
          .order("updated_at", { ascending: false })
          .limit(20) as unknown as QueryListResult<Record<string, unknown>>,
      ),
      optionalList<Record<string, unknown>>(
        context.supabase
          .from("salon_aftercare_tasks")
          .select("id,customer_id,channel,status,scheduled_for,note,created_at,updated_at")
          .eq("owner_user_id", targetUserId)
          .order("scheduled_for", { ascending: false })
          .limit(20) as unknown as QueryListResult<Record<string, unknown>>,
      ),
    ]);

    return NextResponse.json(
      {
        user,
        profiles: {
          member: memberProfile,
          salon: salonProfile,
          style: styleProfile,
        },
        activity: {
          generations,
          stylingSessions,
          hairRecords,
          payments,
          creditLedger,
          subscriptions,
        },
        salon: {
          customers: salonCustomers,
          aftercareTasks: salonAftercare,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
