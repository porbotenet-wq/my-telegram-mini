import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function sendMessage(chatId: string | number, text: string, replyMarkup?: unknown) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function answerCallbackQuery(callbackQueryId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: false }),
  });
}

async function findUserByChatId(chatId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("user_id").eq("telegram_chat_id", chatId).single();
  return data?.user_id ?? null;
}

async function getUserRoles(userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data || []).map((r: { role: string }) => r.role);
}

function statusLabel(s: string) {
  return ({
    "Ожидание": "⏳ Ожидание",
    "В работе": "🔧 В работе",
    "Готово": "✅ Готово",
  } as Record<string, string>)[s] ?? s;
}

async function handleCommand(chatId: number, text: string) {
  const cmd = text.trim().toLowerCase();

  if (cmd === "/start") {
    await sendMessage(chatId, [
      `👷 <b>STSphera Bot</b>`,
      ``,
      `Я помогу вам управлять задачами прямо из Telegram!`,
      ``,
      `<b>Команды:</b>`,
      `/myid — Узнать ваш Chat ID`,
      `/tasks — Мои открытые задачи`,
      `/help — Справка по командам`,
    ].join("\n"));
    return;
  }

  if (cmd === "/myid") {
    await sendMessage(chatId, `🆔 Ваш Chat ID: <code>${chatId}</code>\n\nСкопируйте и вставьте в настройки профиля STSphera.`);
    return;
  }

  if (cmd === "/help") {
    await sendMessage(chatId, [
      `📚 <b>Справка STSphera Bot</b>`,
      ``,
      `/myid — Узнать Chat ID для привязки`,
      `/tasks — Список ваших открытых задач`,
      `/start — Приветственное сообщение`,
      ``,
      `Также вы можете менять статус задач через кнопки в уведомлениях.`,
    ].join("\n"));
    return;
  }

  if (cmd === "/tasks") {
    const userId = await findUserByChatId(String(chatId));
    if (!userId) {
      await sendMessage(chatId, "⚠️ Ваш аккаунт не привязан. Укажите Chat ID в настройках профиля STSphera.");
      return;
    }

    const roles = await getUserRoles(userId);

    // Get tasks assigned directly or by role's department
    const { data: tasks } = await supabase
      .from("ecosystem_tasks")
      .select("id, code, name, status, department, planned_date, priority")
      .or(`assigned_to.eq.${userId}`)
      .in("status", ["Ожидание", "В работе"])
      .order("planned_date", { ascending: true, nullsFirst: false })
      .limit(15);

    if (!tasks || tasks.length === 0) {
      await sendMessage(chatId, "✨ У вас нет открытых задач!");
      return;
    }

    const lines = tasks.map((t, i) => {
      const deadline = t.planned_date ? ` · 📅 ${t.planned_date}` : "";
      return `${i + 1}. <b>${t.code}</b> ${t.name}\n   ${statusLabel(t.status)}${deadline}`;
    });

    await sendMessage(chatId, [
      `📋 <b>Ваши задачи (${tasks.length}):</b>`,
      ``,
      ...lines,
    ].join("\n"));
    return;
  }

  await sendMessage(chatId, "❓ Неизвестная команда. Введите /help для списка команд.");
}

async function handleCallbackQuery(callbackQuery: {
  id: string;
  from: { id: number };
  data?: string;
}) {
  const cbData = callbackQuery.data;
  if (!cbData) return;

  const chatId = callbackQuery.from.id;
  const userId = await findUserByChatId(String(chatId));

  if (!userId) {
    await answerCallbackQuery(callbackQuery.id, "⚠️ Аккаунт не привязан");
    return;
  }

  // Parse callback: task_start:<taskId> or task_done:<taskId>
  const [action, taskId] = cbData.split(":");
  if (!taskId) {
    await answerCallbackQuery(callbackQuery.id, "❌ Ошибка данных");
    return;
  }

  let newStatus: string;
  let emoji: string;
  if (action === "task_start") {
    newStatus = "В работе";
    emoji = "🔧";
  } else if (action === "task_done") {
    newStatus = "Готово";
    emoji = "✅";
  } else {
    await answerCallbackQuery(callbackQuery.id, "❌ Неизвестное действие");
    return;
  }

  // Verify task exists and user has access
  const { data: task } = await supabase
    .from("ecosystem_tasks")
    .select("id, code, name, assigned_to, status")
    .eq("id", taskId)
    .single();

  if (!task) {
    await answerCallbackQuery(callbackQuery.id, "❌ Задача не найдена");
    return;
  }

  // Check permissions: assigned user, or pm/director
  const roles = await getUserRoles(userId);
  const canUpdate = task.assigned_to === userId || roles.includes("pm") || roles.includes("director");

  if (!canUpdate) {
    await answerCallbackQuery(callbackQuery.id, "⛔ Нет прав на изменение этой задачи");
    return;
  }

  // Update status
  const { error } = await supabase
    .from("ecosystem_tasks")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", taskId);

  if (error) {
    await answerCallbackQuery(callbackQuery.id, "❌ Ошибка обновления");
    return;
  }

  await answerCallbackQuery(callbackQuery.id, `${emoji} Статус: ${newStatus}`);
  await sendMessage(chatId, `${emoji} Задача <b>${task.code}</b> · ${task.name}\nСтатус изменён: <b>${newStatus}</b>`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  try {
    const update = await req.json();

    if (update.message?.text) {
      await handleCommand(update.message.chat.id, update.message.text);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ ok: false }), {
      status: 200, // Return 200 to prevent Telegram retries
      headers: { "Content-Type": "application/json" },
    });
  }
});
