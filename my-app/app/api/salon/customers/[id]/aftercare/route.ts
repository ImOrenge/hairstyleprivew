import { NextResponse } from "next/server";
import {
  AFTERCARE_COLUMNS,
  getSalonOwnerContext,
  isAftercareChannel,
  loadOwnerCustomer,
  normalizeAftercareTask,
  parseNullableIso,
  trimString,
} from "../../../../../../lib/salon-crm";

interface Params {
  params: Promise<{ id: string }>;
}

interface CreateAftercareRequest {
  channel?: unknown;
  scheduledFor?: unknown;
  templateKey?: unknown;
  note?: unknown;
}

export async function POST(request: Request, { params }: Params) {
  const context = await getSalonOwnerContext();
  if (!context.ok) {
    return context.response;
  }

  const { id } = await params;
  const customerId = id?.trim();
  if (!customerId) {
    return NextResponse.json({ error: "customer id is required" }, { status: 400 });
  }

  const loaded = await loadOwnerCustomer(context.supabase, context.userId, customerId);
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const body = (await request.json().catch(() => ({}))) as CreateAftercareRequest;
  const channel = isAftercareChannel(body.channel) ? body.channel : "manual";
  const scheduledFor = parseNullableIso(body.scheduledFor);
  const templateKey = trimString(body.templateKey, 80);
  const note = trimString(body.note, 1200);

  if (!scheduledFor) {
    return NextResponse.json({ error: "scheduledFor is required" }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("salon_aftercare_tasks")
    .insert({
      owner_user_id: context.userId,
      customer_id: customerId,
      channel,
      status: "pending",
      scheduled_for: scheduledFor,
      template_key: templateKey || null,
      note: note || null,
    })
    .select(AFTERCARE_COLUMNS)
    .single<Record<string, unknown>>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await context.supabase
    .from("salon_customers")
    .update({ next_follow_up_at: scheduledFor })
    .eq("owner_user_id", context.userId)
    .eq("id", customerId)
    .select("id")
    .single<Record<string, unknown>>();

  return NextResponse.json({ aftercareTask: data ? normalizeAftercareTask(data) : null }, { status: 201 });
}
