import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../lib/admin-auth";
import { trimText } from "../../../../../lib/onboarding";
import {
  buildAdminEntitlementView,
  buildGrantableOfferings,
  summarizeAdminEntitlements,
  type AdminEntitlementGrantRecord,
  type AdminOfferingRecord,
} from "../../../../../lib/admin-entitlement-view";

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
        .select("id,email,display_name,avatar_url,account_type,onboarding_completed_at,created_at,updated_at")
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
      subscriptions,
      salonCustomers,
      salonAftercare,
      entitlementGrants,
      entitlementOfferings,
      linkedConsultations,
      entitlementAudits,
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
          .select("id,status,prompt_used,generated_image_path,created_at,updated_at")
          .eq("user_id", targetUserId)
          .order("created_at", { ascending: false })
          .limit(10) as unknown as QueryListResult<Record<string, unknown>>,
      ),
      optionalList<Record<string, unknown>>(
        context.supabase
          .from("styling_sessions")
          .select("id,status,genre,occasion,mood,generated_image_path,created_at,updated_at")
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
          .select("id,status,currency,amount,paid_at,created_at")
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
      optionalList<AdminEntitlementGrantRecord>(
        context.supabase
          .from("customer_entitlement_grants_v2")
          .select("id,user_id,offering_key,offering_version,quantity_granted,quantity_consumed,status,source,valid_from,expires_at,created_at,updated_at")
          .eq("user_id", targetUserId)
          .order("created_at", { ascending: false })
          .limit(100) as unknown as QueryListResult<AdminEntitlementGrantRecord>,
      ),
      optionalList<AdminOfferingRecord>(
        context.supabase
          .from("product_offerings_v2")
          .select("offering_key,version,customer_name,description,purchase_mode,billing_interval,status,included_consultation_sessions")
          .like("offering_key", "full_style_%")
          .order("version", { ascending: false }) as unknown as QueryListResult<AdminOfferingRecord>,
      ),
      optionalList<{ entitlement_grant_id: string }>(
        context.supabase
          .from("consultation_sessions")
          .select("entitlement_grant_id")
          .eq("user_id", targetUserId)
          .not("entitlement_grant_id", "is", null)
          .not("lifecycle_state", "in", '("completed","cancelled")') as unknown as QueryListResult<{ entitlement_grant_id: string }>,
      ),
      optionalList<Record<string, unknown>>(
        context.supabase
          .from("admin_action_receipts")
          .select("id,action_type,status,actor_user_id,target_resource_id,request_payload,before_state,after_state,error_code,created_at,completed_at")
          .eq("target_user_id", targetUserId)
          .in("action_type", ["entitlement_grant", "entitlement_revoke"])
          .order("created_at", { ascending: false })
          .limit(100) as unknown as QueryListResult<Record<string, unknown>>,
      ),
    ]);

    const offeringMap = new Map(
      entitlementOfferings.map((offering) => [`${offering.offering_key}:${offering.version}`, offering]),
    );
    const linkedGrantIds = new Set(linkedConsultations.map((row) => row.entitlement_grant_id));
    const grantViews = entitlementGrants.map((grant) => buildAdminEntitlementView(
      grant,
      offeringMap.get(`${grant.offering_key}:${grant.offering_version}`),
      linkedGrantIds.has(grant.id),
    ));

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
          subscriptions,
        },
        entitlements: {
          summary: summarizeAdminEntitlements(entitlementGrants),
          grants: grantViews,
          grantableOfferings: buildGrantableOfferings(entitlementOfferings),
          auditHistory: entitlementAudits.map((row) => {
            const requestPayload = row.request_payload && typeof row.request_payload === "object" ? row.request_payload as Record<string, unknown> : {};
            const afterState = row.after_state && typeof row.after_state === "object" ? row.after_state as Record<string, unknown> : {};
            const beforeState = row.before_state && typeof row.before_state === "object" ? row.before_state as Record<string, unknown> : {};
            const grant = afterState.entitlementGrant && typeof afterState.entitlementGrant === "object" ? afterState.entitlementGrant as Record<string, unknown> : {};
            return {
              id: String(row.id),
              actionType: row.action_type,
              status: String(row.status),
              actorUserId: String(row.actor_user_id),
              grantId: typeof requestPayload.grantId === "string" ? requestPayload.grantId : typeof grant.id === "string" ? grant.id : null,
              reason: typeof requestPayload.reason === "string" ? requestPayload.reason : "",
              beforeState,
              afterState,
              errorCode: typeof row.error_code === "string" ? row.error_code : null,
              createdAt: String(row.created_at),
              completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
            };
          }),
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
