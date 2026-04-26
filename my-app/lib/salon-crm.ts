import "server-only";

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ensureCurrentUserProfile, type ServerSupabaseLike } from "./style-profile-server";
import { getSupabaseAdminClient, isSupabaseConfigured } from "./supabase";
import type {
  SalonAftercareChannel,
  SalonAftercareStatus,
  SalonAftercareTask,
  SalonCustomer,
  SalonCustomerSource,
  SalonVisit,
} from "./salon-crm-types";

export const CUSTOMER_COLUMNS =
  "id,owner_user_id,linked_user_id,source,name,phone,email,memo,consent_sms,consent_kakao,last_visit_at,next_follow_up_at,archived_at,created_at,updated_at";
export const VISIT_COLUMNS =
  "id,owner_user_id,customer_id,visited_at,service_note,memo,next_recommended_visit_at,created_at,updated_at";
export const AFTERCARE_COLUMNS =
  "id,owner_user_id,customer_id,channel,status,scheduled_for,template_key,note,completed_at,created_at,updated_at";

type QueryError = { message: string } | null;
type QueryResult<T> = Promise<{ data: T | null; error: QueryError }>;
type QueryListResult<T> = Promise<{ data: T[] | null; error: QueryError }>;

export interface SalonCrmSupabase {
  from: (table: string) => {
    select: (columns: string, options?: Record<string, unknown>) => QueryBuilder;
    insert: (values: Record<string, unknown>) => MutationBuilder;
    update: (values: Record<string, unknown>) => UpdateBuilder;
  };
}

interface QueryBuilder extends PromiseLike<{ data: Record<string, unknown>[] | null; error: QueryError }> {
  eq: (column: string, value: unknown) => QueryBuilder;
  neq: (column: string, value: unknown) => QueryBuilder;
  is: (column: string, value: unknown) => QueryBuilder;
  ilike: (column: string, value: string) => QueryBuilder;
  or: (filters: string) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  maybeSingle: <T = Record<string, unknown>>() => QueryResult<T>;
  single: <T = Record<string, unknown>>() => QueryResult<T>;
}

interface MutationBuilder {
  select: (columns: string) => {
    single: <T = Record<string, unknown>>() => QueryResult<T>;
  };
}

interface UpdateBuilder {
  eq: (column: string, value: unknown) => UpdateBuilder;
  select: (columns: string) => {
    single: <T = Record<string, unknown>>() => QueryResult<T>;
  };
  then: Promise<{ error: QueryError }>["then"];
}

export function trimString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

export function parseNullableIso(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function isSalonCustomerSource(value: unknown): value is SalonCustomerSource {
  return value === "manual" || value === "linked_member";
}

export function isAftercareChannel(value: unknown): value is SalonAftercareChannel {
  return value === "sms" || value === "kakao" || value === "phone" || value === "manual";
}

export function isAftercareStatus(value: unknown): value is SalonAftercareStatus {
  return value === "pending" || value === "done" || value === "canceled";
}

function stringField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function nullableStringField(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function normalizeCustomer(row: Record<string, unknown>): SalonCustomer {
  const linkedUserId = nullableStringField(row, "linked_user_id");
  const source = isSalonCustomerSource(row.source) ? row.source : "manual";

  return {
    id: stringField(row, "id"),
    linkedUserId,
    source,
    name: stringField(row, "name"),
    phone: stringField(row, "phone"),
    email: stringField(row, "email"),
    memo: stringField(row, "memo"),
    consentSms: row.consent_sms === true,
    consentKakao: row.consent_kakao === true,
    lastVisitAt: nullableStringField(row, "last_visit_at"),
    nextFollowUpAt: nullableStringField(row, "next_follow_up_at"),
    archivedAt: nullableStringField(row, "archived_at"),
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
    isLinkedMember: source === "linked_member" && Boolean(linkedUserId),
  };
}

export function normalizeVisit(row: Record<string, unknown>): SalonVisit {
  return {
    id: stringField(row, "id"),
    customerId: stringField(row, "customer_id"),
    visitedAt: stringField(row, "visited_at"),
    serviceNote: stringField(row, "service_note"),
    memo: stringField(row, "memo"),
    nextRecommendedVisitAt: nullableStringField(row, "next_recommended_visit_at"),
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
  };
}

export function normalizeAftercareTask(row: Record<string, unknown>): SalonAftercareTask {
  return {
    id: stringField(row, "id"),
    customerId: stringField(row, "customer_id"),
    channel: isAftercareChannel(row.channel) ? row.channel : "manual",
    status: isAftercareStatus(row.status) ? row.status : "pending",
    scheduledFor: stringField(row, "scheduled_for"),
    templateKey: nullableStringField(row, "template_key"),
    note: stringField(row, "note"),
    completedAt: nullableStringField(row, "completed_at"),
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
  };
}

export async function getSalonOwnerContext() {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!isSupabaseConfigured()) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Supabase is not configured" }, { status: 503 }),
    };
  }

  const supabase = getSupabaseAdminClient() as unknown as SalonCrmSupabase & ServerSupabaseLike;
  const ensured = await ensureCurrentUserProfile(userId, supabase);
  if (ensured.error) {
    return { ok: false as const, response: NextResponse.json({ error: ensured.error.message }, { status: 500 }) };
  }

  const { data, error } = await supabase
    .from("users")
    .select("account_type")
    .eq("id", userId)
    .maybeSingle<{ account_type?: string | null }>();

  if (error) {
    return { ok: false as const, response: NextResponse.json({ error: error.message }, { status: 500 }) };
  }

  if (data?.account_type !== "salon_owner") {
    return { ok: false as const, response: NextResponse.json({ error: "Salon owner account required" }, { status: 403 }) };
  }

  return { ok: true as const, userId, supabase };
}

export async function loadOwnerCustomer(
  supabase: SalonCrmSupabase,
  ownerUserId: string,
  customerId: string,
) {
  const { data, error } = await supabase
    .from("salon_customers")
    .select(CUSTOMER_COLUMNS)
    .eq("owner_user_id", ownerUserId)
    .eq("id", customerId)
    .is("archived_at", null)
    .maybeSingle<Record<string, unknown>>();

  if (error) {
    return { error: error.message, status: 500 as const };
  }

  if (!data) {
    return { error: "Customer not found", status: 404 as const };
  }

  return { customer: normalizeCustomer(data) };
}

export async function runList<T>(query: QueryBuilder): QueryListResult<T> {
  return query as unknown as QueryListResult<T>;
}
