import { NextResponse } from "next/server";
import {
  AFTERCARE_COLUMNS,
  getSalonOwnerContext,
  isAftercareChannel,
  isAftercareStatus,
  normalizeAftercareTask,
  parseNullableIso,
  trimString,
} from "../../../../../lib/salon-crm";

interface Params {
  params: Promise<{ taskId: string }>;
}

interface PatchAftercareRequest {
  channel?: unknown;
  status?: unknown;
  scheduledFor?: unknown;
  templateKey?: unknown;
  note?: unknown;
}

export async function PATCH(request: Request, { params }: Params) {
  const context = await getSalonOwnerContext();
  if (!context.ok) {
    return context.response;
  }

  const { taskId } = await params;
  const id = taskId?.trim();
  if (!id) {
    return NextResponse.json({ error: "task id is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as PatchAftercareRequest;
  const updates: Record<string, unknown> = {};

  if (isAftercareChannel(body.channel)) {
    updates.channel = body.channel;
  }

  if (isAftercareStatus(body.status)) {
    updates.status = body.status;
    updates.completed_at = body.status === "done" ? new Date().toISOString() : null;
  }

  if (body.scheduledFor !== undefined) {
    const scheduledFor = parseNullableIso(body.scheduledFor);
    if (!scheduledFor) {
      return NextResponse.json({ error: "scheduledFor is invalid" }, { status: 400 });
    }
    updates.scheduled_for = scheduledFor;
  }

  if (typeof body.templateKey === "string") {
    updates.template_key = trimString(body.templateKey, 80) || null;
  }

  if (typeof body.note === "string") {
    updates.note = trimString(body.note, 1200) || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("salon_aftercare_tasks")
    .update(updates)
    .eq("owner_user_id", context.userId)
    .eq("id", id)
    .select(AFTERCARE_COLUMNS)
    .single<Record<string, unknown>>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ aftercareTask: data ? normalizeAftercareTask(data) : null }, { status: 200 });
}
