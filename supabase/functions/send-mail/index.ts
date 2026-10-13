// NextStep AI — دالة الإرسال عبر SMTP (Supabase Edge Function)
// تتحقق من أن المستدعي مشرف مسجّل، ثم ترسل الرسائل عبر خادم SMTP الخاص بك.
// الأسرار المطلوبة: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL
// اختيارية: SMTP_FROM_NAME, SMTP_REPLY_TO, DAILY_LIMIT

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_ITEMS = 25;
const MAX_HTML = 200_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) هوية المستدعي
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user?.email) return json({ error: "unauthorized" }, 401);

    // 2) هل هو مشرف؟
    const db = createClient(url, service, { auth: { persistSession: false } });
    const { data: adm } = await db.from("admins").select("email").eq("email", user.email.toLowerCase()).maybeSingle();
    if (!adm) return json({ error: "forbidden" }, 403);

    // 3) إعدادات SMTP
    const host = Deno.env.get("SMTP_HOST");
    const port = Number(Deno.env.get("SMTP_PORT") ?? "465");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    const fromEmail = Deno.env.get("SMTP_FROM_EMAIL") ?? smtpUser;
    const fromName = Deno.env.get("SMTP_FROM_NAME") ?? "NextStep AI";
    const replyTo = Deno.env.get("SMTP_REPLY_TO") || undefined;
    const dailyLimit = Number(Deno.env.get("DAILY_LIMIT") ?? "400");
    const configured = !!(host && smtpUser && smtpPass && fromEmail);

    // 4) الحصة اليومية
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const { count } = await db.from("mail_log").select("id", { count: "exact", head: true })
      .eq("status", "sent").gte("created_at", dayStart.toISOString());
    const sentToday = count ?? 0;
    const remaining = Math.max(0, dailyLimit - sentToday);

    const body = await req.json().catch(() => ({}));
    if (body.action === "ping") return json({ configured, dailyLimit, sentToday, remaining });
    if (!configured) return json({ error: "smtp_not_configured" }, 500);

    // 5) التحقق من المدخلات
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return json({ error: "no_items" }, 400);
    if (items.length > MAX_ITEMS) return json({ error: `max_${MAX_ITEMS}_items_per_call` }, 400);
    if (items.length > remaining) return json({ error: "daily_limit_reached", remaining }, 429);
    const subject = String(body.subject ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
    if (!subject) return json({ error: "subject_required" }, 400);
    const campaignId: string | null = typeof body.campaign_id === "string" ? body.campaign_id : null;

    // 6) الإرسال
    const client = new SMTPClient({
      connection: { hostname: host!, port, tls: port === 465, auth: { username: smtpUser!, password: smtpPass! } },
    });
    const results: { email: string; ok: boolean; error?: string }[] = [];
    const logRows: Record<string, unknown>[] = [];

    for (const it of items) {
      const email = String(it?.email ?? "").trim().toLowerCase();
      const name = String(it?.name ?? "").slice(0, 120);
      const html = String(it?.html ?? "");
      let ok = false, err = "";
      if (!EMAIL_RE.test(email)) err = "invalid_email";
      else if (!html || html.length > MAX_HTML) err = "invalid_html";
      else {
        try {
          await client.send({
            from: `${fromName} <${fromEmail}>`,
            to: email,
            subject,
            replyTo,
            content: "تعذّر عرض الرسالة. افتحها في عميل بريد يدعم HTML.",
            html,
          });
          ok = true;
        } catch (e) { err = String((e as Error)?.message ?? e).slice(0, 300); }
      }
      results.push({ email, ok, error: ok ? undefined : err });
      logRows.push({ campaign_id: campaignId, email, name, status: ok ? "sent" : "failed", error: ok ? null : err });
      await sleep(300);
    }
    try { await client.close(); } catch (_) { /* ignore */ }

    if (logRows.length) await db.from("mail_log").insert(logRows);
    return json({ results, remaining: remaining - results.filter((r) => r.ok).length });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
