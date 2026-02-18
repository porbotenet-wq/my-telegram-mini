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

  // Free-text message → AI assistant
  await handleAIChat(chatId, text);
}

async function handleAIChat(chatId: number, userMessage: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    await sendMessage(chatId, "⚠️ AI-ассистент временно недоступен.");
    return;
  }

  // Find user context
  const userId = await findUserByChatId(String(chatId));
  let contextNote = "";
  if (userId) {
    const roles = await getUserRoles(userId);
    if (roles.length > 0) contextNote = `\nРоль пользователя: ${roles.join(", ")}`;
  }

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `Ты — AI-ассистент строительной платформы STSphera. Отвечай кратко, по делу, на русском языке. Помогай с вопросами по фасадным работам, задачам, снабжению и документации.${contextNote}`,
          },
          { role: "user", content: userMessage },
        ],
        stream: false,
      }),
    });

    if (response.status === 429) {
      await sendMessage(chatId, "⏳ Слишком много запросов. Попробуйте через минуту.");
      return;
    }
    if (response.status === 402) {
      await sendMessage(chatId, "⚠️ Лимит AI-запросов исчерпан.");
      return;
    }
    if (!response.ok) {
      await sendMessage(chatId, "⚠️ Ошибка AI. Попробуйте позже.");
      return;
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    if (reply) {
      await sendMessage(chatId, reply);
    } else {
      await sendMessage(chatId, "🤔 Не удалось получить ответ. Попробуйте переформулировать.");
    }
  } catch (err) {
    console.error("AI chat error:", err);
    await sendMessage(chatId, "⚠️ Ошибка при обращении к AI.");
  }
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
  console.log(`[webhook] ${req.method} received`);

  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  try {
    const rawBody = await req.text();
    console.log("[webhook] body:", rawBody.slice(0, 500));
    const update = JSON.parse(rawBody);

    if (update.message?.text) {
      console.log(`[webhook] message from chat ${update.message.chat.id}: ${update.message.text}`);
      await handleCommand(update.message.chat.id, update.message.text);
    } else if (update.callback_query) {
      console.log(`[webhook] callback from ${update.callback_query.from.id}: ${update.callback_query.data}`);
      await handleCallbackQuery(update.callback_query);
    } else {
      console.log("[webhook] unhandled update type:", Object.keys(update).join(", "));
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[webhook] error:", err);
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
