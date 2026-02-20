// supabase/functions/ai-dispatcher/index.ts
// ═══════════════════════════════════════════════════════════════
// AI-Диспетчер — ежедневный анализ проектов (Модуль 7)
// Запуск: cron раз в день (утро)
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DO_KEY = Deno.env.get("DO_MODEL_ACCESS_KEY")!;
const db = createClient(SB_URL, SB_KEY);

Deno.serve(async (req) => {
  // Защита от внешних вызовов
  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }

  const { data: projects } = await db
    .from("projects")
    .select("id, name, status, progress, end_date")
    .in("status", ["active", "in_progress"]);

  if (!projects?.length) {
    return new Response(JSON.stringify({ dispatched: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const project of projects) {
    // 1. Просроченные задачи
    const { data: overdueTasks } = await db
      .from("ecosystem_tasks")
      .select("id, name, deadline, assigned_to")
      .eq("project_id", project.id)
      .neq("status", "Выполнено")
      .not("deadline", "is", null)
      .lt("deadline", new Date().toISOString())
      .limit(20);

    // 2. Открытые алерты
    const { data: alerts } = await db
      .from("alerts")
      .select("id, title, priority, created_at")
      .eq("project_id", project.id)
      .eq("is_resolved", false);

    // 3. Дефицит материалов
    const { data: deficit } = await db
      .from("materials")
      .select("name, deficit, unit")
      .eq("project_id", project.id)
      .gt("deficit", 0);

    // 4. Отсутствующие отчёты (вчера)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split("T")[0];
    const { count: reportCount } = await db
      .from("daily_logs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id)
      .eq("date", yStr);

    // 5. AI-анализ через GPT-5-mini
    const summary = await generateAISummary(
      project, overdueTasks || [], alerts || [], deficit || [], reportCount || 0
    );

    // 6. Эскалация по ролям
    // Директору — общая сводка
    await db.from("bot_event_queue").insert({
      event_type: "director.digest",
      project_id: project.id,
      target_roles: ["director"],
      payload: {
        project_name: project.name,
        progress: project.progress,
        open_alerts: alerts?.length || 0,
        critical_alerts: alerts?.filter((a: any) => a.priority === "critical").length || 0,
        overdue_tasks: overdueTasks?.length || 0,
        deficit_count: deficit?.length || 0,
        ai_summary: summary,
      },
      priority: alerts?.some((a: any) => a.priority === "critical") ? "critical" : "normal",
    });

    // РП — детали по просрочкам
    if ((overdueTasks?.length || 0) > 0) {
      await db.from("bot_event_queue").insert({
        event_type: "task.overdue",
        project_id: project.id,
        target_roles: ["pm"],
        payload: {
          project_name: project.name,
          tasks: overdueTasks?.map((t: any) => ({ title: t.name, deadline: t.deadline })),
          count: overdueTasks?.length,
        },
        priority: "high",
      });
    }

    // Прорабам — отсутствующие отчёты
    if ((reportCount || 0) === 0) {
      await db.from("bot_event_queue").insert({
        event_type: "report.missing",
        project_id: project.id,
        target_roles: ["foreman1", "foreman2", "foreman3"],
        payload: { project_name: project.name, date: yStr },
        priority: "normal",
      });
    }

    // Снабжению — дефицит
    if ((deficit?.length || 0) > 0) {
      await db.from("bot_event_queue").insert({
        event_type: "supply.deficit",
        project_id: project.id,
        target_roles: ["supply"],
        payload: {
          project_name: project.name,
          count: deficit?.length,
          items: deficit?.map((d: any) => `${d.name}: -${d.deficit} ${d.unit}`),
        },
        priority: "high",
      });
    }
  }

  return new Response(JSON.stringify({ dispatched: projects.length }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function generateAISummary(
  project: any,
  tasks: any[],
  alerts: any[],
  deficit: any[],
  reportCount: number,
): Promise<string> {
  try {
    if (!DO_KEY) return "AI-анализ недоступен";

    const prompt = `Проанализируй состояние строительного объекта "${project.name}":
- Прогресс: ${project.progress || 0}%
- Дедлайн: ${project.end_date || "не указан"}
- Просроченных задач: ${tasks.length}${tasks.length > 0 ? ` (${tasks.slice(0, 3).map((t: any) => t.name).join(", ")})` : ""}
- Открытых алертов: ${alerts.length}${alerts.filter((a: any) => a.priority === "critical").length > 0 ? ` (критических: ${alerts.filter((a: any) => a.priority === "critical").length})` : ""}
- Дефицит материалов: ${deficit.length} позиций${deficit.length > 0 ? ` (${deficit.slice(0, 3).map((d: any) => d.name).join(", ")})` : ""}
- Отчётов за вчера: ${reportCount}

Кратко (3-4 предложения): оцени риски, дай рекомендации по приоритетным действиям. Отвечай на русском.`;

    const resp = await fetch("https://inference.do-ai.run/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DO_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai-gpt-5-mini",
        messages: [
          { role: "system", content: "Ты — AI-диспетчер строительной компании. Анализируешь состояние объектов и даёшь краткие рекомендации." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!resp.ok) {
      console.error("AI dispatcher error:", resp.status);
      return "AI-анализ временно недоступен";
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content || "Анализ не получен";
  } catch (e) {
    console.error("AI summary error:", e);
    return "Ошибка AI-анализа";
  }
}
