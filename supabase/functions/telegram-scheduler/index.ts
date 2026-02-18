import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Role → departments mapping
const ROLE_DEPARTMENTS: Record<string, string[]> = {
  director: [],
  pm: [],
  project: ["Проектный", "Административный"],
  supply: ["Снабжение"],
  production: ["Производство"],
  foreman1: ["Производство"],
  foreman2: ["Производство"],
  foreman3: ["Производство"],
  pto: ["ПТО"],
  inspector: ["Контроль"],
};

async function callNotify(payload: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/functions/v1/telegram-notify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });
}

function statusLabel(s: string) {
  return ({
    "Ожидание": "⏳",
    "В работе": "🔧",
  } as Record<string, string>)[s] ?? "📋";
}

Deno.serve(async (req) => {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const threeDaysLater = new Date(today.getTime() + 3 * 86400000).toISOString().split("T")[0];

    // 1. Find tasks with deadlines in the next 3 days (not done)
    const { data: soonTasks } = await supabase
      .from("ecosystem_tasks")
      .select("id, code, name, planned_date, status, department, assigned_to, project_id")
      .in("status", ["Ожидание", "В работе"])
      .gte("planned_date", todayStr)
      .lte("planned_date", threeDaysLater);

    // 2. Find overdue tasks
    const { data: overdueTasks } = await supabase
      .from("ecosystem_tasks")
      .select("id, code, name, planned_date, status, department, assigned_to, project_id")
      .in("status", ["Ожидание", "В работе"])
      .lt("planned_date", todayStr)
      .not("planned_date", "is", null);

    // Get project names for context
    const projectIds = new Set<string>();
    [...(soonTasks || []), ...(overdueTasks || [])].forEach(t => {
      if (t.project_id) projectIds.add(t.project_id);
    });
    const projectNames: Record<string, string> = {};
    if (projectIds.size > 0) {
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name")
        .in("id", [...projectIds]);
      (projects || []).forEach(p => { projectNames[p.id] = p.name; });
    }

    // Send deadline reminders
    for (const task of (soonTasks || [])) {
      const daysLeft = Math.ceil((new Date(task.planned_date!).getTime() - today.getTime()) / 86400000);
      await callNotify({
        event: "task_deadline_soon",
        projectId: task.project_id,
        taskId: task.id,
        data: {
          taskCode: task.code,
          taskName: task.name,
          plannedDate: task.planned_date,
          daysLeft,
          status: task.status,
          projectName: task.project_id ? projectNames[task.project_id] : undefined,
        },
      });
    }

    // Send overdue notifications
    for (const task of (overdueTasks || [])) {
      const daysOverdue = Math.ceil((today.getTime() - new Date(task.planned_date!).getTime()) / 86400000);
      await callNotify({
        event: "task_overdue",
        projectId: task.project_id,
        taskId: task.id,
        data: {
          taskCode: task.code,
          taskName: task.name,
          plannedDate: task.planned_date,
          daysOverdue,
          projectName: task.project_id ? projectNames[task.project_id] : undefined,
        },
      });
    }

    // 3. Daily digest per user based on role
    const { data: allUsers } = await supabase
      .from("profiles")
      .select("user_id, telegram_chat_id, display_name")
      .not("telegram_chat_id", "is", null);

    for (const user of (allUsers || [])) {
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.user_id);

      const roles = (userRoles || []).map((r: { role: string }) => r.role);
      if (roles.length === 0) continue;

      // Determine departments for this user
      const isManager = roles.includes("director") || roles.includes("pm");
      const departments = new Set<string>();
      roles.forEach(role => {
        const depts = ROLE_DEPARTMENTS[role];
        if (depts && depts.length > 0) depts.forEach(d => departments.add(d));
      });

      // Query tasks: assigned to user OR matching departments
      let query = supabase
        .from("ecosystem_tasks")
        .select("id, code, name, status, department, planned_date, priority")
        .in("status", ["Ожидание", "В работе"])
        .order("planned_date", { ascending: true, nullsFirst: false })
        .limit(20);

      if (!isManager) {
        // For non-managers: assigned directly or in their departments
        if (departments.size > 0) {
          query = query.or(`assigned_to.eq.${user.user_id},department.in.(${[...departments].join(",")})`);
        } else {
          query = query.eq("assigned_to", user.user_id);
        }
      }

      const { data: tasks } = await query;

      if (!tasks || tasks.length === 0) continue;

      const urgentCount = tasks.filter(t =>
        t.planned_date && new Date(t.planned_date) <= new Date(today.getTime() + 2 * 86400000)
      ).length;

      const lines = tasks.slice(0, 10).map((t, i) => {
        const deadline = t.planned_date ? ` · 📅 ${t.planned_date}` : "";
        const isUrgent = t.planned_date && new Date(t.planned_date) <= new Date(today.getTime() + 2 * 86400000);
        return `${i + 1}. ${statusLabel(t.status)} <b>${t.code}</b> ${t.name}${deadline}${isUrgent ? " ‼️" : ""}`;
      });

      const digestText = [
        `☀️ <b>Доброе утро, ${user.display_name}!</b>`,
        `📋 Ваши задачи на сегодня: <b>${tasks.length}</b>`,
        urgentCount > 0 ? `‼️ Срочных: <b>${urgentCount}</b>` : "",
        ``,
        ...lines,
        tasks.length > 10 ? `\n...и ещё ${tasks.length - 10}` : "",
      ].filter(Boolean).join("\n");

      await callNotify({
        event: "daily_digest",
        userId: user.user_id,
        data: { digestText },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      deadlineSoon: (soonTasks || []).length,
      overdue: (overdueTasks || []).length,
      digestsSent: (allUsers || []).length,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Scheduler error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
