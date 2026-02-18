import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Config ──────────────────────────────────────────────────
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const MINI_APP_URL = Deno.env.get("MINI_APP_URL") || "https://id-preview--fe942628-85b8-4407-a858-132ee496d745.lovable.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Types ───────────────────────────────────────────────────
interface Session {
  chat_id: string;
  user_id: string | null;
  state: string;
  context: Record<string, unknown>;
  message_id: number | null;
  updated_at: string;
  expires_at: string;
}

interface UserProfile {
  user_id: string;
  display_name: string;
  telegram_chat_id: string;
}

// ─── RBAC ────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  director: "Директор", pm: "Руководитель проекта", project: "Проектировщик",
  supply: "Снабженец", production: "Производство", foreman1: "Прораб 1",
  foreman2: "Прораб 2", foreman3: "Прораб 3", pto: "ПТО", inspector: "Инспектор",
};

function canAccess(roles: string[], screen: string): boolean {
  const r = new Set(roles);
  const isForeman = roles.some(x => x.startsWith("foreman"));
  switch (screen) {
    case "dashboard": return true;
    case "alerts_view": return true;
    case "alerts_create": return r.has("director") || r.has("pm") || isForeman;
    case "report": return isForeman;
    case "supply": return r.has("director") || r.has("pm") || r.has("supply") || isForeman;
    case "portfolio": return r.has("director");
    case "crews": return true;
    default: return true;
  }
}

// ─── Telegram API ────────────────────────────────────────────
async function tg(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function editMessage(chatId: number | string, messageId: number, text: string, replyMarkup?: unknown) {
  const body: Record<string, unknown> = {
    chat_id: chatId, message_id: messageId, text, parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return tg("editMessageText", body);
}

async function sendMessage(chatId: number | string, text: string, replyMarkup?: unknown): Promise<number | null> {
  const body: Record<string, unknown> = {
    chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const result = await tg("sendMessage", body);
  return result?.result?.message_id ?? null;
}

async function answerCb(cbId: string, text?: string) {
  await tg("answerCallbackQuery", { callback_query_id: cbId, text });
}

async function removeKeyboard(chatId: number | string, messageId: number) {
  await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
}

function kb(buttons: { text: string; callback_data?: string; url?: string }[][]) {
  return { inline_keyboard: buttons.map(row => row.map(b => b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.callback_data })) };
}

// ─── Session (FSM State) ─────────────────────────────────────
async function getSession(chatId: number): Promise<Session | null> {
  const { data } = await supabase.from("bot_sessions")
    .select("*").eq("chat_id", String(chatId)).maybeSingle();
  return data;
}

async function setSession(chatId: number, state: string, context: Record<string, unknown> = {}, messageId?: number | null) {
  const row: Record<string, unknown> = {
    chat_id: String(chatId), state, context,
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 2 * 3600000).toISOString(),
  };
  if (messageId !== undefined) row.message_id = messageId;
  await supabase.from("bot_sessions").upsert(row, { onConflict: "chat_id" });
}

async function updateSessionMessage(chatId: number, messageId: number) {
  await supabase.from("bot_sessions").update({ message_id: messageId }).eq("chat_id", String(chatId));
}

async function clearSession(chatId: number) {
  await supabase.from("bot_sessions").delete().eq("chat_id", String(chatId));
}

// ─── Audit ───────────────────────────────────────────────────
async function audit(chatId: number, userId: string | null, action: string, payload: Record<string, unknown> = {}, result = "success", durationMs?: number) {
  await supabase.from("bot_audit_log").insert({
    chat_id: String(chatId), user_id: userId, action, payload, result,
    duration_ms: durationMs,
  });
}

// ─── User helpers ────────────────────────────────────────────
async function getUserByChatId(chatId: number): Promise<UserProfile | null> {
  const { data } = await supabase.from("profiles")
    .select("user_id, display_name, telegram_chat_id")
    .eq("telegram_chat_id", String(chatId)).maybeSingle();
  return data;
}

async function getUserRoles(userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data || []).map((r: { role: string }) => r.role);
}

async function getUserProjects(_userId: string) {
  const { data } = await supabase.from("projects")
    .select("id, name, code, status, end_date")
    .eq("status", "active").order("created_at", { ascending: false }).limit(10);
  return data || [];
}

// ─── Screen: send or edit ────────────────────────────────────
async function renderScreen(chatId: number, session: Session | null, text: string, markup: unknown): Promise<number> {
  if (session?.message_id) {
    const res = await editMessage(chatId, session.message_id, text, markup);
    if (res?.ok) return session.message_id;
    // editMessage failed (message too old, deleted, etc.) → send new
  }
  const newMsgId = await sendMessage(chatId, text, markup);
  return newMsgId || 0;
}

// ─── Utilities ───────────────────────────────────────────────
function progressBar(pct: number): string {
  const f = Math.round(Math.max(0, Math.min(100, pct)) / 10);
  return "█".repeat(f) + "░".repeat(10 - f);
}

function deadlineStatus(daysLeft: number | null): string {
  if (daysLeft === null) return "";
  if (daysLeft < 0) return `🔴 Просрочка ${Math.abs(daysLeft)} дн.`;
  if (daysLeft <= 10) return `🔴 ${daysLeft} дн.`;
  if (daysLeft <= 30) return `⚠️ ${daysLeft} дн.`;
  return `✅ ${daysLeft} дн.`;
}

function projectColor(progress: number): string {
  if (progress >= 70) return "🟢";
  if (progress >= 40) return "🟡";
  return "🔴";
}

function priorityLabel(p: string): string {
  return ({ critical: "🔴 Критичный", high: "🟠 Высокий", medium: "🟡 Средний", low: "⚪ Низкий" } as Record<string, string>)[p] || p;
}

function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}

function shortId(uuid: string): string { return uuid.slice(0, 8); }

// ─── S-01: MAIN HUB ─────────────────────────────────────────
async function showHub(chatId: number, session: Session | null, user: UserProfile, roles: string[]) {
  const projects = await getUserProjects(user.user_id);
  const roleLabel = ROLE_LABELS[roles[0]] || roles[0] || "Пользователь";
  const isDirector = roles.includes("director");
  const isForeman = roles.some(r => r.startsWith("foreman"));
  const now = new Date();
  const timeStr = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
  const dayStr = now.toLocaleDateString("ru-RU", { weekday: "long", timeZone: "Europe/Moscow" });

  // Count unresolved alerts
  let alertBadge = "";
  if (projects.length > 0) {
    const { count } = await supabase.from("alerts").select("id", { count: "exact", head: true })
      .eq("is_resolved", false);
    if (count && count > 0) alertBadge = ` (${count})`;
  }

  const text = [
    `📍 <b>STSphera</b> · ${user.display_name}`,
    `Роль: ${roleLabel} · ${projects.length} объектов`,
    `─────────────────────────────`,
    `⏰ ${timeStr} · ${dayStr}`,
  ].join("\n");

  const buttons: { text: string; callback_data?: string; url?: string }[][] = [];

  // Row 1
  const row1: { text: string; callback_data?: string; url?: string }[] = [];
  if (isDirector) {
    row1.push({ text: "📁 Портфель", callback_data: "nav:portfolio" });
  } else {
    row1.push({ text: "📊 Мой объект", callback_data: "nav:dashboard" });
  }
  row1.push({ text: `🔔 Алерты${alertBadge}`, callback_data: "nav:alerts" });
  buttons.push(row1);

  // Row 2
  const row2: { text: string; callback_data?: string; url?: string }[] = [];
  if (canAccess(roles, "supply")) row2.push({ text: "📦 Снабжение", callback_data: "nav:supply" });
  if (isForeman) row2.push({ text: "📋 Отчёт", callback_data: "nav:report" });
  if (row2.length > 0) buttons.push(row2);

  // Row 3 — settings + mini app
  buttons.push([{ text: "🚀 Открыть приложение", url: MINI_APP_URL }]);

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "IDLE", { user_id: user.user_id }, msgId);
}

// ─── S-02: PROJECT SELECT ────────────────────────────────────
async function showProjectSelect(chatId: number, session: Session | null, user: UserProfile, nextAction: string) {
  const projects = await getUserProjects(user.user_id);
  if (projects.length === 0) {
    const msgId = await renderScreen(chatId, session, "📍 STSphera › Выбор объекта\n─────────────────────────────\n📭 Нет активных объектов.", kb([[{ text: "🏠 В меню", callback_data: "nav:home" }]]));
    await setSession(chatId, "IDLE", {}, msgId);
    return;
  }
  if (projects.length === 1) {
    // Skip selection, go directly
    await routeToAction(chatId, session, user, nextAction, projects[0].id);
    return;
  }

  const projectButtons = projects.slice(0, 5).map(p => {
    return [{ text: `${p.name.slice(0, 30)}`, callback_data: `proj:select:${shortId(p.id)}:${nextAction}` }];
  });
  projectButtons.push([{ text: "← Назад", callback_data: "nav:home" }]);

  const text = `📍 STSphera › Выбор объекта\n─────────────────────────────\nВыберите объект:`;
  const msgId = await renderScreen(chatId, session, text, kb(projectButtons));
  await setSession(chatId, "PROJECT_SELECT", { next_action: nextAction }, msgId);
}

async function routeToAction(chatId: number, session: Session | null, user: UserProfile, action: string, projectId: string) {
  switch (action) {
    case "dashboard": return showDashboard(chatId, session, user, projectId);
    case "alerts": return showAlerts(chatId, session, user, projectId);
    case "supply": return showSupply(chatId, session, user, projectId);
    case "report": return showReport(chatId, session, user, projectId);
    case "crews": return showCrews(chatId, session, user, projectId);
    default: return showDashboard(chatId, session, user, projectId);
  }
}

// ─── S-03: DASHBOARD ─────────────────────────────────────────
async function showDashboard(chatId: number, session: Session | null, user: UserProfile, projectId: string) {
  const [projRes, pfRes, alertsRes, matRes] = await Promise.all([
    supabase.from("projects").select("id, name, code, end_date").eq("id", projectId).single(),
    supabase.from("plan_fact").select("plan_value, fact_value").eq("project_id", projectId).limit(100),
    supabase.from("alerts").select("id, priority").eq("project_id", projectId).eq("is_resolved", false),
    supabase.from("materials").select("deficit").eq("project_id", projectId),
  ]);

  const project = projRes.data;
  if (!project) {
    const msgId = await renderScreen(chatId, session, "⚠️ Объект не найден.", kb([[{ text: "🏠 В меню", callback_data: "nav:home" }]]));
    await setSession(chatId, "IDLE", {}, msgId);
    return;
  }

  const pf = pfRes.data || [];
  const totalPlan = pf.reduce((s, r) => s + Number(r.plan_value || 0), 0);
  const totalFact = pf.reduce((s, r) => s + Number(r.fact_value || 0), 0);
  const progress = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;

  const alerts = alertsRes.data || [];
  const alertCount = alerts.length;
  const critical = alerts.filter(a => a.priority === "critical").length;

  const mats = matRes.data || [];
  const deficitItems = mats.filter(m => Number(m.deficit) > 0).length;

  const daysLeft = project.end_date
    ? Math.ceil((new Date(project.end_date).getTime() - Date.now()) / 86400000) : null;

  const text = [
    `📍 ${project.name} › Дашборд`,
    `─────────────────────────────`,
    `${progressBar(progress)} <b>${progress}%</b>`,
    `План ${totalPlan.toLocaleString("ru")} · Факт ${totalFact.toLocaleString("ru")}`,
    ``,
    `📅 До сдачи: ${deadlineStatus(daysLeft)}`,
    `🔔 Алертов: ${alertCount}${critical > 0 ? ` · 🔴 ${critical} крит.` : ""}`,
    `📦 Дефицит: ${deficitItems} позиций`,
  ].join("\n");

  const roles = await getUserRoles(user.user_id);
  const buttons: { text: string; callback_data?: string; url?: string }[][] = [
    [
      { text: "🔔 Алерты", callback_data: `alert:list:${shortId(projectId)}` },
      { text: "📦 Снабжение", callback_data: `supply:view:${shortId(projectId)}` },
    ],
    [
      { text: "👷 Бригады", callback_data: `crew:view:${shortId(projectId)}` },
    ],
  ];

  // Mini App button with project context
  buttons.push([{ text: "🚀 Открыть подробно", url: `${MINI_APP_URL}?project=${projectId}` }]);
  buttons.push([{ text: "← Назад", callback_data: "nav:home" }]);

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "PROJECT_SELECTED", { project_id: projectId, user_id: user.user_id }, msgId);
}

// ─── S-04: ALERTS LIST ───────────────────────────────────────
async function showAlerts(chatId: number, session: Session | null, user: UserProfile, projectId: string) {
  const [projRes, alertsRes] = await Promise.all([
    supabase.from("projects").select("name").eq("id", projectId).single(),
    supabase.from("alerts").select("id, title, priority, created_at")
      .eq("project_id", projectId).eq("is_resolved", false)
      .order("created_at", { ascending: false }).limit(10),
  ]);

  const projectName = projRes.data?.name || "Объект";
  const alerts = alertsRes.data || [];

  const criticalN = alerts.filter(a => a.priority === "critical").length;
  const highN = alerts.filter(a => a.priority === "high").length;
  const mediumN = alerts.filter(a => a.priority === "medium").length;

  let text = `📍 ${projectName} › Алерты\n─────────────────────────────\nОткрытых: ${alerts.length}\n\n`;
  if (alerts.length > 0) {
    text += `🔴 Критичных: ${criticalN}\n🟠 Высоких: ${highN}\n🟡 Средних: ${mediumN}\n\n`;
    text += `Последние:\n`;
    for (const a of alerts.slice(0, 5)) {
      const emoji = ({ critical: "🔴", high: "🟠", medium: "🟡", low: "⚪" } as Record<string, string>)[a.priority] || "⚪";
      const date = new Date(a.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      text += `• ${emoji} ${a.title} · ${date}\n`;
    }
  }

  const roles = await getUserRoles(user.user_id);
  const buttons: { text: string; callback_data?: string; url?: string }[][] = [];

  if (canAccess(roles, "alerts_create")) {
    buttons.push([{ text: "➕ Создать", callback_data: `alert:create:step1:${shortId(projectId)}` }]);
  }
  buttons.push([{ text: "← Назад", callback_data: `dash:view:${shortId(projectId)}` }]);

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "PROJECT_SELECTED", { project_id: projectId, user_id: user.user_id }, msgId);
}

// ─── S-05: ALERT CREATE (FSM) ────────────────────────────────
async function alertStep1(chatId: number, session: Session | null, projectId: string) {
  const text = `📍 Новый алерт · Шаг 1/3\n─────────────────────────────\nВведите краткое название проблемы:`;
  const msgId = await renderScreen(chatId, session, text, kb([[{ text: "✕ Отмена", callback_data: `alert:list:${shortId(projectId)}` }]]));
  await setSession(chatId, "ALERT_STEP1", { project_id: projectId }, msgId);
}

async function alertStep2(chatId: number, session: Session | null, projectId: string, title: string) {
  const text = [
    `📍 Новый алерт · Шаг 2/3`,
    `─────────────────────────────`,
    `Название: «${title}»`,
    ``,
    `Выберите приоритет:`,
  ].join("\n");

  const buttons = [
    [{ text: "🔴 Критичный", callback_data: `alert:prio:critical` }, { text: "🟠 Высокий", callback_data: `alert:prio:high` }],
    [{ text: "🟡 Средний", callback_data: `alert:prio:medium` }, { text: "⚪ Низкий", callback_data: `alert:prio:low` }],
    [{ text: "✕ Отмена", callback_data: `alert:list:${shortId(projectId)}` }],
  ];

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "ALERT_STEP2", { project_id: projectId, title }, msgId);
}

async function alertConfirm(chatId: number, session: Session | null, projectId: string, title: string, priority: string) {
  const [projRes] = await Promise.all([
    supabase.from("projects").select("name").eq("id", projectId).single(),
  ]);
  const projectName = projRes.data?.name || "Объект";

  const text = [
    `📍 Новый алерт · Шаг 3/3`,
    `─────────────────────────────`,
    `Проверьте данные:`,
    ``,
    `Название: ${title}`,
    `Приоритет: ${priorityLabel(priority)}`,
    `Объект: ${projectName}`,
  ].join("\n");

  const buttons = [
    [{ text: "✅ Создать", callback_data: `alert:confirm` }, { text: "✏️ Изменить", callback_data: `alert:create:step1:${shortId(projectId)}` }],
    [{ text: "✕ Отмена", callback_data: `alert:list:${shortId(projectId)}` }],
  ];

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "ALERT_CONFIRM", { project_id: projectId, title, priority }, msgId);
}

// ─── S-06: STATUS AFTER ACTION ───────────────────────────────
async function showStatus(chatId: number, session: Session | null, message: string, projectId: string) {
  const text = `📍 STSphera · Готово\n─────────────────────────────\n${message}`;
  const buttons = [
    [{ text: "📊 Дашборд", callback_data: `dash:view:${shortId(projectId)}` }, { text: "🏠 В меню", callback_data: "nav:home" }],
  ];
  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "IDLE", { project_id: projectId }, msgId);

  // Auto-remove keyboard after 60 seconds
  setTimeout(async () => {
    try { await removeKeyboard(chatId, msgId); } catch { /* ignore */ }
  }, 60000);
}

// ─── S-07: DAILY REPORT (FSM) ────────────────────────────────
async function reportStep1(chatId: number, session: Session | null, projectId: string) {
  const [projRes] = await Promise.all([
    supabase.from("projects").select("name").eq("id", projectId).single(),
  ]);
  const projectName = projRes.data?.name || "Объект";
  const dateStr = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "long" });

  const text = [
    `📍 Ежедневный отчёт · ${dateStr}`,
    `─────────────────────────────`,
    `Объект: ${projectName}`,
    ``,
    `Введите выполненный объём`,
    `за сегодня (число):`,
  ].join("\n");

  const msgId = await renderScreen(chatId, session, text, kb([[{ text: "✕ Отмена", callback_data: "nav:home" }]]));
  await setSession(chatId, "REPORT_STEP1", { project_id: projectId }, msgId);
}

async function reportStep2(chatId: number, session: Session | null, projectId: string, factValue: number) {
  const text = [
    `📍 Ежедневный отчёт · Шаг 2/2`,
    `─────────────────────────────`,
    `Факт: <b>${factValue}</b> ед.`,
    ``,
    `Добавить примечание?`,
  ].join("\n");

  const buttons = [
    [{ text: "✅ Без примечания", callback_data: "report:no_notes" }, { text: "✏️ Добавить текст", callback_data: "report:add_notes" }],
    [{ text: "✕ Отмена", callback_data: "nav:home" }],
  ];

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "REPORT_STEP2", { project_id: projectId, fact_value: factValue }, msgId);
}

// ─── S-08: SUPPLY ────────────────────────────────────────────
async function showSupply(chatId: number, session: Session | null, user: UserProfile, projectId: string) {
  const [projRes, matsRes] = await Promise.all([
    supabase.from("projects").select("name").eq("id", projectId).single(),
    supabase.from("materials").select("name, status, deficit, unit, eta")
      .eq("project_id", projectId).order("deficit", { ascending: false }).limit(15),
  ]);

  const projectName = projRes.data?.name || "Объект";
  const mats = matsRes.data || [];
  const okCount = mats.filter(m => Number(m.deficit) <= 0).length;
  const deficitMats = mats.filter(m => Number(m.deficit) > 0);
  const transitCount = mats.filter(m => m.status === "ordered" || m.status === "shipped").length;

  let text = [
    `📍 ${projectName} › Снабжение`,
    `─────────────────────────────`,
    `✅ Норма:    ${okCount} поз.`,
    `🔴 Дефицит: ${deficitMats.length} поз.`,
    `🚛 В пути:  ${transitCount} поз.`,
  ].join("\n");

  if (deficitMats.length > 0) {
    text += `\n\nКритичные дефициты:`;
    for (const m of deficitMats.slice(0, 3)) {
      const eta = m.eta ? new Date(m.eta).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "—";
      text += `\n• ${m.name} · -${m.deficit} ${m.unit} · ETA ${eta}`;
    }
  }

  const buttons = [
    [{ text: "📊 Дашборд", callback_data: `dash:view:${shortId(projectId)}` }],
    [{ text: "← Назад", callback_data: "nav:home" }],
    [{ text: "🚀 Открыть", url: `${MINI_APP_URL}?project=${projectId}&tab=supply` }],
  ];

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "PROJECT_SELECTED", { project_id: projectId }, msgId);
}

// ─── S-09: PORTFOLIO (Director) ──────────────────────────────
async function showPortfolio(chatId: number, session: Session | null, user: UserProfile) {
  const { data: projects } = await supabase.from("projects")
    .select("id, name, code, status, end_date")
    .in("status", ["active", "paused"]).order("created_at", { ascending: false }).limit(10);

  if (!projects || projects.length === 0) {
    const msgId = await renderScreen(chatId, session, "📍 Портфель · 0 объектов\n─────────────────────────────\n📭 Нет активных проектов.", kb([[{ text: "🏠 В меню", callback_data: "nav:home" }]]));
    await setSession(chatId, "IDLE", {}, msgId);
    return;
  }

  // Fetch stats for all projects in parallel
  const statsPromises = projects.map(async p => {
    const [pfRes, alertsRes] = await Promise.all([
      supabase.from("plan_fact").select("plan_value, fact_value").eq("project_id", p.id).limit(100),
      supabase.from("alerts").select("id, priority").eq("project_id", p.id).eq("is_resolved", false),
    ]);
    const pf = pfRes.data || [];
    const plan = pf.reduce((s, r) => s + Number(r.plan_value || 0), 0);
    const fact = pf.reduce((s, r) => s + Number(r.fact_value || 0), 0);
    const prog = plan > 0 ? Math.round((fact / plan) * 100) : 0;
    const alerts = alertsRes.data || [];
    const daysLeft = p.end_date ? Math.ceil((new Date(p.end_date).getTime() - Date.now()) / 86400000) : null;
    return { ...p, prog, alerts: alerts.length, critical: alerts.filter(a => a.priority === "critical").length, daysLeft };
  });

  const stats = await Promise.all(statsPromises);
  const totalAlerts = stats.reduce((s, p) => s + p.alerts, 0);
  const totalCritical = stats.reduce((s, p) => s + p.critical, 0);

  let text = `📍 Портфель · ${projects.length} объектов\n─────────────────────────────\n`;
  for (const p of stats.slice(0, 5)) {
    const color = projectColor(p.prog);
    const daysStr = p.daysLeft !== null
      ? (p.daysLeft < 0 ? `🔴проср.` : `${p.daysLeft}д`)
      : "";
    text += `${color} ${p.name} · ${p.prog}% · ${daysStr}\n`;
  }
  text += `\nИтого алертов: ${totalAlerts}\nКритичных: ${totalCritical}`;

  const projButtons = stats.slice(0, 4).map(p => ({
    text: p.name.slice(0, 20), callback_data: `dash:view:${shortId(p.id)}`,
  }));
  const buttons: { text: string; callback_data?: string; url?: string }[][] = [];
  if (projButtons.length > 0) buttons.push(projButtons.slice(0, 2));
  if (projButtons.length > 2) buttons.push(projButtons.slice(2, 4));
  buttons.push([{ text: "← Назад", callback_data: "nav:home" }]);

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "IDLE", {}, msgId);
}

// ─── CREWS ───────────────────────────────────────────────────
async function showCrews(chatId: number, session: Session | null, user: UserProfile, projectId: string) {
  const [projRes, crewsRes] = await Promise.all([
    supabase.from("projects").select("name").eq("id", projectId).single(),
    supabase.from("crews").select("name, headcount, specialization, foreman_name")
      .eq("project_id", projectId).eq("is_active", true).order("name"),
  ]);

  const projectName = projRes.data?.name || "Объект";
  const crews = crewsRes.data || [];
  const total = crews.reduce((s, c) => s + (c.headcount || 0), 0);

  let text = `📍 ${projectName} › Бригады\n─────────────────────────────\n👷 ${crews.length} бригад · ${total} чел.\n\n`;
  for (const c of crews.slice(0, 5)) {
    text += `🔹 <b>${c.name}</b> — ${c.headcount} чел.`;
    if (c.specialization) text += `\n   <i>${c.specialization}</i>`;
    if (c.foreman_name) text += `\n   Прораб: ${c.foreman_name}`;
    text += "\n\n";
  }

  const buttons = [
    [{ text: "📊 Дашборд", callback_data: `dash:view:${shortId(projectId)}` }],
    [{ text: "← Назад", callback_data: "nav:home" }],
  ];

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "PROJECT_SELECTED", { project_id: projectId }, msgId);
}

// ─── S-10: ERROR SCREEN ──────────────────────────────────────
async function showError(chatId: number, session: Session | null, errorMsg: string) {
  const text = [
    `📍 STSphera · Ошибка`,
    `─────────────────────────────`,
    `⚠️ ${errorMsg}`,
    ``,
    `Попробуйте ещё раз или`,
    `откройте приложение.`,
  ].join("\n");

  const buttons = [
    [{ text: "🔄 Повторить", callback_data: "nav:home" }, { text: "🏠 В меню", callback_data: "nav:home" }],
    [{ text: "🚀 Открыть приложение", url: MINI_APP_URL }],
  ];

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "IDLE", {}, msgId);
}

// ─── NOT LINKED SCREEN ───────────────────────────────────────
async function showNotLinked(chatId: number, session: Session | null) {
  const text = [
    `📍 STSphera · Привязка аккаунта`,
    `─────────────────────────────`,
    `⚠️ Ваш аккаунт не привязан.`,
    ``,
    `Откройте приложение и укажите`,
    `Chat ID в настройках профиля:`,
    ``,
    `🆔 Ваш Chat ID: <code>${chatId}</code>`,
  ].join("\n");

  const msgId = await sendMessage(chatId, text, kb([[{ text: "🚀 Открыть приложение", url: MINI_APP_URL }]]));
  if (msgId) await setSession(chatId, "IDLE", {}, msgId);
}

// ─── Resolve full project ID from short ID ───────────────────
async function resolveProjectId(shortPid: string, userId: string): Promise<string | null> {
  const { data } = await supabase.from("projects").select("id")
    .eq("status", "active").ilike("id", `${shortPid}%`).limit(1).single();
  return data?.id ?? null;
}

// ─── CALLBACK ROUTER ─────────────────────────────────────────
async function handleCallback(chatId: number, cbData: string, cbId: string, session: Session | null) {
  const start = Date.now();
  await answerCb(cbId);

  const user = await getUserByChatId(chatId);
  if (!user) { await showNotLinked(chatId, session); return; }

  const roles = await getUserRoles(user.user_id);
  const [ns, action, ...params] = cbData.split(":");

  try {
    // Navigation
    if (ns === "nav") {
      if (action === "home") return await showHub(chatId, session, user, roles);
      if (action === "dashboard") return await showProjectSelect(chatId, session, user, "dashboard");
      if (action === "alerts") return await showProjectSelect(chatId, session, user, "alerts");
      if (action === "supply") return await showProjectSelect(chatId, session, user, "supply");
      if (action === "report") return await showProjectSelect(chatId, session, user, "report");
      if (action === "portfolio") {
        if (!canAccess(roles, "portfolio")) {
          await showError(chatId, session, "У вас нет доступа к этому разделу.");
          return;
        }
        return await showPortfolio(chatId, session, user);
      }
      if (action === "back") return await showHub(chatId, session, user, roles);
    }

    // Dashboard
    if (ns === "dash" && action === "view") {
      const pid = await resolveProjectId(params[0], user.user_id);
      if (!pid) return await showError(chatId, session, "Объект не найден.");
      return await showDashboard(chatId, session, user, pid);
    }

    // Project select
    if (ns === "proj" && action === "select") {
      const pid = await resolveProjectId(params[0], user.user_id);
      const nextAction = params[1] || "dashboard";
      if (!pid) return await showError(chatId, session, "Объект не найден.");
      return await routeToAction(chatId, session, user, nextAction, pid);
    }

    // Alerts
    if (ns === "alert") {
      if (action === "list") {
        const pid = await resolveProjectId(params[0], user.user_id);
        if (!pid) return await showError(chatId, session, "Объект не найден.");
        return await showAlerts(chatId, session, user, pid);
      }
      if (action === "create" && params[0] === "step1") {
        if (!canAccess(roles, "alerts_create")) return await showError(chatId, session, "У вас нет прав на создание алертов.");
        const pid = await resolveProjectId(params[1], user.user_id);
        if (!pid) return await showError(chatId, session, "Объект не найден.");
        return await alertStep1(chatId, session, pid);
      }
      if (action === "prio") {
        const priority = params[0];
        const ctx = session?.context || {};
        return await alertConfirm(chatId, session, ctx.project_id as string, ctx.title as string, priority);
      }
      if (action === "confirm") {
        const ctx = session?.context || {};
        const { project_id, title, priority } = ctx as { project_id: string; title: string; priority: string };
        const { error } = await supabase.from("alerts").insert({
          project_id, title, priority, is_resolved: false,
          created_at: new Date().toISOString(),
        });
        if (error) return await showError(chatId, session, "Ошибка при создании алерта.");
        await audit(chatId, user.user_id, "alert.create", { project_id, title, priority }, "success", Date.now() - start);
        return await showStatus(chatId, session, `✅ Алерт создан\n\n«${title}»\n${priorityLabel(priority)}`, project_id);
      }
    }

    // Supply
    if (ns === "supply" && action === "view") {
      const pid = await resolveProjectId(params[0], user.user_id);
      if (!pid) return await showError(chatId, session, "Объект не найден.");
      return await showSupply(chatId, session, user, pid);
    }

    // Crews
    if (ns === "crew" && action === "view") {
      const pid = await resolveProjectId(params[0], user.user_id);
      if (!pid) return await showError(chatId, session, "Объект не найден.");
      return await showCrews(chatId, session, user, pid);
    }

    // Report
    if (ns === "report") {
      if (action === "no_notes") {
        const ctx = session?.context || {};
        const { project_id, fact_value } = ctx as { project_id: string; fact_value: number };
        const today = new Date().toISOString().split("T")[0];
        const { error } = await supabase.from("plan_fact").insert({
          project_id, date: today, week_number: getWeekNumber(new Date()),
          fact_value, plan_value: 0,
        });
        if (error) return await showError(chatId, session, "Ошибка сохранения отчёта.");
        await audit(chatId, user.user_id, "report.submit", { project_id, fact_value }, "success", Date.now() - start);
        return await showStatus(chatId, session, `✅ Отчёт сохранён\n\n📅 ${today}\n📊 Факт: ${fact_value} ед.`, project_id);
      }
      if (action === "add_notes") {
        const ctx = session?.context || {};
        const msgId = await renderScreen(chatId, session,
          `📍 Ежедневный отчёт\n─────────────────────────────\nФакт: ${ctx.fact_value} ед.\n\nВведите примечание:`,
          kb([[{ text: "✕ Отмена", callback_data: "nav:home" }]]));
        await setSession(chatId, "REPORT_NOTES", { ...ctx }, msgId);
        return;
      }
    }

    // Unknown callback — ignore silently
    console.log(`[bot] unknown callback: ${cbData}`);
  } catch (err) {
    console.error(`[bot] callback error:`, err);
    await audit(chatId, user.user_id, `callback.${cbData}`, {}, "error", Date.now() - start);
    await showError(chatId, session, "Произошла ошибка. Попробуйте позже.");
  }
}

// ─── TEXT MESSAGE ROUTER ─────────────────────────────────────
async function handleMessage(chatId: number, text: string, firstName: string) {
  const start = Date.now();
  const session = await getSession(chatId);
  const user = await getUserByChatId(chatId);

  // Commands
  if (text.startsWith("/")) {
    if (text === "/start" || text === "/menu") {
      if (!user) return await showNotLinked(chatId, session);
      const roles = await getUserRoles(user.user_id);
      return await showHub(chatId, session, user, roles);
    }
    if (text === "/cancel") {
      await clearSession(chatId);
      if (!user) return await showNotLinked(chatId, session);
      const roles = await getUserRoles(user.user_id);
      return await showHub(chatId, session, user, roles);
    }
    if (text === "/myid") {
      await sendMessage(chatId, `🆔 Ваш Chat ID: <code>${chatId}</code>\n\nСкопируйте и вставьте в настройки профиля STSphera.`);
      return;
    }
    // Shortcuts
    if (text.startsWith("/dashboard") || text === "/d") {
      if (!user) return await showNotLinked(chatId, session);
      return await showProjectSelect(chatId, session, user, "dashboard");
    }
    if (text.startsWith("/alerts") || text === "/a") {
      if (!user) return await showNotLinked(chatId, session);
      return await showProjectSelect(chatId, session, user, "alerts");
    }
    if (text.startsWith("/report") || text === "/r") {
      if (!user) return await showNotLinked(chatId, session);
      const roles = await getUserRoles(user.user_id);
      if (!canAccess(roles, "report")) return await showError(chatId, session, "У вас нет доступа к отчётам.");
      return await showProjectSelect(chatId, session, user, "report");
    }
    if (text.startsWith("/portfolio") || text === "/p") {
      if (!user) return await showNotLinked(chatId, session);
      const roles = await getUserRoles(user.user_id);
      if (!canAccess(roles, "portfolio")) return await showError(chatId, session, "У вас нет доступа к портфелю.");
      return await showPortfolio(chatId, session, user);
    }
    // Unknown command → show hub
    if (!user) return await showNotLinked(chatId, session);
    const roles = await getUserRoles(user.user_id);
    return await showHub(chatId, session, user, roles);
  }

  // FSM state handlers for text input
  if (!user) return await showNotLinked(chatId, session);

  if (session?.state === "ALERT_STEP1") {
    const title = text.trim().slice(0, 100);
    if (!title) { await sendMessage(chatId, "⚠️ Введите название алерта."); return; }
    return await alertStep2(chatId, session, session.context.project_id as string, title);
  }

  if (session?.state === "REPORT_STEP1") {
    const factValue = parseFloat(text.replace(",", "."));
    if (isNaN(factValue) || factValue < 0) {
      await sendMessage(chatId, "⚠️ Введите число, например: <code>45.5</code>");
      return;
    }
    return await reportStep2(chatId, session, session.context.project_id as string, factValue);
  }

  if (session?.state === "REPORT_NOTES") {
    const ctx = session.context;
    const { project_id, fact_value } = ctx as { project_id: string; fact_value: number };
    const today = new Date().toISOString().split("T")[0];
    const { error } = await supabase.from("plan_fact").insert({
      project_id, date: today, week_number: getWeekNumber(new Date()),
      fact_value, plan_value: 0, notes: text,
    });
    if (error) return await showError(chatId, session, "Ошибка сохранения отчёта.");
    await audit(chatId, user.user_id, "report.submit", { project_id, fact_value, notes: text }, "success", Date.now() - start);
    return await showStatus(chatId, session, `✅ Отчёт сохранён\n\n📅 ${today}\n📊 Факт: ${fact_value} ед.\n📝 ${text}`, project_id);
  }

  // Default: show hub
  const roles = await getUserRoles(user.user_id);
  return await showHub(chatId, session, user, roles);
}

// ─── WEBHOOK ENTRY POINT ─────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("OK", { status: 200 });

  try {
    const update = await req.json();

    if (update.message?.text) {
      const msg = update.message;
      await handleMessage(msg.chat.id, msg.text, msg.from?.first_name || "Пользователь");
    } else if (update.callback_query) {
      const cq = update.callback_query;
      const session = await getSession(cq.from.id);
      await handleCallback(cq.from.id, cq.data || "", cq.id, session);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[bot] fatal:", err);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
