import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../lib/admin-auth";

const RANGES = [7, 30, 90] as const;
type RangeDays = (typeof RANGES)[number];
const LEAD_STAGES = ["new", "qualified", "negotiation", "contracted", "dropped"] as const;
type LeadStage = (typeof LEAD_STAGES)[number];

interface CreatedAtRow {
  created_at: string;
}

interface PaymentRow extends CreatedAtRow {
  amount: number;
}

interface GenerationRow extends CreatedAtRow {
  status: string;
}

interface ReviewRow extends CreatedAtRow {
  is_hidden: boolean;
}

interface LeadRow extends CreatedAtRow {
  stage: LeadStage;
}

function parseRange(value: string | null): RangeDays {
  const parsed = Number(value);
  if (!RANGES.includes(parsed as RangeDays)) {
    return 30;
  }

  return parsed as RangeDays;
}

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function buildDateKeys(days: number, end: Date) {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - i);
    keys.push(toDateKey(date));
  }
  return keys;
}

function keyFromIso(iso: string) {
  return iso.slice(0, 10);
}

export async function GET(request: Request) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const url = new URL(request.url);
  const range = parseRange(url.searchParams.get("range"));
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - (range - 1));
  start.setUTCHours(0, 0, 0, 0);
  const endIso = end.toISOString();
  const startIso = start.toISOString();

  const [usersRes, paymentsRes, generationsRes, reviewsRes, leadsRes] = await Promise.all([
    context.supabase
      .from("users")
      .select("created_at")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .returns<CreatedAtRow[]>(),
    context.supabase
      .from("payment_transactions")
      .select("created_at,amount")
      .eq("status", "paid")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .returns<PaymentRow[]>(),
    context.supabase
      .from("generations")
      .select("created_at,status")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .returns<GenerationRow[]>(),
    context.supabase
      .from("generation_reviews")
      .select("created_at,is_hidden")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .returns<ReviewRow[]>(),
    context.supabase
      .from("b2b_leads")
      .select("created_at,stage")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .returns<LeadRow[]>(),
  ]);

  const errors = [usersRes.error, paymentsRes.error, generationsRes.error, reviewsRes.error, leadsRes.error].filter(
    (error): error is NonNullable<typeof usersRes.error> => Boolean(error),
  );
  if (errors.length > 0) {
    return NextResponse.json({ error: errors[0].message }, { status: 500 });
  }

  const users = usersRes.data || [];
  const payments = paymentsRes.data || [];
  const generations = generationsRes.data || [];
  const reviews = reviewsRes.data || [];
  const leads = leadsRes.data || [];

  const keys = buildDateKeys(range, end);
  const dailyMap = new Map(
    keys.map((date) => [
      date,
      {
        date,
        newUsers: 0,
        generationsCompleted: 0,
        reviews: 0,
        b2bLeads: 0,
        paidOrders: 0,
        revenueKrw: 0,
      },
    ]),
  );

  for (const row of users) {
    const key = keyFromIso(row.created_at);
    const target = dailyMap.get(key);
    if (target) {
      target.newUsers += 1;
    }
  }

  for (const row of generations) {
    if (row.status !== "completed") {
      continue;
    }
    const key = keyFromIso(row.created_at);
    const target = dailyMap.get(key);
    if (target) {
      target.generationsCompleted += 1;
    }
  }

  for (const row of reviews) {
    const key = keyFromIso(row.created_at);
    const target = dailyMap.get(key);
    if (target) {
      target.reviews += 1;
    }
  }

  for (const row of leads) {
    const key = keyFromIso(row.created_at);
    const target = dailyMap.get(key);
    if (target) {
      target.b2bLeads += 1;
    }
  }

  for (const row of payments) {
    const key = keyFromIso(row.created_at);
    const target = dailyMap.get(key);
    if (target) {
      target.paidOrders += 1;
      target.revenueKrw += Number(row.amount || 0);
    }
  }

  const totalRevenue = payments.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const completedGenerations = generations.filter((row) => row.status === "completed").length;
  const hiddenReviews = reviews.filter((row) => row.is_hidden).length;
  const leadStageCounts = LEAD_STAGES.map((stage) => ({
    stage,
    count: leads.filter((lead) => lead.stage === stage).length,
  }));

  return NextResponse.json(
    {
      rangeDays: range,
      window: {
        start: startIso,
        end: endIso,
      },
      kpis: {
        newUsers: users.length,
        paidOrders: payments.length,
        revenueKrw: totalRevenue,
        generationsCompleted: completedGenerations,
        reviewsSubmitted: reviews.length,
        hiddenReviews,
        b2bLeads: leads.length,
      },
      daily: keys
        .map((key) => dailyMap.get(key))
        .filter(
          (
            item,
          ): item is {
            date: string;
            newUsers: number;
            generationsCompleted: number;
            reviews: number;
            b2bLeads: number;
            paidOrders: number;
            revenueKrw: number;
          } => Boolean(item),
        ),
      leadStages: leadStageCounts,
    },
    { status: 200 },
  );
}
