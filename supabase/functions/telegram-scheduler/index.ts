// Telegram Scheduler — Edge Function for scheduled notifications
// Actions: daily_summary, report_reminder, deadline_check

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendMessage, inlineKeyboard } from "../_shared/botUtils.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const WEBAPP_URL = Deno.env.get("WEBAPP_URL")!;

// ─── Helpers ─────────────────────────────────────────────────

interface Profile {
  user_id: string;
  display_name: string;
  telegram_chat_id: string;
}

async function getRecipients(): Promise<Profile[]> {
  const { data } = await supabase
    .from("profiles")
    .select("user_id, display_name, telegram_chat_id")
    .not("telegram_chat_id", "is", null);
  return (data || []) as Profile[];
}

function progressBar(pct: number): string {
  const filled = Math.round(pct / 10);
  return "▓".repeat(filled) + "░".repeat(10 - filled) + ` ${pct}%`;
}

// ─── Action: daily_summary ───────────────────────────────────

async function dailySummary() {
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, code, end_date")
    .eq("status", "active");

  if (!projects || projects.length === 0) return { sent: 0 };

  // Gather stats per project in parallel
  const stats = await Promise.all(
    projects.map(async (p) => {
      const [pfRes, alertsRes] = await Promise.all([
        supabase.from("plan_fact").select("plan_value, fact_value").eq("project_id", p.id),
        supabase
          .from("alerts")
          .select("id", { count: "exact", head: true })
          .eq("project_id", p.id)
          .eq("is_resolved", false),
      ]);
      const pf = pfRes.data || [];
      const plan = pf.reduce((s, r) => s + Number(r.plan_value || 0), 0);
      const fact = pf.reduce((s, r) => s + Number(r.fact_value || 0), 0);
      const prog = plan > 0 ? Math.round((fact / plan) * 100) : 0;
      return {
        name: p.name,
        code: p.code,
        id: p.id,
        prog,
        alertsCount: alertsRes.count ?? 0,
      };
    }),
  );

  const totalAlerts = stats.reduce((s, p) => s + p.alertsCount, 0);

  let text = `📊 <b>Ежедневная сводка</b>\n`;
  text += `📅 ${new Date().toLocaleDateString("ru-RU")}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (const p of stats) {
    text += `🏗 <b>${p.code || p.name}</b>\n`;
    text += `   ${progressBar(p.prog)}\n`;
    if (p.alertsCount > 0) text += `   ⚠️ Алертов: ${p.alertsCount}\n`;
    text += `\n`;
  }

  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📋 Объектов: <b>${projects.length}</b> · ⚠️ Алертов: <b>${totalAlerts}</b>`;

  const markup = inlineKeyboard([
    [{ text: "📱 Открыть приложение", web_app: { url: WEBAPP_URL } }],
  ]);

  const recipients = await getRecipients();
  let sent = 0;
  for (const r of recipients) {
    await sendMessage(r.telegram_chat_id, text, { reply_markup: markup });
    sent++;
  }
  return { sent, projects: stats.length, alerts: totalAlerts };
}

// ─── Action: report_reminder ─────────────────────────────────

async function reportReminder() {
  const today = new Date().toISOString().split("T")[0];

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, code")
    .eq("status", "active");

  if (!projects || projects.length === 0) return { sent: 0 };

  // Find projects that have NO plan_fact records for today
  const missing: typeof projects = [];
  for (const p of projects) {
    const { count } = await supabase
      .from("plan_fact")
      .select("id", { count: "exact", head: true })
      .eq("project_id", p.id)
      .eq("date", today);
    if ((count ?? 0) === 0) missing.push(p);
  }

  if (missing.length === 0) return { sent: 0, missing: 0 };

  let text = `📝 <b>Напоминание об отчётности</b>\n`;
  text += `📅 ${new Date().toLocaleDateString("ru-RU")}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
  text += `По следующим объектам нет отчёта за сегодня:\n\n`;

  for (const p of missing) {
    text += `🔴 <b>${p.code || p.name}</b>\n`;
  }

  text += `\n⏰ Пожалуйста, внесите данные до конца дня.`;

  const markup = inlineKeyboard([
    [{ text: "📝 Внести отчёт", web_app: { url: `${WEBAPP_URL}/reports` } }],
  ]);

  const recipients = await getRecipients();
  let sent = 0;
  for (const r of recipients) {
    await sendMessage(r.telegram_chat_id, text, { reply_markup: markup });
    sent++;
  }
  return { sent, missing: missing.length };
}

// ─── Action: deadline_check ──────────────────────────────────

async function deadlineCheck() {
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const todayStr = now.toISOString().split("T")[0];
  const in48hStr = in48h.toISOString().split("T")[0];

  const { data: events } = await supabase
    .from("calendar_events")
    .select("id, title, date, type, priority, project_id, projects(name, code)")
    .eq("is_done", false)
    .gte("date", todayStr)
    .lte("date", in48hStr)
    .order("date", { ascending: true });

  if (!events || events.length === 0) return { sent: 0, events: 0 };

  const priorityIcon: Record<string, string> = {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🟢",
  };

  let text = `⏰ <b>Ближайшие дедлайны (48ч)</b>\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (const ev of events) {
    const proj = (ev as any).projects;
    const projLabel = proj ? (proj.code || proj.name) : "—";
    const icon = priorityIcon[ev.priority || "medium"] || "🟡";
    const hoursLeft = Math.round(
      (new Date(ev.date).getTime() - now.getTime()) / (60 * 60 * 1000),
    );
    const timeLabel = hoursLeft <= 0 ? "⚡ сегодня" : `через ${hoursLeft}ч`;

    text += `${icon} <b>${ev.title}</b>\n`;
    text += `   🏗 ${projLabel} · 📅 ${ev.date} (${timeLabel})\n\n`;
  }

  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `Всего событий: <b>${events.length}</b>`;

  const markup = inlineKeyboard([
    [{ text: "📅 Календарь", web_app: { url: `${WEBAPP_URL}/calendar` } }],
  ]);

  const recipients = await getRecipients();
  let sent = 0;
  for (const r of recipients) {
    await sendMessage(r.telegram_chat_id, text, { reply_markup: markup });
    sent++;
  }
  return { sent, events: events.length };
}

// ─── Main handler ────────────────────────────────────────────

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { action } = await req.json();

    let result: Record<string, unknown>;

    switch (action) {
      case "daily_summary":
        result = await dailySummary();
        break;
      case "report_reminder":
        result = await reportReminder();
        break;
      case "deadline_check":
        result = await deadlineCheck();
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
    }

    return new Response(
      JSON.stringify({ ok: true, action, ...result }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Scheduler error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
