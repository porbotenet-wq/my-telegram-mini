import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Role → department mapping for task routing
const ROLE_DEPARTMENTS: Record<string, string[]> = {
  director: [],      // gets everything
  pm: [],            // gets everything
  project: ["Проектный"],
  supply: ["Снабжение"],
  production: ["Производство"],
  foreman1: ["Производство"],
  foreman2: ["Производство"],
  foreman3: ["Производство"],
  pto: ["ПТО"],
  inspector: ["Контроль"],
};

type NotifyEvent =
  | "alert_created" | "alert_overdue" | "stage_overdue"
  | "xp_level_up" | "daily_report_missing" | "ks2_due_soon"
  | "supply_overdue" | "project_summary"
  | "task_assigned" | "task_deadline_soon" | "task_overdue"
  | "daily_digest";

interface NotifyPayload {
  event: NotifyEvent;
  projectId?: string;
  userId?: string;
  targetRole?: string;
  taskId?: string;
  data?: Record<string, unknown>;
}

interface SendMessageOptions {
  chatId: string;
  text: string;
  replyMarkup?: unknown;
}

async function sendMessage({ chatId, text, replyMarkup }: SendMessageOptions) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function priorityLabel(p: string) {
  return ({ critical: "🔴 КРИТИЧНО", high: "🟠 Высокий", medium: "🟡 Средний", low: "🟢 Низкий" } as Record<string, string>)[p] ?? p;
}

function statusLabel(s: string) {
  return ({
    "Ожидание": "⏳ Ожидание",
    "В работе": "🔧 В работе",
    "Готово": "✅ Готово",
    "Отклонено": "❌ Отклонено",
  } as Record<string, string>)[s] ?? s;
}

function formatMessage(event: NotifyEvent, data: Record<string, unknown>): string {
  const p = data.projectName ? `<b>📍 ${data.projectName}</b>\n` : "";
  switch (event) {
    case "alert_created":
      return `🚨 ${p}<b>Новый алерт!</b>\n${data.alertTitle}\nПриоритет: ${priorityLabel(String(data.priority))}`;
    case "alert_overdue":
      return `🔴 ${p}<b>Алерт просрочен!</b>\n${data.alertTitle}\nПросрочка: <b>${data.hoursOverdue} ч.</b>`;
    case "stage_overdue":
      return `⚠️ ${p}<b>Этап просрочен!</b>\n${data.stageName}\nПросрочка: <b>${data.daysOverdue} дн.</b>`;
    case "xp_level_up":
      return `🎉 Поздравляю, <b>${data.userName}</b>!\nУровень <b>${data.level} · ${data.levelTitle}</b> 🏆`;
    case "daily_report_missing":
      return `📵 ${p}<b>Нет ежедневного отчёта!</b>\n${data.userName}, внесите данные до 20:00`;
    case "ks2_due_soon":
      return `📋 ${p}<b>Не забудьте КС-2!</b>\nОсталось <b>${data.daysLeft} дн.</b>`;
    case "supply_overdue":
      return `🚛 ${p}<b>Поставка просрочена!</b>\n${data.materialName}`;
    case "task_assigned":
      return [
        `📋 ${p}<b>Новая задача назначена!</b>`,
        ``,
        `<b>${data.taskCode}</b> · ${data.taskName}`,
        `📂 ${data.department} → ${data.block}`,
        data.plannedDate ? `📅 Срок: <b>${data.plannedDate}</b>` : "",
        data.priority ? `Приоритет: ${priorityLabel(String(data.priority))}` : "",
      ].filter(Boolean).join("\n");
    case "task_deadline_soon":
      return [
        `⏰ ${p}<b>Приближается дедлайн!</b>`,
        ``,
        `<b>${data.taskCode}</b> · ${data.taskName}`,
        `📅 Срок: <b>${data.plannedDate}</b> (осталось <b>${data.daysLeft} дн.</b>)`,
        `Статус: ${statusLabel(String(data.status))}`,
      ].join("\n");
    case "task_overdue":
      return [
        `🔴 ${p}<b>Задача просрочена!</b>`,
        ``,
        `<b>${data.taskCode}</b> · ${data.taskName}`,
        `📅 Срок был: <b>${data.plannedDate}</b> (просрочка <b>${data.daysOverdue} дн.</b>)`,
      ].join("\n");
    case "daily_digest":
      return String(data.digestText || "📋 Нет задач на сегодня");
    case "project_summary":
      return [
        `📊 <b>Еженедельная сводка</b>`, `<b>📍 ${data.projectName}</b>`, ``,
        `📈 Прогресс: <b>${data.progress}%</b>`,
        `✅ Этапов закрыто: <b>${data.stagesClosed}</b>`,
        `🚨 Открытых алертов: <b>${data.openAlerts}</b>`,
        `🔴 Критических: <b>${data.criticalAlerts}</b>`,
        `📄 Документов: <b>${data.docsUploaded}</b>`,
        Number(data.criticalAlerts) > 0 ? `\n🔴 Требует внимания!` : `\n✨ Без критических инцидентов!`
      ].join("\n");
    default:
      return `📱 STSphera: событие`;
  }
}

function buildTaskKeyboard(taskId: string) {
  return {
    inline_keyboard: [
      [
        { text: "🔧 Начать", callback_data: `task_start:${taskId}` },
        { text: "✅ Готово", callback_data: `task_done:${taskId}` },
      ],
    ],
  };
}

async function getUserChatId(userId: string) {
  const { data } = await supabase.from("profiles").select("telegram_chat_id").eq("user_id", userId).single();
  return data?.telegram_chat_id ?? null;
}

async function resolveRecipients(event: NotifyEvent, userId?: string, targetRole?: string, taskId?: string): Promise<string[]> {
  // Direct user
  if (userId) return [userId];

  // Task-based: notify assigned user + managers
  if (taskId && ["task_assigned", "task_deadline_soon", "task_overdue"].includes(event)) {
    const { data: task } = await supabase.from("ecosystem_tasks").select("assigned_to, responsible, department").eq("id", taskId).single();
    const recipients = new Set<string>();

    if (task?.assigned_to) recipients.add(task.assigned_to);

    // Also notify users whose role matches the department
    for (const [role, depts] of Object.entries(ROLE_DEPARTMENTS)) {
      if (depts.length === 0 || depts.includes(task?.department ?? "")) {
        if (["director", "pm"].includes(role) && event === "task_overdue") {
          const { data: roleUsers } = await supabase.from("user_roles").select("user_id").eq("role", role);
          (roleUsers || []).forEach((r: { user_id: string }) => recipients.add(r.user_id));
        }
      }
    }

    return [...recipients];
  }

  // Role-based
  if (targetRole) {
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", targetRole);
    const recipients = (roles || []).map((r: { user_id: string }) => r.user_id);
    if (["alert_overdue", "stage_overdue", "alert_created", "task_overdue"].includes(event)) {
      const { data: mgrs } = await supabase.from("user_roles").select("user_id").in("role", ["director", "pm"]);
      return [...new Set([...recipients, ...(mgrs || []).map((r: { user_id: string }) => r.user_id)])];
    }
    return recipients;
  }

  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { event, projectId, userId, targetRole, taskId, data = {} }: NotifyPayload = await req.json();
    const message = formatMessage(event, data);
    const recipients = await resolveRecipients(event, userId, targetRole, taskId);

    // Add inline keyboard for task assignments
    const useKeyboard = event === "task_assigned" && taskId;

    const sent: string[] = [];
    await Promise.allSettled(recipients.map(async (uid) => {
      const chatId = await getUserChatId(uid);
      if (!chatId) return;
      const result = await sendMessage({
        chatId,
        text: message,
        replyMarkup: useKeyboard ? buildTaskKeyboard(taskId!) : undefined,
      });
      if (result.ok) sent.push(uid);
      await supabase.from("telegram_notification_log").insert({
        user_id: uid,
        project_id: projectId ?? null,
        event_type: event,
        success: result.ok,
        message_preview: message.slice(0, 200),
      });
    }));

    return new Response(JSON.stringify({ ok: true, sent: sent.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
