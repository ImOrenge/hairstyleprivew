import "server-only";

import { homeFaqs } from "./home-content";
import { getSupabaseAdminClient, isSupabaseConfigured } from "./supabase";
import { isSupportPostKind, type SupportPostKind, type SupportPostStatus } from "./support-types";

export interface PublicSupportFaq {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
  updatedAt: string | null;
}

export interface PublicSupportPost {
  id: string;
  kind: SupportPostKind;
  status: SupportPostStatus;
  title: string;
  bodyPreview: string;
  authorDisplayName: string;
  adminAnswer: string | null;
  adminAnsweredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportPostDetail extends PublicSupportPost {
  body: string;
  authorUserId: string;
}

interface SupportFaqRow {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  sort_order: number | null;
  updated_at: string | null;
}

interface SupportPostRow {
  id: string;
  kind: SupportPostKind;
  status: SupportPostStatus;
  title: string;
  body: string;
  author_user_id: string;
  author_display_name: string;
  admin_answer: string | null;
  admin_answered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoadSupportPostsOptions {
  kind?: SupportPostKind | "all";
  q?: string;
  limit?: number;
}

function fallbackFaqs(): PublicSupportFaq[] {
  return homeFaqs.map((faq, index) => ({
    id: `fallback-${index + 1}`,
    question: faq.question,
    answer: faq.answer,
    category: "general",
    sortOrder: index + 1,
    updatedAt: null,
  }));
}

function escapeSearchValue(value: string) {
  return value.replace(/[%,()]/g, "");
}

function normalizeFaq(row: SupportFaqRow): PublicSupportFaq {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    category: row.category || "general",
    sortOrder: Number.isInteger(row.sort_order) ? Number(row.sort_order) : 0,
    updatedAt: row.updated_at,
  };
}

function normalizePost(row: SupportPostRow): PublicSupportPost {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    title: row.title,
    bodyPreview: row.body.length > 180 ? `${row.body.slice(0, 180)}...` : row.body,
    authorDisplayName: row.author_display_name,
    adminAnswer: row.admin_answer,
    adminAnsweredAt: row.admin_answered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadPublishedSupportFaqs(limit = 80): Promise<PublicSupportFaq[]> {
  if (!isSupabaseConfigured()) {
    return fallbackFaqs();
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("support_faqs")
      .select("id,question,answer,category,sort_order,updated_at")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(limit)
      .returns<SupportFaqRow[]>();

    if (error) {
      console.warn("[support] Failed to load support_faqs:", error.message);
      return fallbackFaqs();
    }

    return (data || []).map(normalizeFaq);
  } catch (error) {
    console.warn("[support] Unexpected FAQ load failure:", error);
    return fallbackFaqs();
  }
}

export async function loadPublicSupportPosts({
  kind = "all",
  limit = 60,
  q = "",
}: LoadSupportPostsOptions = {}): Promise<PublicSupportPost[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const search = escapeSearchValue(q.trim().slice(0, 100));
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from("support_posts")
    .select(
      "id,kind,status,title,body,author_user_id,author_display_name,admin_answer,admin_answered_at,created_at,updated_at",
    )
    .is("deleted_at", null)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(Math.min(100, Math.max(10, limit)));

  if (isSupportPostKind(kind)) {
    query = query.eq("kind", kind);
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,body.ilike.%${search}%,author_display_name.ilike.%${search}%`);
  }

  const { data, error } = await query.returns<SupportPostRow[]>();
  if (error) {
    console.warn("[support] Failed to load support_posts:", error.message);
    return [];
  }

  return (data || []).map(normalizePost);
}

export async function loadPublicSupportPostDetail(id: string): Promise<SupportPostDetail | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("support_posts")
    .select(
      "id,kind,status,title,body,author_user_id,author_display_name,admin_answer,admin_answered_at,created_at,updated_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .eq("is_hidden", false)
    .maybeSingle<SupportPostRow>();

  if (error || !data) {
    return null;
  }

  return {
    ...normalizePost(data),
    body: data.body,
    authorUserId: data.author_user_id,
  };
}
