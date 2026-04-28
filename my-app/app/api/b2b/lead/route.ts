import { NextResponse } from "next/server";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../lib/supabase";
import { trimText } from "../../../../lib/onboarding";

interface LeadRequestBody {
  companyName?: unknown;
  contactName?: unknown;
  email?: unknown;
  phone?: unknown;
  message?: unknown;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as LeadRequestBody;
  const companyName = trimText(body.companyName, 120);
  const contactName = trimText(body.contactName, 80);
  const email = trimText(body.email, 160).toLowerCase();
  const phone = trimText(body.phone, 40);
  const message = trimText(body.message, 2000);

  if (!companyName || !contactName || !email || !message) {
    return NextResponse.json({ error: "companyName, contactName, email, message are required" }, { status: 400 });
  }

  if (!isEmail(email)) {
    return NextResponse.json({ error: "email format is invalid" }, { status: 400 });
  }

  if (message.length < 5) {
    return NextResponse.json({ error: "message must be at least 5 characters" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("b2b_leads")
    .insert({
      company_name: companyName,
      contact_name: contactName,
      email,
      phone: phone || null,
      message,
      stage: "new",
      source: "public_form",
    })
    .select("id,company_name,contact_name,email,phone,message,stage,source,created_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lead: data }, { status: 201 });
}

