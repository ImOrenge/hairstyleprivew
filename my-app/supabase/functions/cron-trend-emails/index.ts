/**
 * cron-trend-emails
 * Sends due trend_alerts to active paid subscription users.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "HairStyle <onboarding@resend.dev>";
const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") ?? "https://haristyle.app";

const ALERT_BATCH_SIZE = 5;

type TrendAlert = {
  id: string;
  title: string;
  body_html: string;
  target_plans: string[];
};

type SubscriptionRow = {
  user_id: string;
  plan_key: string;
};

type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
};

async function fetchTargetSubscriptions(
  supabase: ReturnType<typeof createClient>,
  targetPlans: string[],
): Promise<{ subscriptions: SubscriptionRow[]; error: string | null }> {
  const subscriptions: SubscriptionRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("user_subscriptions")
      .select("user_id,plan_key")
      .in("plan_key", targetPlans)
      .in("status", ["trialing", "active"])
      .range(from, from + pageSize - 1);

    if (error) {
      return { subscriptions, error: error.message };
    }

    const page = (data ?? []) as SubscriptionRow[];
    subscriptions.push(...page);

    if (page.length < pageSize) {
      return { subscriptions, error: null };
    }
  }
}

async function fetchSentUserIds(
  supabase: ReturnType<typeof createClient>,
  alertId: string,
  userIds: string[],
): Promise<{ userIds: Set<string>; error: string | null }> {
  const sentUserIds = new Set<string>();
  const chunkSize = 500;

  for (let index = 0; index < userIds.length; index += chunkSize) {
    const chunk = userIds.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from("trend_alert_deliveries")
      .select("user_id")
      .eq("alert_id", alertId)
      .eq("status", "sent")
      .in("user_id", chunk);

    if (error) {
      return { userIds: sentUserIds, error: error.message };
    }

    for (const delivery of data ?? []) {
      sentUserIds.add(delivery.user_id as string);
    }
  }

  return { userIds: sentUserIds, error: null };
}

async function fetchUsersByIds(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
): Promise<{ users: UserRow[]; error: string | null }> {
  const users: UserRow[] = [];
  const chunkSize = 500;

  for (let index = 0; index < userIds.length; index += chunkSize) {
    const chunk = userIds.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from("users")
      .select("id,email,display_name")
      .in("id", chunk);

    if (error) {
      return { users, error: error.message };
    }

    users.push(...((data ?? []) as UserRow[]));
  }

  return { users, error: null };
}

function resolveHtml(html: string, user: UserRow) {
  return html
    .replace(/\{\{APP_URL\}\}/g, APP_URL)
    .replace(/\{\{CTA_URL\}\}/g, `${APP_URL}/upload`)
    .replace(/\{\{USER_NAME\}\}/g, user.display_name ?? "customer");
}

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

  const { data: alerts, error: alertError } = await supabase
    .from("trend_alerts")
    .select("id,title,body_html,target_plans")
    .lte("scheduled_send_at", new Date().toISOString())
    .is("sent_at", null)
    .order("scheduled_send_at", { ascending: true })
    .limit(ALERT_BATCH_SIZE);

  if (alertError) {
    console.error("[cron-trend-emails] alert fetch error:", alertError.message);
    return new Response(JSON.stringify({ error: alertError.message }), { status: 500 });
  }

  const pendingAlerts = (alerts ?? []) as TrendAlert[];
  if (pendingAlerts.length === 0) {
    return new Response(JSON.stringify({ sent: 0, failed: 0, message: "no pending trend alerts" }), {
      status: 200,
    });
  }

  let totalSent = 0;
  let totalFailed = 0;

  for (const alert of pendingAlerts) {
    const targetPlans = alert.target_plans?.length ? alert.target_plans : ["standard", "pro", "salon"];

    const { subscriptions, error: subscriptionError } = await fetchTargetSubscriptions(supabase, targetPlans);

    if (subscriptionError) {
      console.error(`[cron-trend-emails] subscription fetch error alert=${alert.id}:`, subscriptionError);
      totalFailed++;
      continue;
    }

    const targetUserIds = [...new Set(subscriptions.map((subscription) => subscription.user_id))];

    if (targetUserIds.length === 0) {
      await supabase
        .from("trend_alerts")
        .update({ sent_at: new Date().toISOString(), sent_count: 0 })
        .eq("id", alert.id);
      continue;
    }

    const { userIds: alreadySentUserIds, error: deliveryFetchError } = await fetchSentUserIds(
      supabase,
      alert.id,
      targetUserIds,
    );

    if (deliveryFetchError) {
      console.error(`[cron-trend-emails] delivery fetch error alert=${alert.id}:`, deliveryFetchError);
      totalFailed++;
      continue;
    }

    const unsentUserIds = targetUserIds.filter((userId) => !alreadySentUserIds.has(userId));

    if (unsentUserIds.length === 0) {
      await supabase
        .from("trend_alerts")
        .update({
          sent_at: new Date().toISOString(),
          sent_count: alreadySentUserIds.size,
        })
        .eq("id", alert.id);
      continue;
    }

    const { users: fetchedUsers, error: userFetchError } = await fetchUsersByIds(supabase, unsentUserIds);

    if (userFetchError) {
      console.error(`[cron-trend-emails] user fetch error alert=${alert.id}:`, userFetchError);
      totalFailed++;
      continue;
    }

    const users = fetchedUsers.filter((user) => user.email);
    let alertSent = 0;
    let alertFailed = 0;

    for (const user of users) {
      const html = resolveHtml(alert.body_html, user);
      const { messageId, error: sendError } = await sendEmail(user.email as string, alert.title, html);

      if (sendError || !messageId) {
        alertFailed++;
        await supabase.from("trend_alert_deliveries").upsert(
          {
            alert_id: alert.id,
            user_id: user.id,
            email: user.email,
            status: "failed",
            email_message_id: null,
            error_message: sendError ?? "missing message id",
            sent_at: null,
          },
          { onConflict: "alert_id,user_id" },
        );
        continue;
      }

      const { error: deliveryUpdateError } = await supabase.from("trend_alert_deliveries").upsert(
        {
          alert_id: alert.id,
          user_id: user.id,
          email: user.email,
          status: "sent",
          email_message_id: messageId,
          error_message: null,
          sent_at: new Date().toISOString(),
        },
        { onConflict: "alert_id,user_id" },
      );

      if (deliveryUpdateError) {
        console.error(`[cron-trend-emails] delivery update error alert=${alert.id}:`, deliveryUpdateError.message);
        alertFailed++;
      } else {
        alertSent++;
      }
    }

    const { count: sentCount } = await supabase
      .from("trend_alert_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("alert_id", alert.id)
      .eq("status", "sent");

    const sentTotalForAlert = sentCount ?? alreadySentUserIds.size + alertSent;
    const allKnownRecipientsSent = sentTotalForAlert >= users.length + alreadySentUserIds.size && alertFailed === 0;

    await supabase
      .from("trend_alerts")
      .update({
        sent_count: sentTotalForAlert,
        sent_at: allKnownRecipientsSent ? new Date().toISOString() : null,
      })
      .eq("id", alert.id);

    totalSent += alertSent;
    totalFailed += alertFailed;
  }

  console.log(`[cron-trend-emails] sent=${totalSent} failed=${totalFailed}`);
  return new Response(JSON.stringify({ sent: totalSent, failed: totalFailed }), { status: 200 });
});
