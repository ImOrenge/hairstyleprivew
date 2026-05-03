/**
 * cron-care-emails
 * 매일 09:00 KST(00:00 UTC) 실행
 * user_care_contents에서 오늘 발송 예정인 항목을 조회하여 Resend로 발송합니다.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") ?? "HairStyle <onboarding@resend.dev>";
const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") ?? "https://haristyle.app";

const BATCH_SIZE = 50; // 1회 실행 당 최대 발송 수

async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ messageId: string | null; error: string | null }> {
  if (!RESEND_API_KEY) {
    return { messageId: null, error: "Missing RESEND_API_KEY" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { messageId: null, error: `Resend error ${res.status}: ${text}` };
    }

    const data = (await res.json()) as { id?: string };
    return { messageId: data.id ?? null, error: data.id ? null : "Resend response missing id" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { messageId: null, error: message };
  }
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 오늘 발송 예정이고 아직 보내지 않은 항목 조회
  // scheduled_send_at <= now() AND sent_at IS NULL
  const { data: rows, error: fetchError } = await supabase
    .from("user_care_contents")
    .select(
      `
      id,
      subject,
      body_html,
      content_type,
      hair_record:user_hair_records!inner(
        user_id
      )
    `,
    )
    .lte("scheduled_send_at", new Date().toISOString())
    .is("sent_at", null)
    .limit(BATCH_SIZE);

  if (fetchError) {
    console.error("[cron-care-emails] fetch error:", fetchError.message);
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
  }

  const pending = (rows ?? []) as unknown as Array<{
    id: string;
    subject: string;
    body_html: string;
    content_type: string;
    hair_record: { user_id: string };
  }>;

  if (pending.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: "no pending emails" }), { status: 200 });
  }

  // user_id 목록 수집 → Clerk 없이 Supabase auth.users에서 이메일 조회
  const userIds = [...new Set(pending.map((r) => r.hair_record.user_id))];

  const { data: userRows, error: userFetchError } = await supabase
    .from("users")
    .select("id, email, display_name")
    .in("id", userIds);

  if (userFetchError) {
    console.error("[cron-care-emails] user fetch error:", userFetchError.message);
    // 이메일을 모르면 발송 불가 → 조용히 종료
    return new Response(JSON.stringify({ error: userFetchError.message }), { status: 500 });
  }

  const emailByUserId = new Map<string, { email: string; name: string | null }>();
  for (const u of userRows ?? []) {
    if (u.email) {
      emailByUserId.set(u.id as string, { email: u.email as string, name: u.display_name as string | null });
    }
  }

  let sentCount = 0;
  let failCount = 0;

  for (const row of pending) {
    const userId = row.hair_record.user_id;
    const userInfo = emailByUserId.get(userId);

    if (!userInfo) {
      console.warn(`[cron-care-emails] no email for user ${userId}, skipping id=${row.id}`);
      failCount++;
      continue;
    }

    // {{CTA_URL}} 등 남은 플레이스홀더 치환
    const resolvedHtml = row.body_html
      .replace(/\{\{CTA_URL\}\}/g, `${APP_URL}/mypage`)
      .replace(/\{\{USER_NAME\}\}/g, userInfo.name ?? "고객");

    const { messageId, error: sendError } = await sendEmail(userInfo.email, row.subject, resolvedHtml);

    if (sendError || !messageId) {
      console.error(`[cron-care-emails] send failed id=${row.id}:`, sendError ?? "missing message id");
      failCount++;
      continue;
    }

    const { error: updateError } = await supabase
      .from("user_care_contents")
      .update({
        sent_at: new Date().toISOString(),
        email_message_id: messageId,
      })
      .eq("id", row.id);

    if (updateError) {
      console.error(`[cron-care-emails] update failed id=${row.id}:`, updateError.message);
      failCount++;
    } else {
      sentCount++;
    }
  }

  console.log(`[cron-care-emails] sent=${sentCount} fail=${failCount}`);
  return new Response(JSON.stringify({ sent: sentCount, fail: failCount }), { status: 200 });
});
