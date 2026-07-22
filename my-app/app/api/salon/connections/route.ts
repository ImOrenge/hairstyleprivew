import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { MATCH_REQUEST_COLUMNS, normalizeConnectionSummary } from "../../../../lib/salon-crm";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../lib/supabase";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: rows, error } = await supabase
    .from("salon_match_requests")
    .select(MATCH_REQUEST_COLUMNS)
    .eq("member_user_id", userId)
    .in("status", ["pending", "linked"])
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ownerIds = Array.from(
    new Set((rows || []).map((row) => String(row.owner_user_id || "")).filter(Boolean)),
  );
  const { data: profiles, error: profileError } = ownerIds.length
    ? await supabase
        .from("salon_profiles")
        .select("user_id,manager_name,shop_name,contact_phone,region")
        .in("user_id", ownerIds)
    : { data: [], error: null };

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const profileByOwnerId = new Map((profiles || []).map((profile) => [String(profile.user_id || ""), profile]));
  const connections = (rows || []).map((row) => {
    const connection = normalizeConnectionSummary(row as Record<string, unknown>);
    const profile = profileByOwnerId.get(connection.ownerUserId);
    return {
      ...connection,
      salon: {
        shopName: typeof profile?.shop_name === "string" ? profile.shop_name : "HairFit salon",
        managerName: typeof profile?.manager_name === "string" ? profile.manager_name : "",
        contactPhone: typeof profile?.contact_phone === "string" ? profile.contact_phone : "",
        region: typeof profile?.region === "string" ? profile.region : "",
      },
    };
  });

  return NextResponse.json(
    { connections },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}
