import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const MINI_APP_URL = Deno.env.get("MINI_APP_URL") || "https://your-app.lovable.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Telegram API helpers ────────────────────────────────────

async function sendMessage(
  chatId: number | string,
  text: string,
  extra: Record<string, unknown> = {}
) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...extra,
    }),
  });
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

function keyboard(buttons: { text: string; callback_data?: string; url?: string }[][]) {
  return {
    reply_markup: {
      inline_keyboard: buttons.map((row) =>
        row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.callback_data }))
      ),
    },
  };
}

// ─── Поиск пользователя по telegram_chat_id ──────────────────

async function getUserByChatId(chatId: number) {
  const { data } = await supabase
    .from("profiles")
    .select("user_id, display_name, telegram_chat_id")
    .eq("telegram_chat_id", String(chatId))
    .maybeSingle();
  return data;
}

async function getUserRoles(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  return (data || []).map((r: { role: string }) => r.role);
}

async function getUserProjects(_userId: string) {
  const { data } = await supabase
    .from("projects")
    .select("id, name, code, status, end_date")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(10);
  return data || [];
}

// ─── Команды ─────────────────────────────────────────────────

async function cmdStart(chatId: number, firstName: string) {
  const user = await getUserByChatId(chatId);

  if (!user) {
    await sendMessage(
      chatId,
      `👋 <b>Привет, ${firstName}!</b>\n\n` +
      `Я бот STSphera — система управления строительными объектами.\n\n` +
      `⚠️ Твой аккаунт ещё не привязан.\n` +
      `Открой приложение и привяжи Telegram в настройках профиля.`,
      keyboard([[{ text: "🚀 Открыть приложение", url: MINI_APP_URL }]])
    );
    return;
  }

  const roles = await getUserRoles(user.user_id);
  const isDirector = roles.includes("director");
  const roleEmoji = isDirector ? "👔" : roles.some(r => r.startsWith("foreman")) ? "👷" : "🏗️";

  const directorRow: { text: string; callback_data?: string; url?: string }[][] = isDirector
    ? [[{ text: "📁 Портфель проектов", callback_data: "menu_portfolio" }]]
    : [];

  await sendMessage(
    chatId,
    `${roleEmoji} <b>Привет, ${user.display_name || firstName}!</b>\n\n` +
    `Роль: <code>${roles[0] || "user"}</code>\n\n` +
    `Выбери действие:`,
    keyboard([
      [{ text: "📊 Дашборд", callback_data: "menu_dashboard" }, { text: "🔔 Алерты", callback_data: "menu_alerts" }],
      [{ text: "📦 Снабжение", callback_data: "menu_supply" }, { text: "👷 Бригады", callback_data: "menu_crews" }],
      [{ text: "📋 Ежедневный отчёт", callback_data: "menu_report" }],
      ...directorRow,
      [{ text: "🚀 Открыть приложение", url: MINI_APP_URL }],
    ])
  );
}

// ─── Дашборд / KPI ───────────────────────────────────────────

async function showDashboard(chatId: number, projectId?: string) {
  const user = await getUserByChatId(chatId);
  if (!user) { await sendNotLinked(chatId); return; }

  const projects = await getUserProjects(user.user_id);
  if (projects.length === 0) {
    await sendMessage(chatId, "📭 Нет активных проектов.");
    return;
  }

  const pid = projectId || projects[0].id;
  const project = projects.find((p: { id: string }) => p.id === pid) || projects[0];

  const [pfRes, alertsRes, matRes] = await Promise.all([
    supabase.from("plan_fact").select("plan_value,fact_value,week_number")
      .eq("project_id", pid).order("date", { ascending: false }).limit(14),
    supabase.from("alerts").select("priority,is_resolved").eq("project_id", pid).eq("is_resolved", false),
    supabase.from("materials").select("status,deficit").eq("project_id", pid),
  ]);

  const pf = pfRes.data || [];
  const totalPlan = pf.reduce((s: number, r: { plan_value: number }) => s + Number(r.plan_value || 0), 0);
  const totalFact = pf.reduce((s: number, r: { fact_value: number }) => s + Number(r.fact_value || 0), 0);
  const progress = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;

  const alerts = alertsRes.data || [];
  const critical = alerts.filter((a: { priority: string }) => a.priority === "critical").length;
  const high = alerts.filter((a: { priority: string }) => a.priority === "high").length;

  const mats = matRes.data || [];
  const deficitMats = mats.filter((m: { deficit: number }) => m.deficit > 0).length;

  const progressBar = makeProgressBar(progress);

  const daysLeft = (project as { end_date?: string }).end_date
    ? Math.ceil((new Date((project as { end_date: string }).end_date).getTime() - Date.now()) / 86400000)
    : null;

  const daysStr = daysLeft !== null
    ? daysLeft < 0 ? `⚠️ Просрочка ${Math.abs(daysLeft)} дн.` : `📅 До сдачи: ${daysLeft} дн.`
    : "";

  let text = `📊 <b>${(project as { name: string }).name}</b>\n`;
  if ((project as { code?: string }).code) text += `<code>${(project as { code: string }).code}</code>\n`;
  text += `\n`;
  text += `${progressBar} <b>${progress}%</b>\n`;
  text += `План: ${totalPlan.toLocaleString("ru")} · Факт: ${totalFact.toLocaleString("ru")}\n`;
  if (daysStr) text += `${daysStr}\n`;
  text += `\n`;

  if (alerts.length > 0) {
    text += `🔔 <b>Алерты:</b> ${alerts.length} открытых`;
    if (critical > 0) text += ` · 🔴 ${critical} крит.`;
    if (high > 0) text += ` · 🟠 ${high} высок.`;
    text += `\n`;
  } else {
    text += `✅ Открытых алертов нет\n`;
  }

  if (deficitMats > 0) {
    text += `📦 Дефицит материалов: <b>${deficitMats} позиций</b>\n`;
  }

  const projectButtons = projects.slice(0, 5).map((p: { id: string; name: string }) => ({
    text: p.id === pid ? `✓ ${p.name.slice(0, 20)}` : p.name.slice(0, 20),
    callback_data: `dash_${p.id}`,
  }));

  await sendMessage(chatId, text, keyboard([
    projectButtons.length > 1 ? projectButtons : [],
    [
      { text: "🔔 Алерты", callback_data: `alerts_${pid}` },
      { text: "📦 Снабжение", callback_data: `supply_${pid}` },
    ],
    [{ text: "🚀 Открыть объект", url: MINI_APP_URL }],
  ].filter(r => r.length > 0)));
}

// ─── Алерты ──────────────────────────────────────────────────

async function showAlerts(chatId: number, projectId?: string) {
  const user = await getUserByChatId(chatId);
  if (!user) { await sendNotLinked(chatId); return; }

  const projects = await getUserProjects(user.user_id);
  const pid = projectId || projects[0]?.id;
  if (!pid) { await sendMessage(chatId, "📭 Нет активных проектов."); return; }

  const project = projects.find((p: { id: string }) => p.id === pid) || projects[0];

  const { data: alerts } = await supabase
    .from("alerts")
    .select("id, title, priority, created_at, description")
    .eq("project_id", pid)
    .eq("is_resolved", false)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!alerts || alerts.length === 0) {
    await sendMessage(chatId,
      `✅ <b>${(project as { name: string }).name}</b>\n\nОткрытых алертов нет!`,
      keyboard([[{ text: "➕ Создать алерт", callback_data: `new_alert_${pid}` }]])
    );
    return;
  }

  const priorityEmoji: Record<string, string> = {
    critical: "🔴", high: "🟠", medium: "🟡", low: "⚪",
  };

  let text = `🔔 <b>${(project as { name: string }).name}</b>\nОткрытые алерты (${alerts.length}):\n\n`;
  for (const a of alerts.slice(0, 8)) {
    const emoji = priorityEmoji[a.priority] || "⚪";
    const date = new Date(a.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    text += `${emoji} <b>${a.title}</b>\n`;
    if (a.description) text += `   <i>${a.description.slice(0, 80)}${a.description.length > 80 ? "..." : ""}</i>\n`;
    text += `   <code>${date}</code>\n\n`;
  }

  await sendMessage(chatId, text, keyboard([
    [{ text: "➕ Создать алерт", callback_data: `new_alert_${pid}` }],
    [{ text: "📊 Дашборд", callback_data: `dash_${pid}` }, { text: "🚀 Приложение", url: MINI_APP_URL }],
  ]));
}

// ─── Состояния диалога ───────────────────────────────────────

async function getState(chatId: number) {
  const { data } = await supabase
    .from("bot_states")
    .select("state, data")
    .eq("chat_id", String(chatId))
    .maybeSingle();
  return data;
}

async function setState(chatId: number, state: string, stateData: Record<string, unknown> = {}) {
  await supabase.from("bot_states").upsert({
    chat_id: String(chatId),
    state,
    data: stateData,
    updated_at: new Date().toISOString(),
  }, { onConflict: "chat_id" });
}

async function clearState(chatId: number) {
  await supabase.from("bot_states").delete().eq("chat_id", String(chatId));
}

async function startCreateAlert(chatId: number, projectId: string) {
  await setState(chatId, "alert_title", { project_id: projectId });
  await sendMessage(chatId,
    `➕ <b>Создание алерта</b>\n\nВведите <b>название</b> проблемы:`,
    { reply_markup: { force_reply: true } }
  );
}

// ─── Снабжение ───────────────────────────────────────────────

async function showSupply(chatId: number, projectId?: string) {
  const user = await getUserByChatId(chatId);
  if (!user) { await sendNotLinked(chatId); return; }

  const projects = await getUserProjects(user.user_id);
  const pid = projectId || projects[0]?.id;
  if (!pid) { await sendMessage(chatId, "📭 Нет активных проектов."); return; }

  const project = projects.find((p: { id: string }) => p.id === pid) || projects[0];

  const { data: materials } = await supabase
    .from("materials")
    .select("name, status, deficit, on_site, total_required, unit, eta, supplier")
    .eq("project_id", pid)
    .order("deficit", { ascending: false })
    .limit(15);

  if (!materials || materials.length === 0) {
    await sendMessage(chatId, `📦 <b>${(project as { name: string }).name}</b>\n\nДанных по материалам нет.`);
    return;
  }

  const statusEmoji: Record<string, string> = {
    ok: "✅", deficit: "🔴", partial: "🟡", ordered: "🔵", delivered: "🟢",
  };

  const withDeficit = materials.filter((m: { deficit: number }) => m.deficit > 0);
  const ok = materials.filter((m: { status: string }) => m.status === "ok").length;

  let text = `📦 <b>${(project as { name: string }).name}</b>\nСтатус материалов:\n\n`;
  text += `✅ В норме: <b>${ok}</b>   🔴 Дефицит: <b>${withDeficit.length}</b>\n\n`;

  if (withDeficit.length > 0) {
    text += `<b>⚠️ Дефицитные позиции:</b>\n`;
    for (const m of withDeficit.slice(0, 8)) {
      const emoji = statusEmoji[(m as { status: string }).status] || "⚪";
      text += `${emoji} ${(m as { name: string }).name}\n`;
      text += `   Дефицит: <b>${(m as { deficit: number }).deficit} ${(m as { unit: string }).unit}</b>`;
      if ((m as { eta?: string }).eta) text += ` · ETA: ${new Date((m as { eta: string }).eta).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`;
      if ((m as { supplier?: string }).supplier) text += `\n   Поставщик: <i>${(m as { supplier: string }).supplier}</i>`;
      text += `\n\n`;
    }
  }

  await sendMessage(chatId, text, keyboard([
    [{ text: "📊 Дашборд", callback_data: `dash_${pid}` }, { text: "🚀 Открыть", url: MINI_APP_URL }],
  ]));
}

// ─── Бригады ─────────────────────────────────────────────────

async function showCrews(chatId: number, projectId?: string) {
  const user = await getUserByChatId(chatId);
  if (!user) { await sendNotLinked(chatId); return; }

  const projects = await getUserProjects(user.user_id);
  const pid = projectId || projects[0]?.id;
  if (!pid) { await sendMessage(chatId, "📭 Нет активных проектов."); return; }

  const project = projects.find((p: { id: string }) => p.id === pid) || projects[0];

  const { data: crews } = await supabase
    .from("crews")
    .select("name, headcount, specialization, foreman_name, is_active")
    .eq("project_id", pid)
    .eq("is_active", true)
    .order("name");

  if (!crews || crews.length === 0) {
    await sendMessage(chatId, `👷 <b>${(project as { name: string }).name}</b>\n\nАктивных бригад нет.`);
    return;
  }

  const total = crews.reduce((s: number, c: { headcount: number }) => s + (c.headcount || 0), 0);

  let text = `👷 <b>${(project as { name: string }).name}</b>\nСостав бригад — <b>${total} чел.</b>\n\n`;
  for (const c of crews) {
    text += `🔹 <b>${c.name}</b> — ${c.headcount} чел.\n`;
    if (c.specialization) text += `   <i>${c.specialization}</i>\n`;
    if (c.foreman_name) text += `   Прораб: ${c.foreman_name}\n`;
    text += `\n`;
  }

  await sendMessage(chatId, text, keyboard([
    [{ text: "📊 Дашборд", callback_data: `dash_${pid}` }, { text: "🚀 Открыть", url: MINI_APP_URL }],
  ]));
}

// ─── Ежедневный отчёт прораба ─────────────────────────────────

async function showReportMenu(chatId: number, projectId?: string) {
  const user = await getUserByChatId(chatId);
  if (!user) { await sendNotLinked(chatId); return; }

  const projects = await getUserProjects(user.user_id);
  const pid = projectId || projects[0]?.id;
  if (!pid) { await sendMessage(chatId, "📭 Нет активных проектов."); return; }

  const project = projects.find((p: { id: string }) => p.id === pid) || projects[0];
  const today = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "long" });

  await setState(chatId, "report_fact", { project_id: pid });
  await sendMessage(chatId,
    `📋 <b>Ежедневный отчёт</b>\n` +
    `${(project as { name: string }).name} · ${today}\n\n` +
    `Введите <b>объём выполненных работ</b> за сегодня (цифра, м² или ед.):`,
    { reply_markup: { force_reply: true } }
  );
}

// ─── Портфель директора ───────────────────────────────────────

async function showPortfolio(chatId: number) {
  const user = await getUserByChatId(chatId);
  if (!user) { await sendNotLinked(chatId); return; }

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, code, status, end_date")
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: false });

  if (!projects || projects.length === 0) {
    await sendMessage(chatId, "📁 Нет активных проектов в портфеле.");
    return;
  }

  let text = `📁 <b>Портфель проектов</b>\n${projects.length} объектов\n\n`;

  for (const p of projects.slice(0, 8)) {
    const [pfRes, alertsRes] = await Promise.all([
      supabase.from("plan_fact").select("plan_value,fact_value")
        .eq("project_id", p.id).limit(50),
      supabase.from("alerts").select("id").eq("project_id", p.id).eq("is_resolved", false),
    ]);

    const pf = pfRes.data || [];
    const totalPlan = pf.reduce((s: number, r: { plan_value: number }) => s + Number(r.plan_value || 0), 0);
    const totalFact = pf.reduce((s: number, r: { fact_value: number }) => s + Number(r.fact_value || 0), 0);
    const prog = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;
    const alertCount = alertsRes.data?.length || 0;

    const statusEmoji = p.status === "active" ? "🟢" : "🟡";
    const daysLeft = p.end_date
      ? Math.ceil((new Date(p.end_date).getTime() - Date.now()) / 86400000)
      : null;

    text += `${statusEmoji} <b>${p.name}</b>`;
    if (p.code) text += ` <code>${p.code}</code>`;
    text += `\n`;
    text += `   ${makeProgressBar(prog)} ${prog}%`;
    if (daysLeft !== null) text += daysLeft < 0 ? ` 🔴 -${Math.abs(daysLeft)}д` : ` ${daysLeft}д`;
    if (alertCount > 0) text += ` · 🔔${alertCount}`;
    text += `\n\n`;
  }

  const buttons = projects.slice(0, 4).map((p: { id: string; name: string }) => ({
    text: p.name.slice(0, 20),
    callback_data: `dash_${p.id}`,
  }));

  await sendMessage(chatId, text, keyboard([
    buttons.slice(0, 2),
    buttons.slice(2, 4),
    [{ text: "🚀 Открыть приложение", url: MINI_APP_URL }],
  ].filter(r => r.length > 0)));
}

// ─── Обработка multi-step диалога ────────────────────────────

async function handleStateMessage(chatId: number, text: string, state: { state: string; data: Record<string, unknown> }) {
  const { state: currentState, data } = state;

  if (currentState === "alert_title") {
    await setState(chatId, "alert_priority", { ...data, title: text });
    await sendMessage(chatId,
      `✅ Название: <b>${text}</b>\n\nВыберите <b>приоритет</b>:`,
      keyboard([
        [
          { text: "🔴 Критичный", callback_data: "alert_prio_critical" },
          { text: "🟠 Высокий", callback_data: "alert_prio_high" },
        ],
        [
          { text: "🟡 Средний", callback_data: "alert_prio_medium" },
          { text: "⚪ Низкий", callback_data: "alert_prio_low" },
        ],
      ])
    );
    return;
  }

  if (currentState === "alert_description") {
    const { project_id, title, priority } = data;
    await supabase.from("alerts").insert({
      project_id,
      title,
      priority,
      description: text,
      is_resolved: false,
      created_at: new Date().toISOString(),
    });
    await clearState(chatId);
    await sendMessage(chatId,
      `✅ <b>Алерт создан!</b>\n\n` +
      `📌 ${title}\n🎯 Приоритет: ${priority}\n📝 ${text}`,
      keyboard([
        [{ text: "🔔 Все алерты", callback_data: `alerts_${project_id}` }],
        [{ text: "🚀 Открыть приложение", url: MINI_APP_URL }],
      ])
    );
    return;
  }

  if (currentState === "report_fact") {
    const factValue = parseFloat(text.replace(",", "."));
    if (isNaN(factValue)) {
      await sendMessage(chatId, "❌ Введите число, например: <code>45.5</code>");
      return;
    }
    await setState(chatId, "report_notes", { ...data, fact_value: factValue });
    await sendMessage(chatId,
      `✅ Факт: <b>${factValue}</b> ед.\n\nДобавьте <b>примечание</b> (или отправьте «—» чтобы пропустить):`,
      { reply_markup: { force_reply: true } }
    );
    return;
  }

  if (currentState === "report_notes") {
    const { project_id, fact_value } = data;
    const notes = text === "—" ? null : text;
    const today = new Date().toISOString().split("T")[0];
    const weekNumber = getWeekNumber(new Date());

    const { error } = await supabase.from("plan_fact").insert({
      project_id,
      date: today,
      week_number: weekNumber,
      fact_value,
      notes,
      plan_value: 0,
    });

    await clearState(chatId);

    if (error) {
      await sendMessage(chatId, `❌ Ошибка при сохранении: ${error.message}`);
    } else {
      await sendMessage(chatId,
        `✅ <b>Отчёт сохранён!</b>\n\n` +
        `📅 ${today}\n📊 Факт: <b>${fact_value}</b> ед.\n` +
        (notes ? `📝 ${notes}` : ""),
        keyboard([
          [{ text: "📊 Дашборд", callback_data: `dash_${project_id}` }],
          [{ text: "🚀 Открыть приложение", url: MINI_APP_URL }],
        ])
      );
    }
    return;
  }

  await clearState(chatId);
  await sendMessage(chatId, "❓ Непонятная команда. Попробуй /start");
}

// ─── Callback handler ─────────────────────────────────────────

async function handleCallback(chatId: number, cbData: string, callbackId: string) {
  await answerCallbackQuery(callbackId);

  if (cbData === "menu_dashboard") return showDashboard(chatId);
  if (cbData === "menu_alerts")    return showAlerts(chatId);
  if (cbData === "menu_supply")    return showSupply(chatId);
  if (cbData === "menu_crews")     return showCrews(chatId);
  if (cbData === "menu_report")    return showReportMenu(chatId);
  if (cbData === "menu_portfolio") return showPortfolio(chatId);

  if (cbData.startsWith("dash_"))        return showDashboard(chatId, cbData.slice(5));
  if (cbData.startsWith("alerts_"))      return showAlerts(chatId, cbData.slice(7));
  if (cbData.startsWith("supply_"))      return showSupply(chatId, cbData.slice(7));
  if (cbData.startsWith("new_alert_"))   return startCreateAlert(chatId, cbData.slice(10));

  if (cbData.startsWith("alert_prio_")) {
    const priority = cbData.slice(11);
    const state = await getState(chatId);
    if (!state) return;
    await setState(chatId, "alert_description", { ...state.data, priority });
    await sendMessage(chatId,
      `✅ Приоритет: <b>${priority}</b>\n\nОпишите проблему подробнее (или «—» для пропуска):`,
      { reply_markup: { force_reply: true } }
    );
    return;
  }
}

// ─── Утилиты ─────────────────────────────────────────────────

function makeProgressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return "█".repeat(Math.max(0, filled)) + "░".repeat(Math.max(0, empty));
}

function getWeekNumber(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}

async function sendNotLinked(chatId: number) {
  await sendMessage(chatId,
    `⚠️ Аккаунт не привязан к STSphera.\n\nОткрой приложение и привяжи Telegram в настройках профиля.`,
    keyboard([[{ text: "🚀 Открыть приложение", url: MINI_APP_URL }]])
  );
}

// ─── Главный обработчик webhook ───────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  try {
    const update = await req.json();

    if (update.message) {
      const msg = update.message;
      const chatId: number = msg.chat.id;
      const text: string = msg.text || "";
      const firstName: string = msg.from?.first_name || "Пользователь";

      const state = await getState(chatId);
      if (state && !text.startsWith("/")) {
        await handleStateMessage(chatId, text, state);
        return new Response("OK");
      }

      if (text.startsWith("/start"))     await cmdStart(chatId, firstName);
      else if (text.startsWith("/dashboard") || text === "/d") await showDashboard(chatId);
      else if (text.startsWith("/alerts") || text === "/a")    await showAlerts(chatId);
      else if (text.startsWith("/supply") || text === "/s")    await showSupply(chatId);
      else if (text.startsWith("/crews"))                      await showCrews(chatId);
      else if (text.startsWith("/report") || text === "/r")    await showReportMenu(chatId);
      else if (text.startsWith("/portfolio") || text === "/p") await showPortfolio(chatId);
      else if (text.startsWith("/cancel")) {
        await clearState(chatId);
        await sendMessage(chatId, "❌ Отменено. Введи /start для меню.");
      } else if (!text.startsWith("/")) {
        await cmdStart(chatId, firstName);
      }
    }

    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId: number = cq.from.id;
      await handleCallback(chatId, cq.data || "", cq.id);
    }
  } catch (err) {
    console.error("Bot error:", err);
  }

  return new Response("OK", { status: 200 });
});
