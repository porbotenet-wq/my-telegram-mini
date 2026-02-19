// bot-scheduler — Edge Function для плановых уведомлений
// Вызывается pg_cron, ставит события в bot_event_queue
// Действия: daily_summary, report_reminder, deadline_check

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ─── Helpers ─────────────────────────────────────────────

function progressBar(pct: number): string {
  const filled = Math.round(pct / 10);
  return "▓".repeat(filled) + "░".repeat(10 - filled) + ` ${pct}%`;
}

// ─── Action: daily_summary → queue ──────────────────────

async function dailySummary() {
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, code, end_date")
    .eq("status", "active");

  if (!projects?.length) return { queued: 0 };

  const stats = await Promise.all(
    projects.map(async (p) => {
      const [pfRes, alertsRes] = await Promise.all([
        supabase.from("plan_fact").select("plan_value, fact_value").eq("project_id", p.id),
        supabase.from("alerts").select("id", { count: "exact", head: true })
          .eq("project_id", p.id).eq("is_resolved", false),
      ]);
      const pf = pfRes.data || [];
      const plan = pf.reduce((s, r) => s + Number(r.plan_value || 0), 0);
      const fact = pf.reduce((s, r) => s + Number(r.fact_value || 0), 0);
      const prog = plan > 0 ? Math.round((fact / plan) * 100) : 0;
      return { name: p.name, code: p.code, id: p.id, prog, alertsCount: alertsRes.count ?? 0 };
    }),
  );

  const totalAlerts = stats.reduce((s, p) => s + p.alertsCount, 0);

  // Build payload for bot-notify
  const payload = {
    projects: stats,
    total_alerts: totalAlerts,
    date: new Date().toLocaleDateString("ru-RU"),
  };

  // Enqueue for directors and PMs
  const { error } = await supabase.from("bot_event_queue").insert({
    event_type: "director.digest",
    priority: "normal",
    payload,
    target_roles: ["director", "project_manager"],
    scheduled_at: new Date().toISOString(),
  });

  return { queued: error ? 0 : 1, projects: stats.length, alerts: totalAlerts };
}

// ─── Action: report_reminder → queue ────────────────────

async function reportReminder() {
  const today = new Date().toISOString().split("T")[0];

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, code")
    .eq("status", "active");

  if (!projects?.length) return { queued: 0 };

  const missing: typeof projects = [];
  for (const p of projects) {
    const { count } = await supabase
      .from("plan_fact")
      .select("id", { count: "exact", head: true })
      .eq("project_id", p.id)
      .eq("date", today);
    if ((count ?? 0) === 0) missing.push(p);
  }

  if (!missing.length) return { queued: 0, missing: 0 };

  const { error } = await supabase.from("bot_event_queue").insert({
    event_type: "report.missing",
    priority: "normal",
    payload: {
      project_name: missing.map((m) => m.code || m.name).join(", "),
      date: today,
      missing_projects: missing.map((m) => ({ id: m.id, name: m.code || m.name })),
    },
    target_roles: ["foreman1", "foreman2", "foreman3", "project_manager"],
    scheduled_at: new Date().toISOString(),
  });

  return { queued: error ? 0 : 1, missing: missing.length };
}

// ─── Action: deadline_check → queue ─────────────────────

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

  if (!events?.length) return { queued: 0, events: 0 };

  const items = events.map((ev) => {
    const proj = (ev as any).projects;
    const hoursLeft = Math.round(
      (new Date(ev.date).getTime() - now.getTime()) / (60 * 60 * 1000),
    );
    return {
      title: ev.title,
      project: proj ? (proj.code || proj.name) : "—",
      date: ev.date,
      priority: ev.priority || "medium",
      hours_left: hoursLeft,
    };
  });

  const { error } = await supabase.from("bot_event_queue").insert({
    event_type: "deadline.approaching",
    priority: events.some((e) => e.priority === "critical") ? "critical" : "normal",
    payload: { events: items, count: items.length },
    target_roles: ["director", "project_manager"],
    scheduled_at: new Date().toISOString(),
  });

  return { queued: error ? 0 : 1, events: events.length };
}

// ─── Alert overdue check → queue ────────────────────────

async function alertOverdueCheck() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: alerts } = await supabase
    .from("alerts")
    .select("id, title, priority, project_id, created_at, projects(name, code)")
    .eq("is_resolved", false)
    .lt("created_at", cutoff)
    .order("priority", { ascending: false })
    .limit(20);

  if (!alerts?.length) return { queued: 0 };

  // Group by project
  const byProject: Record<string, any[]> = {};
  for (const a of alerts) {
    const pid = a.project_id || "unknown";
    if (!byProject[pid]) byProject[pid] = [];
    const ageHours = Math.round(
      (Date.now() - new Date(a.created_at).getTime()) / (60 * 60 * 1000),
    );
    byProject[pid].push({
      title: a.title,
      priority: a.priority,
      age_hours: ageHours,
    });
  }

  let queued = 0;
  for (const [pid, list] of Object.entries(byProject)) {
    const proj = alerts.find((a) => a.project_id === pid);
    const projData = (proj as any)?.projects;
    const { error } = await supabase.from("bot_event_queue").insert({
      event_type: "alert.overdue",
      priority: list.some((l: any) => l.priority === "critical") ? "critical" : "high",
      project_id: pid !== "unknown" ? pid : null,
      payload: {
        project_name: projData ? (projData.code || projData.name) : "—",
        count: list.length,
        list: list.slice(0, 5),
      },
      target_roles: ["director", "project_manager"],
      scheduled_at: new Date().toISOString(),
    });
    if (!error) queued++;
  }

  return { queued, overdue_alerts: alerts.length };
}

// ─── Supply deficit check → queue ───────────────────────

async function supplyDeficitCheck() {
  const { data: materials } = await supabase
    .from("materials")
    .select("id, name, unit, deficit, project_id, projects(name, code)")
    .gt("deficit", 0)
    .order("deficit", { ascending: false })
    .limit(30);

  if (!materials?.length) return { queued: 0 };

  const byProject: Record<string, any[]> = {};
  for (const m of materials) {
    const pid = m.project_id || "unknown";
    if (!byProject[pid]) byProject[pid] = [];
    byProject[pid].push({ name: m.name, deficit: m.deficit, unit: m.unit });
  }

  let queued = 0;
  for (const [pid, items] of Object.entries(byProject)) {
    const mat = materials.find((m) => m.project_id === pid);
    const projData = (mat as any)?.projects;
    const { error } = await supabase.from("bot_event_queue").insert({
      event_type: "supply.deficit",
      priority: "normal",
      project_id: pid !== "unknown" ? pid : null,
      payload: {
        project_name: projData ? (projData.code || projData.name) : "—",
        items: items.slice(0, 5),
      },
      target_roles: ["director", "project_manager", "supply_manager"],
      scheduled_at: new Date().toISOString(),
    });
    if (!error) queued++;
  }

  return { queued, deficit_materials: materials.length };
}

// ─── Main handler ────────────────────────────────────────

serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "all";

    const results: Record<string, unknown> = {};

    if (action === "all" || action === "daily_summary") {
      results.daily_summary = await dailySummary();
    }
    if (action === "all" || action === "report_reminder") {
      results.report_reminder = await reportReminder();
    }
    if (action === "all" || action === "deadline_check") {
      results.deadline_check = await deadlineCheck();
    }
    if (action === "all" || action === "alert_overdue") {
      results.alert_overdue = await alertOverdueCheck();
    }
    if (action === "all" || action === "supply_deficit") {
      results.supply_deficit = await supplyDeficitCheck();
    }

    return new Response(
      JSON.stringify({ ok: true, action, results }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("bot-scheduler error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
