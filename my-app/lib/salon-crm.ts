import "server-only";

import { getApiContext } from "./rbac-server";
import type {
  SalonAftercareChannel,
  SalonAftercareStatus,
  SalonAftercareTask,
  SalonCustomer,
  SalonCustomerSource,
  SalonLinkedMember,
  SalonMatchCandidate,
  SalonMatchInvite,
  SalonMatchStatus,
  SalonMemberGenerationSummary,
  SalonVisit,
} from "./salon-crm-types";

export const CUSTOMER_COLUMNS =
  "id,owner_user_id,linked_user_id,source,name,phone,email,memo,consent_sms,consent_kakao,last_visit_at,next_follow_up_at,archived_at,created_at,updated_at";
export const VISIT_COLUMNS =
  "id,owner_user_id,customer_id,visited_at,service_note,memo,next_recommended_visit_at,created_at,updated_at";
export const AFTERCARE_COLUMNS =
  "id,owner_user_id,customer_id,channel,status,scheduled_for,template_key,note,completed_at,created_at,updated_at";
export const MATCH_INVITE_COLUMNS =
  "id,owner_user_id,code,active,expires_at,created_at,updated_at";
export const MATCH_REQUEST_COLUMNS =
  "id,owner_user_id,member_user_id,invite_id,status,linked_customer_id,created_at,updated_at";
export const LINKED_MEMBER_COLUMNS = "id,email,display_name,avatar_url";
export const GENERATION_SUMMARY_COLUMNS = "id,status,prompt_used,options,created_at";

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
  in: (column: string, values: unknown[]) => QueryBuilder;
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
  neq: (column: string, value: unknown) => UpdateBuilder;
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

export function isSalonMatchStatus(value: unknown): value is SalonMatchStatus {
  return value === "pending" || value === "linked" || value === "revoked";
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

export function normalizeMatchInvite(row: Record<string, unknown>, inviteUrl?: string): SalonMatchInvite {
  return {
    id: stringField(row, "id"),
    ownerUserId: stringField(row, "owner_user_id"),
    code: stringField(row, "code"),
    active: row.active === true,
    expiresAt: nullableStringField(row, "expires_at"),
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
    inviteUrl,
  };
}

export function normalizeLinkedMember(row: Record<string, unknown> | null): SalonLinkedMember | null {
  if (!row) {
    return null;
  }

  const id = stringField(row, "id");
  if (!id) {
    return null;
  }

  const email = stringField(row, "email");
  const displayName = nullableStringField(row, "display_name") || email || "HairFit member";

  return {
    id,
    email,
    displayName,
    avatarUrl: nullableStringField(row, "avatar_url"),
  };
}

export function normalizeMatchCandidate(
  row: Record<string, unknown>,
  memberRow: Record<string, unknown> | null,
): SalonMatchCandidate | null {
  const member = normalizeLinkedMember(memberRow);
  if (!member) {
    return null;
  }

  return {
    id: stringField(row, "id"),
    ownerUserId: stringField(row, "owner_user_id"),
    memberUserId: stringField(row, "member_user_id"),
    inviteId: nullableStringField(row, "invite_id"),
    status: isSalonMatchStatus(row.status) ? row.status : "pending",
    linkedCustomerId: nullableStringField(row, "linked_customer_id"),
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
    member,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeGenerationSummary(row: Record<string, unknown>): SalonMemberGenerationSummary {
  const options = isRecord(row.options) ? row.options : {};
  const recommendationSet = isRecord(options.recommendationSet) ? options.recommendationSet : null;
  const selectedVariantId =
    recommendationSet && typeof recommendationSet.selectedVariantId === "string"
      ? recommendationSet.selectedVariantId
      : null;
  const variants = recommendationSet && Array.isArray(recommendationSet.variants)
    ? recommendationSet.variants
    : [];
  const selectedVariant = variants.find((variant) => {
    return isRecord(variant) && selectedVariantId && variant.id === selectedVariantId;
  });
  const fallbackVariant = variants.find((variant) => isRecord(variant));
  const variant = isRecord(selectedVariant) ? selectedVariant : isRecord(fallbackVariant) ? fallbackVariant : null;
  const styleLabel = variant && typeof variant.label === "string" ? variant.label : null;

  return {
    id: stringField(row, "id"),
    status: stringField(row, "status") || "unknown",
    promptUsed: nullableStringField(row, "prompt_used"),
    styleLabel,
    generatedImagePath: nullableStringField(row, "generated_image_path"),
    createdAt: stringField(row, "created_at"),
  };
}

export async function getSalonOwnerContext(access: "read" | "write" = "write") {
  const context = await getApiContext(access === "read" ? "salon:read" : "salon:write");
  if (!context.ok) {
    return context;
  }

  return {
    ok: true as const,
    userId: context.userId,
    actor: context.actor,
    supabase: context.supabase as unknown as SalonCrmSupabase,
  };
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
