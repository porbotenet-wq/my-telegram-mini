import { sendMessage, editMessage, answerCallback, parseCallback } from "../_shared/botUtils.ts";
import {
  homeScreen,
  projectListScreen,
  projectDetailScreen,
  alertsListScreen,
  alertDetailScreen,
  settingsScreen,
} from "../_shared/botScreens.ts";
import { getSession, setState, resetSession, STEP_PROMPTS } from "../_shared/botFSM.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);
const WEBAPP_URL = Deno.env.get("WEBAPP_URL") || "https://your-app.lovable.app";

// ─── Helpers ─────────────────────────────────────────
async function findUserByChatId(chatId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("telegram_chat_id", chatId)
    .single();
  return data?.user_id ?? null;
}

async function getUserRoles(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  return (data || []).map((r: { role: string }) => r.role);
}

async function getAlertsCount(): Promise<number> {
  const { count } = await supabase
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .eq("is_resolved", false);
  return count || 0;
}

function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime();
  return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
}

function statusLabel(s: string) {
  return (
    ({
      Ожидание: "⏳ Ожидание",
      "В работе": "🔧 В работе",
      Готово: "✅ Готово",
    } as Record<string, string>)[s] ?? s
  );
}

// ─── AI Chat ─────────────────────────────────────────
async function handleAIChat(chatId: number, userMessage: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    await sendMessage(chatId, "⚠️ AI-ассистент временно недоступен.");
    return;
  }

  const userId = await findUserByChatId(String(chatId));
  let contextNote = "";
  if (userId) {
    const roles = await getUserRoles(userId);
    if (roles.length > 0) contextNote = `\nРоль: ${roles.join(", ")}`;
  }

  try {
    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `Ты — AI-ассистент строительной платформы STSphera. Отвечай кратко, по делу, на русском.${contextNote}`,
            },
            { role: "user", content: userMessage },
          ],
          stream: false,
        }),
      }
    );

    if (response.status === 429) {
      await sendMessage(chatId, "⏳ Слишком много запросов. Попробуйте через минуту.");
      return;
    }
    if (!response.ok) {
      await sendMessage(chatId, "⚠️ Ошибка AI. Попробуйте позже.");
      return;
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    await sendMessage(chatId, reply || "🤔 Не удалось получить ответ.");
  } catch (err) {
    console.error("AI chat error:", err);
    await sendMessage(chatId, "⚠️ Ошибка при обращении к AI.");
  }
}

// ─── CALLBACK QUERY handler ─────────────────────────
async function handleCallback(cb: any) {
  const chatId = cb.message.chat.id;
  const msgId = cb.message.message_id;
  const { action, entity, id, extra } = parseCallback(cb.data || "");

  await answerCallback(cb.id);

  // HOME
  if (action === "home") {
    const alertsCount = await getAlertsCount();
    const screen = homeScreen(cb.from.first_name, "user", alertsCount);
    await editMessage(chatId, msgId, screen.text, { reply_markup: screen.keyboard });
    await resetSession(chatId);
    return;
  }

  // PROJECT LIST
  if (action === "list" && entity === "projects") {
    const page = parseInt(id || "0", 10);
    const screen = await projectListScreen(chatId, page);
    await editMessage(chatId, msgId, screen.text, { reply_markup: screen.keyboard });
    return;
  }

  // PROJECT DETAIL
  if (action === "show" && entity === "project" && id) {
    const screen = await projectDetailScreen(id);
    await editMessage(chatId, msgId, screen.text, { reply_markup: screen.keyboard });
    return;
  }

  // ALERTS LIST
  if (action === "list" && entity === "alerts") {
    const screen = await alertsListScreen(id || undefined);
    await editMessage(chatId, msgId, screen.text, { reply_markup: screen.keyboard });
    return;
  }

  // ALERT DETAIL
  if (action === "alert" && entity === "detail" && id) {
    const screen = await alertDetailScreen(id);
    await editMessage(chatId, msgId, screen.text, { reply_markup: screen.keyboard });
    return;
  }

  // ALERT RESOLVE
  if (action === "alert" && entity === "resolve" && id) {
    await supabase
      .from("alerts")
      .update({ is_resolved: true, resolved_at: new Date().toISOString() })
      .eq("id", id);
    await editMessage(chatId, msgId, "✅ Алерт закрыт!", {
      reply_markup: { inline_keyboard: [[{ text: "◀️ К алертам", callback_data: "list:alerts" }]] },
    });
    return;
  }

  // TASKS LIST
  if (action === "list" && entity === "tasks") {
    const userId = await findUserByChatId(String(chatId));
    if (!userId) {
      await editMessage(chatId, msgId, "⚠️ Аккаунт не привязан. Используйте /myid.");
      return;
    }
    const { data: tasks } = await supabase
      .from("ecosystem_tasks")
      .select("id, code, name, status, planned_date")
      .or(`assigned_to.eq.${userId}`)
      .in("status", ["Ожидание", "В работе"])
      .order("planned_date", { ascending: true, nullsFirst: false })
      .limit(10);

    if (!tasks || tasks.length === 0) {
      await editMessage(chatId, msgId, "✨ Нет открытых задач!", {
        reply_markup: { inline_keyboard: [[{ text: "🏠 Домой", callback_data: "home" }]] },
      });
      return;
    }

    const lines = tasks.map((t: any, i: number) => {
      const dl = t.planned_date ? ` · 📅 ${t.planned_date}` : "";
      return `${i + 1}. <b>${t.code}</b> ${t.name}\n   ${statusLabel(t.status)}${dl}`;
    });

    const buttons = tasks.map((t: any) => [
      { text: `🔧 ${t.code}`, callback_data: `task_start:${t.id}` },
      { text: `✅ ${t.code}`, callback_data: `task_done:${t.id}` },
    ]);
    buttons.push([{ text: "🏠 Домой", callback_data: "home" }]);

    await editMessage(chatId, msgId, `📋 <b>Задачи (${tasks.length}):</b>\n\n${lines.join("\n")}`, {
      reply_markup: { inline_keyboard: buttons },
    });
    return;
  }

  // TASK STATUS CHANGE
  if (action === "task_start" || action === "task_done") {
    const taskId = entity; // callback format: task_start:<taskId>
    // Re-parse: cb.data = "task_start:uuid" or "task_done:uuid"
    const parts = (cb.data || "").split(":");
    const tId = parts[1];
    if (!tId) return;

    const userId = await findUserByChatId(String(chatId));
    if (!userId) return;

    const newStatus = action === "task_start" ? "В работе" : "Готово";
    const emoji = action === "task_start" ? "🔧" : "✅";

    const { data: task } = await supabase
      .from("ecosystem_tasks")
      .select("id, code, name")
      .eq("id", tId)
      .single();

    if (!task) return;

    await supabase
      .from("ecosystem_tasks")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", tId);

    await editMessage(
      chatId,
      msgId,
      `${emoji} <b>${task.code}</b> · ${task.name}\nСтатус: <b>${newStatus}</b>`,
      { reply_markup: { inline_keyboard: [[{ text: "📋 Задачи", callback_data: "list:tasks" }, { text: "🏠 Домой", callback_data: "home" }]] } }
    );
    return;
  }

  // REPORT START — select project
  if (action === "report" && entity === "start") {
    if (id) {
      const { data: p } = await supabase.from("projects").select("name").eq("id", id).single();
      await setState(chatId, "report:select_zone", { project_id: id, project_name: p?.name });

      const { data: zones } = await supabase
        .from("work_types")
        .select("id, section")
        .eq("project_id", id);

      const sections = [...new Set((zones || []).map((z: any) => z.section))];
      const buttons = sections.slice(0, 5).map((s) => [{ text: s, callback_data: `zone:select:${s}` }]);
      buttons.push([{ text: "◀️ Назад", callback_data: `show:project:${id}` }]);

      await editMessage(chatId, msgId, `📝 Отчёт: <b>${p?.name}</b>\n\nВыберите участок:`, {
        reply_markup: { inline_keyboard: buttons },
      });
    } else {
      await setState(chatId, "report:select_project");
      const screen = await projectListScreen(chatId);
      await editMessage(chatId, msgId, "📝 <b>Дневной отчёт</b>\n\nВыберите проект:", {
        reply_markup: screen.keyboard,
      });
    }
    return;
  }

  // REPORT: select project for report
  if (action === "select" && entity === "report") {
    await setState(chatId, "report:select_project");
    const screen = await projectListScreen(chatId);
    await editMessage(chatId, msgId, "📝 <b>Дневной отчёт</b>\n\nВыберите проект:", {
      reply_markup: screen.keyboard,
    });
    return;
  }

  // ZONE SELECT
  if (action === "zone" && entity === "select" && id) {
    await setState(chatId, "report:works", { zone_name: id });
    await editMessage(chatId, msgId, STEP_PROMPTS["report:works"]);
    return;
  }

  // REPORT CONFIRM
  if (action === "report" && entity === "confirm") {
    const session = await getSession(chatId);
    const ctx = session.context;

    await supabase.from("plan_fact").insert({
      project_id: ctx.project_id,
      date: new Date().toISOString().split("T")[0],
      week_number: getWeekNumber(new Date()),
      plan_value: 0,
      fact_value: parseFloat(ctx.volume || "0") || 0,
    });

    await editMessage(
      chatId,
      msgId,
      `✅ <b>Отчёт отправлен!</b>\n\n` +
        `📋 ${ctx.project_name}\n📍 ${ctx.zone_name}\n` +
        `🔨 ${ctx.works}\n📏 ${ctx.volume}\n` +
        `👷 ${ctx.workers} чел.\n⚠️ ${ctx.issues || "Нет проблем"}`,
      { reply_markup: { inline_keyboard: [[{ text: "🏠 Домой", callback_data: "home" }]] } }
    );
    await resetSession(chatId);
    return;
  }

  // REPORT CANCEL
  if (action === "report" && entity === "cancel") {
    await resetSession(chatId);
    const alertsCount = await getAlertsCount();
    const screen = homeScreen(cb.from.first_name, "user", alertsCount);
    await editMessage(chatId, msgId, screen.text, { reply_markup: screen.keyboard });
    return;
  }

  // SETTINGS
  if (action === "show" && entity === "settings") {
    const screen = settingsScreen(cb.from.first_name);
    await editMessage(chatId, msgId, screen.text, { reply_markup: screen.keyboard });
    return;
  }
}

// ─── TEXT MESSAGE handler ────────────────────────────
async function handleTextMessage(msg: any) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  // /start with deep link
  if (text === "/start" || text.startsWith("/start ")) {
    const param = text.split(" ")[1];
    if (param?.startsWith("project_")) {
      const projectId = param.replace("project_", "");
      const screen = await projectDetailScreen(projectId);
      await sendMessage(chatId, screen.text, { reply_markup: screen.keyboard });
      return;
    }

    // Register/update profile
    const fullName = msg.from.first_name + (msg.from.last_name ? ` ${msg.from.last_name}` : "");
    await supabase.from("profiles").upsert(
      { telegram_chat_id: String(chatId), display_name: fullName },
      { onConflict: "telegram_chat_id" }
    );

    const alertsCount = await getAlertsCount();
    const screen = homeScreen(msg.from.first_name, "user", alertsCount);
    await sendMessage(chatId, screen.text, { reply_markup: screen.keyboard });
    await resetSession(chatId);
    return;
  }

  if (text === "/myid") {
    await sendMessage(chatId, `🆔 Ваш Chat ID: <code>${chatId}</code>\n\nСкопируйте в настройки профиля STSphera.`);
    return;
  }

  if (text === "/tasks") {
    const userId = await findUserByChatId(String(chatId));
    if (!userId) {
      await sendMessage(chatId, "⚠️ Аккаунт не привязан. Укажите Chat ID в настройках.");
      return;
    }
    const { data: tasks } = await supabase
      .from("ecosystem_tasks")
      .select("id, code, name, status, planned_date")
      .or(`assigned_to.eq.${userId}`)
      .in("status", ["Ожидание", "В работе"])
      .order("planned_date", { ascending: true, nullsFirst: false })
      .limit(15);

    if (!tasks || tasks.length === 0) {
      await sendMessage(chatId, "✨ У вас нет открытых задач!");
      return;
    }
    const lines = tasks.map((t: any, i: number) => {
      const dl = t.planned_date ? ` · 📅 ${t.planned_date}` : "";
      return `${i + 1}. <b>${t.code}</b> ${t.name}\n   ${statusLabel(t.status)}${dl}`;
    });
    await sendMessage(chatId, `📋 <b>Задачи (${tasks.length}):</b>\n\n${lines.join("\n")}`);
    return;
  }

  if (text === "/help") {
    await sendMessage(chatId, [
      `📚 <b>Справка STSphera Bot</b>`,
      ``,
      `/start — Главное меню`,
      `/myid — Узнать Chat ID`,
      `/tasks — Мои задачи`,
      `/help — Эта справка`,
      ``,
      `Или просто напишите вопрос — AI-ассистент ответит.`,
    ].join("\n"));
    return;
  }

  // FSM: report flow
  const session = await getSession(chatId);

  if (session.state === "report:select_project") {
    // User might have clicked a project button — handled in callback
    await sendMessage(chatId, "👆 Выберите проект из списка выше.");
    return;
  }

  if (session.state === "report:works") {
    await setState(chatId, "report:volume", { works: text });
    await sendMessage(chatId, STEP_PROMPTS["report:volume"]);
    return;
  }

  if (session.state === "report:volume") {
    await setState(chatId, "report:workers", { volume: text });
    await sendMessage(chatId, STEP_PROMPTS["report:workers"]);
    return;
  }

  if (session.state === "report:workers") {
    await setState(chatId, "report:issues", { workers: text });
    await sendMessage(chatId, STEP_PROMPTS["report:issues"]);
    return;
  }

  if (session.state === "report:issues") {
    const issues = text.toLowerCase() === "нет" ? null : text;
    await setState(chatId, "report:confirm", { issues });

    const ctx = (await getSession(chatId)).context;
    const confirmText =
      `📝 <b>Проверьте отчёт:</b>\n\n` +
      `📋 ${ctx.project_name}\n📍 ${ctx.zone_name}\n` +
      `🔨 ${ctx.works}\n📏 ${ctx.volume}\n` +
      `👷 ${ctx.workers} чел.\n` +
      `⚠️ ${issues || "Нет проблем"}\n\nВсё верно?`;

    await sendMessage(chatId, confirmText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Отправить", callback_data: "report:confirm" }],
          [{ text: "❌ Отменить", callback_data: "report:cancel" }],
        ],
      },
    });
    return;
  }

  // Default: AI chat for idle state
  if (session.state === "idle") {
    await handleAIChat(chatId, text);
  }
}

// ─── MAIN SERVE ──────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  try {
    const update = await req.json();

    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message?.text) {
      await handleTextMessage(update.message);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[webhook] error:", err);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
