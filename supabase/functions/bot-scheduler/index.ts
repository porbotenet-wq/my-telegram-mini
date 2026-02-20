// supabase/functions/bot-scheduler/index.ts
// ═══════════════════════════════════════════════════════════════
// STSphera Bot Scheduler — под реальную схему проекта
// Запуск: каждый час (cron: 0 * * * *)
// ═══════════════════════════════════════════════════════════════
// Что делает по расписанию (МСК = UTC+3):
//   08:00 → Утренний дайджест для директора
//   09:00 → Эскалация алертов >24ч без ответа
//   17:00 → Напоминание прорабам если нет отчёта за день
//   17:00 пт → AI-анализ недели (вызывает bot-ai-weekly)
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const db = createClient(SB_URL, SB_KEY);

// ── Текущий час по МСК ────────────────────────────────────────
function mskHour(): number {
  return new Date(Date.now() + 3 * 3600000).getUTCHours();
}
function mskDay(): number {
  return new Date(Date.now() + 3 * 3600000).getUTCDay(); // 0=вс, 5=пт
}
function todayMSK(): string {
  return new Date(Date.now() + 3 * 3600000).toISOString().split("T")[0];
}

// ── Проверка: событие уже поставлено сегодня ─────────────────
async function alreadyQueued(eventType: string, projectId?: string): Promise<boolean> {
  const today = todayMSK();
  const q = db.from("bot_event_queue")
    .select("id", { count: "exact", head: true })
    .eq("event_type", eventType)
    .gte("created_at", today + "T00:00:00Z");

  if (projectId) q.eq("project_id", projectId);

  const { count } = await q;
  return (count || 0) > 0;
}

// ── Получить все активные проекты ─────────────────────────────
async function getActiveProjects() {
  const { data } = await db
    .from("projects")
    .select("id, name")
    .eq("status", "active");
  return data || [];
}

// ═══════════════════════════════════════════════════════════════
// 08:00 МСК — Утренний дайджест для директора
// ═══════════════════════════════════════════════════════════════
async function scheduleMorningDigest(projects: any[]): Promise<number> {
  if (await alreadyQueued("director.digest")) return 0;

  let totalAlerts    = 0;
  let criticalAlerts = 0;
  let deficitCount   = 0;
  let avgProgress    = 0;
  const projectsData: any[] = [];

  for (const proj of projects) {
    const { count: alertCount } = await db.from("alerts")
      .select("*", { count: "exact", head: true })
      .eq("project_id", proj.id)
      .eq("is_resolved", false);

    const { count: critCount } = await db.from("alerts")
      .select("*", { count: "exact", head: true })
      .eq("project_id", proj.id)
      .eq("is_resolved", false)
      .eq("priority", "critical");

    const { count: defCount } = await db.from("materials")
      .select("*", { count: "exact", head: true })
      .eq("project_id", proj.id)
      .gt("deficit", 0);

    const { data: facades } = await db.from("facades")
      .select("id").eq("project_id", proj.id);

    let projPlan = 0, projFact = 0;
    for (const f of (facades || [])) {
      const { data: floors } = await db.from("floors")
        .select("modules_plan, modules_fact")
        .eq("facade_id", f.id);
      for (const fl of (floors || [])) {
        projPlan += fl.modules_plan || 0;
        projFact += fl.modules_fact || 0;
      }
    }
    const projPct = projPlan > 0 ? Math.round((projFact / projPlan) * 100) : 0;

    totalAlerts    += alertCount || 0;
    criticalAlerts += critCount  || 0;
    deficitCount   += defCount   || 0;
    avgProgress    += projPct;

    projectsData.push({
      name:         proj.name,
      open_alerts:  alertCount  || 0,
      critical:     critCount   || 0,
      deficit:      defCount    || 0,
      progress_pct: projPct,
    });
  }

  if (projects.length > 0) {
    avgProgress = Math.round(avgProgress / projects.length);
  }

  await db.from("bot_event_queue").insert({
    event_type:   "director.digest",
    target_roles: ["director"],
    priority:     criticalAlerts > 0 ? "high" : "normal",
    payload: {
      total_projects:  projects.length,
      avg_progress:    avgProgress,
      open_alerts:     totalAlerts,
      critical_alerts: criticalAlerts,
      deficit_count:   deficitCount,
      projects:        projectsData,
    },
    scheduled_at: new Date().toISOString(),
  });

  return 1;
}

// ═══════════════════════════════════════════════════════════════
// 09:00 МСК — Эскалация алертов без ответа >24ч
// ═══════════════════════════════════════════════════════════════
async function scheduleAlertEscalation(projects: any[]): Promise<number> {
  let queued = 0;

  for (const proj of projects) {
    if (await alreadyQueued("alert.overdue", proj.id)) continue;

    const since24h = new Date(Date.now() - 24 * 3600000).toISOString();

    const { data: overdueAlerts } = await db.from("alerts")
      .select("title, priority, created_at")
      .eq("project_id", proj.id)
      .eq("is_resolved", false)
      .in("priority", ["critical", "high"])
      .lt("created_at", since24h)
      .order("priority", { ascending: false })
      .limit(10);

    if (!overdueAlerts?.length) continue;

    const list = overdueAlerts.map((a: any) => ({
      title:     a.title,
      priority:  a.priority,
      age_hours: Math.round((Date.now() - new Date(a.created_at).getTime()) / 3600000),
    }));

    await db.from("bot_event_queue").insert({
      event_type:   "alert.overdue",
      target_roles: ["director", "pm"],
      project_id:   proj.id,
      priority:     overdueAlerts.some((a: any) => a.priority === "critical") ? "critical" : "high",
      payload: {
        project_name: proj.name,
        count:        overdueAlerts.length,
        list,
      },
      scheduled_at: new Date().toISOString(),
    });

    queued++;
  }

  return queued;
}

// ═══════════════════════════════════════════════════════════════
// 17:00 МСК — Напоминание прорабам (нет отчёта за сегодня)
// ═══════════════════════════════════════════════════════════════
async function scheduleForemanReminders(projects: any[]): Promise<number> {
  let queued = 0;
  const today = todayMSK();

  for (const proj of projects) {
    if (await alreadyQueued("report.missing", proj.id)) continue;

    const { data: foremanRoles } = await db
      .from("user_roles")
      .select("user_id")
      .in("role", ["foreman1", "foreman2", "foreman3"]);

    if (!foremanRoles?.length) continue;

    const foremanUserIds = foremanRoles.map((r: any) => r.user_id);

    const { data: todayReports } = await db
      .from("plan_fact")
      .select("reported_by")
      .eq("project_id", proj.id)
      .eq("date", today)
      .in("reported_by", foremanUserIds);

    const reportedIds = new Set((todayReports || []).map((r: any) => r.reported_by));

    const notReported = foremanUserIds.filter((id: string) => !reportedIds.has(id));
    if (!notReported.length) continue;

    const { data: profiles } = await db
      .from("profiles")
      .select("telegram_chat_id, display_name")
      .in("user_id", notReported)
      .not("telegram_chat_id", "is", null);

    if (!profiles?.length) continue;

    for (const profile of profiles) {
      await db.from("bot_event_queue").insert({
        event_type:      "report.missing",
        target_chat_ids: [profile.telegram_chat_id],
        project_id:      proj.id,
        priority:        "normal",
        payload: {
          project_name: proj.name,
          date:         today,
          foreman_name: profile.display_name,
        },
        scheduled_at: new Date().toISOString(),
      });
    }

    queued += profiles.length;
  }

  return queued;
}

// ═══════════════════════════════════════════════════════════════
// 17:00 пт — Запуск AI-анализа недели
// ═══════════════════════════════════════════════════════════════
async function triggerWeeklyAI(): Promise<boolean> {
  if (await alreadyQueued("weekly.ai.triggered")) return false;

  await db.from("bot_event_queue").insert({
    event_type:   "weekly.ai.triggered",
    target_roles: [],
    priority:     "low",
    status:       "sent",
    payload:      { triggered_at: new Date().toISOString() },
    scheduled_at: new Date().toISOString(),
  });

  try {
    const res = await fetch(`${SB_URL}/functions/v1/bot-ai-weekly`, {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// 07:00 МСК — Утренний план (по аналогии с GS-скриптом)
// ═══════════════════════════════════════════════════════════════
async function scheduleMorningPlan(projects: any[]): Promise<number> {
  let queued = 0;
  const today = todayMSK();

  for (const proj of projects) {
    if (await alreadyQueued("plan.morning", proj.id)) continue;

    // Собираем план на сегодня из plan_fact
    const { data: planRows } = await db.from("plan_fact")
      .select("plan_value, fact_value, facade_id, floor_id, work_type_id, crew_id, notes")
      .eq("project_id", proj.id)
      .eq("date", today)
      .gt("plan_value", 0);

    if (!planRows?.length) continue;

    // Группировка по фасадам
    const facadeIds = [...new Set(planRows.map((r: any) => r.facade_id).filter(Boolean))];
    const facadeMap: Record<string, string> = {};
    if (facadeIds.length > 0) {
      const { data: facades } = await db.from("facades").select("id, name").in("id", facadeIds);
      for (const f of (facades || [])) facadeMap[f.id] = f.name;
    }

    let totalPlan = 0;
    const grouped: Record<string, number> = {};
    for (const r of planRows) {
      const facadeName = facadeMap[r.facade_id] || "Без фасада";
      grouped[facadeName] = (grouped[facadeName] || 0) + Number(r.plan_value || 0);
      totalPlan += Number(r.plan_value || 0);
    }

    await db.from("bot_event_queue").insert({
      event_type:   "plan.morning",
      target_roles: ["pm", "director", "foreman1", "foreman2", "foreman3"],
      project_id:   proj.id,
      priority:     "normal",
      payload: {
        project_name: proj.name,
        date:         today,
        total_plan:   totalPlan,
        rows_count:   planRows.length,
        by_facade:    grouped,
      },
      scheduled_at: new Date().toISOString(),
    });
    queued++;
  }
  return queued;
}

// ═══════════════════════════════════════════════════════════════
// 20:00 МСК — Вечерний факт (по аналогии с GS-скриптом)
// ═══════════════════════════════════════════════════════════════
async function scheduleEveningFact(projects: any[]): Promise<number> {
  let queued = 0;
  const today = todayMSK();

  for (const proj of projects) {
    if (await alreadyQueued("fact.evening", proj.id)) continue;

    const { data: rows } = await db.from("plan_fact")
      .select("plan_value, fact_value, facade_id, notes")
      .eq("project_id", proj.id)
      .eq("date", today);

    if (!rows?.length) continue;

    const facadeIds = [...new Set(rows.map((r: any) => r.facade_id).filter(Boolean))];
    const facadeMap: Record<string, string> = {};
    if (facadeIds.length > 0) {
      const { data: facades } = await db.from("facades").select("id, name").in("id", facadeIds);
      for (const f of (facades || [])) facadeMap[f.id] = f.name;
    }

    let totalPlan = 0, totalFact = 0;
    const byFacade: Record<string, { plan: number; fact: number }> = {};
    const failures: Array<{ facade: string; deficit: number; note: string }> = [];

    for (const r of rows) {
      const plan = Number(r.plan_value || 0);
      const fact = Number(r.fact_value || 0);
      const facadeName = facadeMap[r.facade_id] || "Без фасада";
      totalPlan += plan;
      totalFact += fact;
      if (!byFacade[facadeName]) byFacade[facadeName] = { plan: 0, fact: 0 };
      byFacade[facadeName].plan += plan;
      byFacade[facadeName].fact += fact;

      if (fact < plan && r.notes) {
        failures.push({ facade: facadeName, deficit: plan - fact, note: r.notes });
      }
    }

    const pct = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;

    await db.from("bot_event_queue").insert({
      event_type:   "fact.evening",
      target_roles: ["pm", "director"],
      project_id:   proj.id,
      priority:     pct < 80 ? "high" : "normal",
      payload: {
        project_name: proj.name,
        date:         today,
        total_plan:   totalPlan,
        total_fact:   totalFact,
        pct,
        by_facade:    byFacade,
        failures,
      },
      scheduled_at: new Date().toISOString(),
    });
    queued++;
  }
  return queued;
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
serve(async () => {
  const hour = mskHour();
  const day  = mskDay();
  const results: Record<string, unknown> = { hour_msk: hour };

  const projects = await getActiveProjects();
  if (!projects.length) {
    return new Response(JSON.stringify({ ...results, status: "no_active_projects" }));
  }

  // 07:00 — утренний план
  if (hour === 7) {
    results.morning_plan = await scheduleMorningPlan(projects);
  }

  // 08:00 — дайджест директора
  if (hour === 8) {
    results.morning_digest = await scheduleMorningDigest(projects);
  }

  // 09:00 — эскалация алертов
  if (hour === 9) {
    results.alert_escalation = await scheduleAlertEscalation(projects);
  }

  // 17:00 — напоминания прорабам
  if (hour === 17) {
    results.foreman_reminders = await scheduleForemanReminders(projects);

    // Пятница — запускаем AI-анализ
    if (day === 5) {
      results.weekly_ai = await triggerWeeklyAI();
    }
  }

  // 20:00 — вечерний факт
  if (hour === 20) {
    results.evening_fact = await scheduleEveningFact(projects);
  }

  results.status = "ok";
  results.projects_count = projects.length;

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
});
