import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════
// SECTION 1: Config, Types, RBAC, Telegram API, Rate Limit,
//            Session, Audit, User helpers
// ═══════════════════════════════════════════════════════════════

// ─── Config ──────────────────────────────────────────────────
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const MINI_APP_URL = Deno.env.get("MINI_APP_URL") || "https://id-preview--fe942628-85b8-4407-a858-132ee496d745.lovable.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
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

type SessionState =
  | "IDLE"
  | "PROJECT_SELECT"
  | "PROJECT_SELECTED"
  | "ALERT_STEP1"
  | "ALERT_STEP2"
  | "ALERT_CONFIRM"
  | "REPORT_ZONE"
  | "REPORT_WORKS"
  | "REPORT_VOLUME"
  | "REPORT_WORKERS"
  | "REPORT_ISSUES"
  | "REPORT_CONFIRM"
  | "REPORT_NOTES"
  | "APPROVAL_DETAIL";

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
    case "report": return isForeman || r.has("production");
    case "supply": return r.has("director") || r.has("pm") || r.has("supply") || isForeman;
    case "portfolio": return r.has("director");
    case "crews": return true;
    case "tasks": return true;
    case "approvals": return true;
    case "calendar": return true;
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
  await tg("editMessageReplyMarkup", {
    chat_id: chatId, message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  });
}

function kb(buttons: { text: string; callback_data?: string; url?: string; web_app?: { url: string } }[][]) {
  return {
    inline_keyboard: buttons.map(row =>
      row.map(b => {
        if (b.url) return { text: b.text, url: b.url };
        if (b.web_app) return { text: b.text, web_app: b.web_app };
        return { text: b.text, callback_data: b.callback_data };
      })
    ),
  };
}

// ─── Rate Limiting (in-memory) ───────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(chatId: number): boolean {
  const key = String(chatId);
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

// ─── Session (FSM State) ─────────────────────────────────────
async function getSession(chatId: number): Promise<Session | null> {
  const { data } = await supabase.from("bot_sessions")
    .select("*").eq("chat_id", String(chatId)).maybeSingle();
  return data;
}

async function setSession(
  chatId: number, state: string,
  context: Record<string, unknown> = {},
  messageId?: number | null,
) {
  const existing = await getSession(chatId);
  const mergedContext = { ...(existing?.context || {}), ...context };
  const row: Record<string, unknown> = {
    chat_id: String(chatId), state, context: mergedContext,
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 2 * 3600000).toISOString(),
  };
  if (messageId !== undefined) row.message_id = messageId;
  await supabase.from("bot_sessions").upsert(row, { onConflict: "chat_id" });
}

async function updateSessionMessage(chatId: number, messageId: number) {
  await supabase.from("bot_sessions")
    .update({ message_id: messageId }).eq("chat_id", String(chatId));
}

async function clearSession(chatId: number) {
  await supabase.from("bot_sessions").delete().eq("chat_id", String(chatId));
}

// ─── Audit ───────────────────────────────────────────────────
async function audit(
  chatId: number, userId: string | null, action: string,
  payload: Record<string, unknown> = {}, result = "success", durationMs?: number,
) {
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
  const { data } = await supabase.from("user_roles")
    .select("role").eq("user_id", userId);
  return (data || []).map((r: { role: string }) => r.role);
}

async function getUserProjects(_userId: string) {
  const { data } = await supabase.from("projects")
    .select("id, name, code, status, end_date")
    .eq("status", "active")
    .order("created_at", { ascending: false }).limit(10);
  return data || [];
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2: renderScreen, Utility functions
// ═══════════════════════════════════════════════════════════════

// ─── Screen: send or edit ────────────────────────────────────
async function renderScreen(
  chatId: number, session: Session | null,
  text: string, markup: unknown,
): Promise<number> {
  if (session?.message_id) {
    const res = await editMessage(chatId, session.message_id, text, markup);
    if (res?.ok) return session.message_id;
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
  return ({
    critical: "🔴 Критичный", high: "🟠 Высокий",
    medium: "🟡 Средний", low: "⚪ Низкий",
  } as Record<string, string>)[p] || p;
}

function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}

function shortId(uuid: string): string {
  return uuid.slice(0, 8);
}

function statusLabel(s: string): string {
  return ({
    "Ожидание": "⏳ Ожидание",
    "В работе": "🔧 В работе",
    "Готово": "✅ Готово",
  } as Record<string, string>)[s] ?? s;
}

function taskPriorityIcon(p: string): string {
  return ({
    critical: "🔴", high: "🟠", medium: "🟡", low: "⚪",
  } as Record<string, string>)[p] || "⚪";
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3: showHub — Main menu with updated buttons
// ═══════════════════════════════════════════════════════════════

async function showHub(chatId: number, session: Session | null, user: UserProfile, roles: string[]) {
  const projects = await getUserProjects(user.user_id);
  const roleLabel = ROLE_LABELS[roles[0]] || roles[0] || "Пользователь";
  const isDirector = roles.includes("director");
  const isForeman = roles.some(r => r.startsWith("foreman"));
  const now = new Date();
  const timeStr = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
  const dayStr = now.toLocaleDateString("ru-RU", { weekday: "long", timeZone: "Europe/Moscow" });

  // Badge counts
  let alertBadge = "";
  let taskBadge = "";
  let approvalBadge = "";

  const [alertsRes, tasksRes, approvalsRes] = await Promise.all([
    supabase.from("alerts").select("id", { count: "exact", head: true }).eq("is_resolved", false),
    supabase.from("ecosystem_tasks").select("id", { count: "exact", head: true })
      .eq("assigned_to", user.user_id).in("status", ["Ожидание", "В работе"]),
    supabase.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  if (alertsRes.count && alertsRes.count > 0) alertBadge = ` (${alertsRes.count})`;
  if (tasksRes.count && tasksRes.count > 0) taskBadge = ` (${tasksRes.count})`;
  if (approvalsRes.count && approvalsRes.count > 0) approvalBadge = ` (${approvalsRes.count})`;

  const text = [
    `📍 <b>STSphera</b> · ${user.display_name}`,
    `Роль: ${roleLabel} · ${projects.length} объектов`,
    `───────────────────────────`,
    `⏰ ${timeStr} · ${dayStr}`,
  ].join("\n");

  const buttons: { text: string; callback_data?: string; url?: string }[][] = [];

  // Row 1: Portfolio(director)/Dashboard + Alerts
  const row1: { text: string; callback_data?: string; url?: string }[] = [];
  if (isDirector) {
    row1.push({ text: "📁 Портфель", callback_data: "nav:portfolio" });
  } else {
    row1.push({ text: "📊 Мой объект", callback_data: "nav:dashboard" });
  }
  row1.push({ text: `🔔 Алерты${alertBadge}`, callback_data: "nav:alerts" });
  buttons.push(row1);

  // Row 2: Supply + Report (by role)
  const row2: { text: string; callback_data?: string; url?: string }[] = [];
  if (canAccess(roles, "supply")) row2.push({ text: "📦 Снабжение", callback_data: "nav:supply" });
  if (canAccess(roles, "report")) row2.push({ text: "📋 Отчёт", callback_data: "nav:report" });
  if (row2.length > 0) buttons.push(row2);

  // Row 3: Tasks + Approvals
  buttons.push([
    { text: `📌 Задачи${taskBadge}`, callback_data: "nav:tasks" },
    { text: `📝 Согласования${approvalBadge}`, callback_data: "nav:approvals" },
  ]);

  // Row 4: Calendar
  buttons.push([{ text: "📅 Календарь", callback_data: "nav:calendar" }]);

  // Row 5: Open app link
  buttons.push([{ text: "🚀 Открыть приложение", url: MINI_APP_URL }]);

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "IDLE", { user_id: user.user_id }, msgId);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4: showProjectSelect, routeToAction, showDashboard,
//            showPortfolio
// ═══════════════════════════════════════════════════════════════

async function showProjectSelect(chatId: number, session: Session | null, user: UserProfile, nextAction: string) {
  const projects = await getUserProjects(user.user_id);
  if (projects.length === 0) {
    const msgId = await renderScreen(chatId, session,
      "📍 STSphera › Выбор объекта\n───────────────────────────\n📭 Нет активных объектов.",
      kb([[{ text: "🏠 В меню", callback_data: "nav:home" }]]));
    await setSession(chatId, "IDLE", {}, msgId);
    return;
  }
  if (projects.length === 1) {
    await routeToAction(chatId, session, user, nextAction, projects[0].id);
    return;
  }

  const projectButtons = projects.slice(0, 5).map(p => [
    { text: p.name.slice(0, 30), callback_data: `proj:select:${shortId(p.id)}:${nextAction}` },
  ]);
  projectButtons.push([{ text: "← Назад", callback_data: "nav:home" }]);

  const text = `📍 STSphera › Выбор объекта\n───────────────────────────\nВыберите объект:`;
  const msgId = await renderScreen(chatId, session, text, kb(projectButtons));
  await setSession(chatId, "PROJECT_SELECT", { next_action: nextAction }, msgId);
}

async function routeToAction(chatId: number, session: Session | null, user: UserProfile, action: string, projectId: string) {
  switch (action) {
    case "dashboard": return showDashboard(chatId, session, user, projectId);
    case "alerts": return showAlerts(chatId, session, user, projectId);
    case "supply": return showSupply(chatId, session, user, projectId);
    case "report": return reportSelectZone(chatId, session, user, projectId);
    case "crews": return showCrews(chatId, session, user, projectId);
    case "calendar": return showCalendar(chatId, session, user, projectId);
    default: return showDashboard(chatId, session, user, projectId);
  }
}

async function showDashboard(chatId: number, session: Session | null, user: UserProfile, projectId: string) {
  const [projRes, pfRes, alertsRes, matRes] = await Promise.all([
    supabase.from("projects").select("id, name, code, end_date").eq("id", projectId).single(),
    supabase.from("plan_fact").select("plan_value, fact_value").eq("project_id", projectId).limit(100),
    supabase.from("alerts").select("id, priority").eq("project_id", projectId).eq("is_resolved", false),
    supabase.from("materials").select("deficit").eq("project_id", projectId),
  ]);

  const project = projRes.data;
  if (!project) {
    const msgId = await renderScreen(chatId, session,
      "⚠️ Объект не найден.",
      kb([[{ text: "🏠 В меню", callback_data: "nav:home" }]]));
    await setSession(chatId, "IDLE", {}, msgId);
    return;
  }

  const pf = pfRes.data || [];
  const totalPlan = pf.reduce((s: number, r: any) => s + Number(r.plan_value || 0), 0);
  const totalFact = pf.reduce((s: number, r: any) => s + Number(r.fact_value || 0), 0);
  const progress = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;

  const alerts = alertsRes.data || [];
  const alertCount = alerts.length;
  const critical = alerts.filter((a: any) => a.priority === "critical").length;

  const mats = matRes.data || [];
  const deficitItems = mats.filter((m: any) => Number(m.deficit) > 0).length;

  const daysLeft = project.end_date
    ? Math.ceil((new Date(project.end_date).getTime() - Date.now()) / 86400000) : null;

  const text = [
    `📍 ${project.name} › Дашборд`,
    `───────────────────────────`,
    `${progressBar(progress)} <b>${progress}%</b>`,
    `План ${totalPlan.toLocaleString("ru")} · Факт ${totalFact.toLocaleString("ru")}`,
    ``,
    `📅 До сдачи: ${deadlineStatus(daysLeft)}`,
    `🔔 Алертов: ${alertCount}${critical > 0 ? ` · 🔴 ${critical} крит.` : ""}`,
    `📦 Дефицит: ${deficitItems} позиций`,
  ].join("\n");

  const buttons: { text: string; callback_data?: string; url?: string }[][] = [
    [
      { text: "🔔 Алерты", callback_data: `alert:list:${shortId(projectId)}` },
      { text: "📦 Снабжение", callback_data: `supply:view:${shortId(projectId)}` },
    ],
    [
      { text: "👷 Бригады", callback_data: `crew:view:${shortId(projectId)}` },
      { text: "📅 Календарь", callback_data: `cal:view:${shortId(projectId)}` },
    ],
    [{ text: "🚀 Открыть подробно", url: `${MINI_APP_URL}?project=${projectId}` }],
    [{ text: "← Назад", callback_data: "nav:home" }],
  ];

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "PROJECT_SELECTED", { project_id: projectId, user_id: user.user_id }, msgId);
}

async function showPortfolio(chatId: number, session: Session | null, user: UserProfile) {
  const { data: projects } = await supabase.from("projects")
    .select("id, name, code, status, end_date")
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: false }).limit(10);

  if (!projects || projects.length === 0) {
    const msgId = await renderScreen(chatId, session,
      "📍 Портфель · 0 объектов\n───────────────────────────\n📭 Нет активных проектов.",
      kb([[{ text: "🏠 В меню", callback_data: "nav:home" }]]));
    await setSession(chatId, "IDLE", {}, msgId);
    return;
  }

  const statsPromises = projects.map(async (p: any) => {
    const [pfRes, alertsRes] = await Promise.all([
      supabase.from("plan_fact").select("plan_value, fact_value").eq("project_id", p.id).limit(100),
      supabase.from("alerts").select("id, priority").eq("project_id", p.id).eq("is_resolved", false),
    ]);
    const pf = pfRes.data || [];
    const plan = pf.reduce((s: number, r: any) => s + Number(r.plan_value || 0), 0);
    const fact = pf.reduce((s: number, r: any) => s + Number(r.fact_value || 0), 0);
    const prog = plan > 0 ? Math.round((fact / plan) * 100) : 0;
    const alerts = alertsRes.data || [];
    const daysLeft = p.end_date ? Math.ceil((new Date(p.end_date).getTime() - Date.now()) / 86400000) : null;
    return { ...p, prog, alerts: alerts.length, critical: alerts.filter((a: any) => a.priority === "critical").length, daysLeft };
  });

  const stats = await Promise.all(statsPromises);
  const totalAlerts = stats.reduce((s, p) => s + p.alerts, 0);
  const totalCritical = stats.reduce((s, p) => s + p.critical, 0);

  let text = `📍 Портфель · ${projects.length} объектов\n───────────────────────────\n`;
  for (const p of stats.slice(0, 5)) {
    const color = projectColor(p.prog);
    const daysStr = p.daysLeft !== null
      ? (p.daysLeft < 0 ? `🔴проср.` : `${p.daysLeft}д`) : "";
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

// ═══════════════════════════════════════════════════════════════
// SECTION 5: showAlerts, alertStep1, alertStep2, alertConfirm
// ═══════════════════════════════════════════════════════════════

async function showAlerts(chatId: number, session: Session | null, user: UserProfile, projectId: string) {
  const [projRes, alertsRes] = await Promise.all([
    supabase.from("projects").select("name").eq("id", projectId).single(),
    supabase.from("alerts").select("id, title, priority, created_at")
      .eq("project_id", projectId).eq("is_resolved", false)
      .order("created_at", { ascending: false }).limit(10),
  ]);

  const projectName = projRes.data?.name || "Объект";
  const alerts = alertsRes.data || [];
  const criticalN = alerts.filter((a: any) => a.priority === "critical").length;
  const highN = alerts.filter((a: any) => a.priority === "high").length;
  const mediumN = alerts.filter((a: any) => a.priority === "medium").length;

  let text = `📍 ${projectName} › Алерты\n───────────────────────────\nОткрытых: ${alerts.length}\n\n`;
  if (alerts.length > 0) {
    text += `🔴 Критичных: ${criticalN}\n🟠 Высоких: ${highN}\n🟡 Средних: ${mediumN}\n\nПоследние:\n`;
    for (const a of alerts.slice(0, 5)) {
      const emoji = ({ critical: "🔴", high: "🟠", medium: "🟡", low: "⚪" } as Record<string, string>)[a.priority] || "⚪";
      const date = new Date(a.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      text += `• ${emoji} ${a.title} · ${date}\n`;
    }
  } else {
    text += `✨ Нет открытых алертов.`;
  }

  const roles = await getUserRoles(user.user_id);
  const buttons: { text: string; callback_data?: string; url?: string }[][] = [];
  if (canAccess(roles, "alerts_create")) {
    buttons.push([{ text: "➕ Создать", callback_data: `alert:create:step1:${shortId(projectId)}` }]);
  }
  buttons.push([
    { text: "📊 Дашборд", callback_data: `dash:view:${shortId(projectId)}` },
    { text: "🏠 В меню", callback_data: "nav:home" },
  ]);

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "PROJECT_SELECTED", { project_id: projectId, user_id: user.user_id }, msgId);
}

async function alertStep1(chatId: number, session: Session | null, projectId: string) {
  const text = `📍 Новый алерт · Шаг 1/3\n───────────────────────────\nВведите краткое название проблемы:`;
  const msgId = await renderScreen(chatId, session, text,
    kb([[{ text: "✕ Отмена", callback_data: `alert:list:${shortId(projectId)}` }]]));
  await setSession(chatId, "ALERT_STEP1", { project_id: projectId }, msgId);
}

async function alertStep2(chatId: number, session: Session | null, projectId: string, title: string) {
  const text = [
    `📍 Новый алерт · Шаг 2/3`,
    `───────────────────────────`,
    `Название: «${title}»`,
    ``,
    `Выберите приоритет:`,
  ].join("\n");

  const buttons = [
    [{ text: "🔴 Критичный", callback_data: "alert:prio:critical" }, { text: "🟠 Высокий", callback_data: "alert:prio:high" }],
    [{ text: "🟡 Средний", callback_data: "alert:prio:medium" }, { text: "⚪ Низкий", callback_data: "alert:prio:low" }],
    [{ text: "✕ Отмена", callback_data: `alert:list:${shortId(projectId)}` }],
  ];

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "ALERT_STEP2", { project_id: projectId, title }, msgId);
}

async function alertConfirm(chatId: number, session: Session | null, projectId: string, title: string, priority: string) {
  const { data: proj } = await supabase.from("projects").select("name").eq("id", projectId).single();
  const projectName = proj?.name || "Объект";

  const text = [
    `📍 Новый алерт · Шаг 3/3`,
    `───────────────────────────`,
    `Проверьте данные:`,
    ``,
    `Название: ${title}`,
    `Приоритет: ${priorityLabel(priority)}`,
    `Объект: ${projectName}`,
  ].join("\n");

  const buttons = [
    [{ text: "✅ Создать", callback_data: "alert:confirm" }, { text: "✏️ Изменить", callback_data: `alert:create:step1:${shortId(projectId)}` }],
    [{ text: "✕ Отмена", callback_data: `alert:list:${shortId(projectId)}` }],
  ];

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "ALERT_CONFIRM", { project_id: projectId, title, priority }, msgId);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 6: Full Report FSM — zone, works, volume, workers,
//            issues, confirm, save
// ═══════════════════════════════════════════════════════════════

async function reportSelectZone(chatId: number, session: Session | null, user: UserProfile, projectId: string) {
  const [projRes, zonesRes] = await Promise.all([
    supabase.from("projects").select("name").eq("id", projectId).single(),
    supabase.from("work_types").select("id, section").eq("project_id", projectId),
  ]);

  const projectName = projRes.data?.name || "Объект";
  const zones = zonesRes.data || [];
  const sections = [...new Set(zones.map((z: any) => z.section))];

  if (sections.length === 0) {
    const msgId = await renderScreen(chatId, session,
      `📍 ${projectName} › Отчёт\n───────────────────────────\n⚠️ Нет участков работ для этого объекта.`,
      kb([[{ text: "🏠 В меню", callback_data: "nav:home" }]]));
    await setSession(chatId, "IDLE", {}, msgId);
    return;
  }

  const dateStr = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "long" });
  const text = [
    `📍 ${projectName} › Отчёт`,
    `───────────────────────────`,
    `📅 ${dateStr}`,
    ``,
    `Выберите участок работ:`,
  ].join("\n");

  const buttons = sections.slice(0, 8).map((s: string) => [
    { text: s, callback_data: `report:zone:${s.slice(0, 40)}` },
  ]);
  buttons.push([{ text: "✕ Отмена", callback_data: "nav:home" }]);

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "REPORT_ZONE", { project_id: projectId, project_name: projectName }, msgId);
}

async function reportWorks(chatId: number, session: Session | null, zoneName: string) {
  const ctx = session?.context || {};
  const text = [
    `📍 ${ctx.project_name} › Отчёт`,
    `───────────────────────────`,
    `📍 Участок: <b>${zoneName}</b>`,
    ``,
    `🔨 Опишите выполненные работы:`,
  ].join("\n");

  const msgId = await renderScreen(chatId, session, text,
    kb([[{ text: "✕ Отмена", callback_data: "nav:home" }]]));
  await setSession(chatId, "REPORT_WORKS", { zone_name: zoneName }, msgId);
}

async function reportVolume(chatId: number, session: Session | null) {
  const ctx = session?.context || {};
  const text = [
    `📍 ${ctx.project_name} › Отчёт`,
    `───────────────────────────`,
    `📍 ${ctx.zone_name}`,
    `🔨 ${ctx.works}`,
    ``,
    `📏 Введите объём (число или текст):`,
  ].join("\n");

  const msgId = await renderScreen(chatId, session, text,
    kb([[{ text: "✕ Отмена", callback_data: "nav:home" }]]));
  await setSession(chatId, "REPORT_VOLUME", {}, msgId);
}

async function reportWorkers(chatId: number, session: Session | null) {
  const ctx = session?.context || {};
  const text = [
    `📍 ${ctx.project_name} › Отчёт`,
    `───────────────────────────`,
    `📍 ${ctx.zone_name}`,
    `🔨 ${ctx.works}`,
    `📏 Объём: ${ctx.volume}`,
    ``,
    `👷 Количество рабочих (число):`,
  ].join("\n");

  const msgId = await renderScreen(chatId, session, text,
    kb([[{ text: "✕ Отмена", callback_data: "nav:home" }]]));
  await setSession(chatId, "REPORT_WORKERS", {}, msgId);
}

async function reportIssues(chatId: number, session: Session | null) {
  const ctx = session?.context || {};
  const text = [
    `📍 ${ctx.project_name} › Отчёт`,
    `───────────────────────────`,
    `📍 ${ctx.zone_name}`,
    `🔨 ${ctx.works}`,
    `📏 Объём: ${ctx.volume}`,
    `👷 Рабочих: ${ctx.workers}`,
    ``,
    `⚠️ Проблемы / замечания:`,
    `<i>(напишите «нет» если всё в порядке)</i>`,
  ].join("\n");

  const msgId = await renderScreen(chatId, session, text,
    kb([[{ text: "✕ Отмена", callback_data: "nav:home" }]]));
  await setSession(chatId, "REPORT_ISSUES", {}, msgId);
}

async function reportConfirm(chatId: number, session: Session | null, issues: string | null) {
  const ctx = session?.context || {};
  const text = [
    `📍 ${ctx.project_name} › Отчёт · Подтверждение`,
    `───────────────────────────`,
    `📍 Участок: ${ctx.zone_name}`,
    `🔨 Работы: ${ctx.works}`,
    `📏 Объём: ${ctx.volume}`,
    `👷 Рабочих: ${ctx.workers} чел.`,
    `⚠️ Проблемы: ${issues || "Нет"}`,
    ``,
    `Всё верно?`,
  ].join("\n");

  const buttons = [
    [{ text: "✅ Отправить", callback_data: "report:confirm" }],
    [{ text: "❌ Отменить", callback_data: "report:cancel" }],
  ];

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "REPORT_CONFIRM", { issues }, msgId);
}

async function reportSave(chatId: number, session: Session | null, user: UserProfile) {
  const ctx = session?.context || {};
  const today = new Date().toISOString().split("T")[0];

  const { error } = await supabase.from("daily_logs").insert({
    project_id: ctx.project_id,
    zone_name: ctx.zone_name,
    date: today,
    works_description: ctx.works,
    volume: String(ctx.volume),
    workers_count: parseInt(String(ctx.workers)) || 0,
    issues_description: ctx.issues || null,
    status: "submitted",
    submitted_by: user.user_id,
  });

  if (error) {
    console.error("[report] save error:", error);
    const msgId = await renderScreen(chatId, session,
      `📍 STSphera · Ошибка\n───────────────────────────\n⚠️ Не удалось сохранить отчёт.`,
      kb([[{ text: "🔄 Повторить", callback_data: "report:confirm" }, { text: "🏠 В меню", callback_data: "nav:home" }]]));
    await setSession(chatId, "REPORT_CONFIRM", {}, msgId);
    return;
  }

  // Also save to plan_fact for dashboard stats
  await supabase.from("plan_fact").insert({
    project_id: ctx.project_id,
    date: today,
    week_number: getWeekNumber(new Date()),
    plan_value: 0,
    fact_value: parseFloat(String(ctx.volume)) || 0,
    reported_by: user.user_id,
  });

  const text = [
    `📍 STSphera · Отчёт сохранён ✅`,
    `───────────────────────────`,
    `📋 ${ctx.project_name}`,
    `📍 ${ctx.zone_name}`,
    `🔨 ${ctx.works}`,
    `📏 ${ctx.volume}`,
    `👷 ${ctx.workers} чел.`,
    `⚠️ ${ctx.issues || "Нет проблем"}`,
    `📅 ${today}`,
  ].join("\n");

  const msgId = await renderScreen(chatId, session, text,
    kb([[{ text: "📊 Дашборд", callback_data: `dash:view:${shortId(String(ctx.project_id))}` }, { text: "🏠 В меню", callback_data: "nav:home" }]]));
  await setSession(chatId, "IDLE", {}, msgId);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 7: showTasks, showTaskDetail, task status change
// ═══════════════════════════════════════════════════════════════

async function showTasks(chatId: number, session: Session | null, user: UserProfile) {
  const { data: tasks } = await supabase
    .from("ecosystem_tasks")
    .select("id, task_number, code, name, status, priority, planned_date, block, department")
    .eq("assigned_to", user.user_id)
    .in("status", ["Ожидание", "В работе"])
    .order("planned_date", { ascending: true, nullsFirst: false })
    .limit(10);

  if (!tasks || tasks.length === 0) {
    const msgId = await renderScreen(chatId, session,
      `📍 STSphera › Задачи\n───────────────────────────\n✨ Нет открытых задач!`,
      kb([[{ text: "🏠 В меню", callback_data: "nav:home" }]]));
    await setSession(chatId, "IDLE", {}, msgId);
    return;
  }

  let text = `📍 STSphera › Задачи (${tasks.length})\n───────────────────────────\n`;
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const dl = t.planned_date ? ` · 📅 ${t.planned_date}` : "";
    const pri = taskPriorityIcon(t.priority);
    text += `\n${i + 1}. ${pri} <b>${t.code || t.task_number || ""}</b> ${t.name}\n   ${statusLabel(t.status)}${dl}`;
  }

  const buttons: { text: string; callback_data: string }[][] = tasks.map((t: any) => {
    const row: { text: string; callback_data: string }[] = [];
    if (t.status === "Ожидание") {
      row.push({ text: `🔧 ${t.code || shortId(t.id)}`, callback_data: `task:start:${shortId(t.id)}` });
    }
    if (t.status === "В работе" || t.status === "Ожидание") {
      row.push({ text: `✅ ${t.code || shortId(t.id)}`, callback_data: `task:done:${shortId(t.id)}` });
    }
    return row;
  }).filter((r: any[]) => r.length > 0);

  buttons.push([{ text: "🏠 В меню", callback_data: "nav:home" }]);

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "IDLE", {}, msgId);
}

async function showTaskDetail(chatId: number, session: Session | null, taskId: string) {
  const { data: task } = await supabase
    .from("ecosystem_tasks")
    .select("id, task_number, code, name, status, priority, planned_date, block, department, progress")
    .eq("id", taskId).single();

  if (!task) {
    const msgId = await renderScreen(chatId, session,
      `⚠️ Задача не найдена.`,
      kb([[{ text: "📌 Задачи", callback_data: "nav:tasks" }, { text: "🏠 В меню", callback_data: "nav:home" }]]));
    await setSession(chatId, "IDLE", {}, msgId);
    return;
  }

  const text = [
    `📍 STSphera › Задача`,
    `───────────────────────────`,
    `${taskPriorityIcon(task.priority)} <b>${task.code || task.task_number}</b>`,
    `${task.name}`,
    ``,
    `Статус: ${statusLabel(task.status)}`,
    `Приоритет: ${priorityLabel(task.priority)}`,
    task.block ? `Блок: ${task.block}` : "",
    task.department ? `Отдел: ${task.department}` : "",
    task.planned_date ? `📅 Срок: ${task.planned_date}` : "",
    task.progress !== null && task.progress !== undefined ? `Прогресс: ${task.progress}%` : "",
  ].filter(Boolean).join("\n");

  const buttons: { text: string; callback_data: string }[][] = [];
  if (task.status === "Ожидание") {
    buttons.push([{ text: "🔧 Взять в работу", callback_data: `task:start:${shortId(task.id)}` }]);
  }
  if (task.status === "В работе") {
    buttons.push([{ text: "✅ Завершить", callback_data: `task:done:${shortId(task.id)}` }]);
  }
  buttons.push([{ text: "📌 Задачи", callback_data: "nav:tasks" }, { text: "🏠 В меню", callback_data: "nav:home" }]);

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "IDLE", {}, msgId);
}

async function handleTaskStatusChange(chatId: number, session: Session | null, user: UserProfile, taskShortId: string, newStatus: string) {
  const { data: task } = await supabase
    .from("ecosystem_tasks")
    .select("id, code, name, task_number")
    .ilike("id", `${taskShortId}%`).limit(1).single();

  if (!task) {
    const msgId = await renderScreen(chatId, session,
      `⚠️ Задача не найдена.`,
      kb([[{ text: "📌 Задачи", callback_data: "nav:tasks" }, { text: "🏠 В меню", callback_data: "nav:home" }]]));
    await setSession(chatId, "IDLE", {}, msgId);
    return;
  }

  await supabase.from("ecosystem_tasks")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", task.id);

  const emoji = newStatus === "В работе" ? "🔧" : "✅";
  const text = [
    `📍 STSphera · Задача обновлена`,
    `───────────────────────────`,
    `${emoji} <b>${task.code || task.task_number}</b> · ${task.name}`,
    `Статус: <b>${newStatus}</b>`,
  ].join("\n");

  await audit(chatId, user.user_id, "task.status", { task_id: task.id, status: newStatus });

  const msgId = await renderScreen(chatId, session, text,
    kb([[{ text: "📌 Задачи", callback_data: "nav:tasks" }, { text: "🏠 В меню", callback_data: "nav:home" }]]));
  await setSession(chatId, "IDLE", {}, msgId);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 8: showApprovals, showApprovalDetail, handleApproveReject
// ═══════════════════════════════════════════════════════════════

async function showApprovals(chatId: number, session: Session | null, user: UserProfile, projectId?: string) {
  let query = supabase.from("approvals")
    .select("id, title, type, level, status, project_id, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(10);

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data: approvals } = await query;

  if (!approvals || approvals.length === 0) {
    const msgId = await renderScreen(chatId, session,
      `📍 STSphera › Согласования\n───────────────────────────\n✨ Нет ожидающих согласований.`,
      kb([[{ text: "🏠 В меню", callback_data: "nav:home" }]]));
    await setSession(chatId, "IDLE", {}, msgId);
    return;
  }

  let text = `📍 STSphera › Согласования (${approvals.length})\n───────────────────────────\n`;
  for (let i = 0; i < approvals.length; i++) {
    const a = approvals[i];
    const date = new Date(a.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    const typeLabel = a.type || "—";
    text += `\n${i + 1}. 📝 <b>${a.title}</b>\n   ${typeLabel} · Уровень ${a.level || 1} · ${date}`;
  }

  const buttons: { text: string; callback_data: string }[][] = approvals.slice(0, 5).map((a: any) => [
    { text: `👁 ${a.title.slice(0, 25)}`, callback_data: `approve:detail:${shortId(a.id)}` },
  ]);
  buttons.push([{ text: "🏠 В меню", callback_data: "nav:home" }]);

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "IDLE", {}, msgId);
}

async function showApprovalDetail(chatId: number, session: Session | null, approvalShortId: string) {
  const { data: approval } = await supabase
    .from("approvals")
    .select("id, title, description, type, level, status, project_id, created_at, entity_id")
    .ilike("id", `${approvalShortId}%`).limit(1).single();

  if (!approval) {
    const msgId = await renderScreen(chatId, session,
      `⚠️ Согласование не найдено.`,
      kb([[{ text: "📝 Согласования", callback_data: "nav:approvals" }, { text: "🏠 В меню", callback_data: "nav:home" }]]));
    await setSession(chatId, "IDLE", {}, msgId);
    return;
  }

  // Get project name
  let projectName = "—";
  if (approval.project_id) {
    const { data: proj } = await supabase.from("projects").select("name").eq("id", approval.project_id).single();
    projectName = proj?.name || "—";
  }

  const date = new Date(approval.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

  const text = [
    `📍 STSphera › Согласование`,
    `───────────────────────────`,
    `📝 <b>${approval.title}</b>`,
    ``,
    approval.description ? `${approval.description}` : "",
    ``,
    `Тип: ${approval.type || "—"}`,
    `Уровень: ${approval.level || 1}`,
    `Объект: ${projectName}`,
    `Дата: ${date}`,
    `Статус: ${approval.status}`,
  ].filter(Boolean).join("\n");

  const buttons: { text: string; callback_data: string }[][] = [];
  if (approval.status === "pending") {
    buttons.push([
      { text: "✅ Утвердить", callback_data: `approve:yes:${shortId(approval.id)}` },
      { text: "❌ Отклонить", callback_data: `approve:no:${shortId(approval.id)}` },
    ]);
  }
  buttons.push([{ text: "📝 Согласования", callback_data: "nav:approvals" }, { text: "🏠 В меню", callback_data: "nav:home" }]);

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "APPROVAL_DETAIL", { approval_id: approval.id }, msgId);
}

async function handleApproveReject(chatId: number, session: Session | null, user: UserProfile, approvalShortId: string, decision: "approved" | "rejected") {
  const { data: approval } = await supabase
    .from("approvals")
    .select("id, title")
    .ilike("id", `${approvalShortId}%`).limit(1).single();

  if (!approval) {
    const msgId = await renderScreen(chatId, session,
      `⚠️ Согласование не найдено.`,
      kb([[{ text: "📝 Согласования", callback_data: "nav:approvals" }, { text: "🏠 В меню", callback_data: "nav:home" }]]));
    await setSession(chatId, "IDLE", {}, msgId);
    return;
  }

  await supabase.from("approvals").update({
    status: decision,
    decided_at: new Date().toISOString(),
    decision_comment: decision === "rejected" ? "Отклонено через бот" : null,
  }).eq("id", approval.id);

  const emoji = decision === "approved" ? "✅" : "❌";
  const label = decision === "approved" ? "утверждено" : "отклонено";

  await audit(chatId, user.user_id, "approval.decide", { approval_id: approval.id, decision });

  const text = [
    `📍 STSphera · Согласование ${label}`,
    `───────────────────────────`,
    `${emoji} <b>${approval.title}</b>`,
    `Решение: ${label}`,
  ].join("\n");

  const msgId = await renderScreen(chatId, session, text,
    kb([[{ text: "📝 Согласования", callback_data: "nav:approvals" }, { text: "🏠 В меню", callback_data: "nav:home" }]]));
  await setSession(chatId, "IDLE", {}, msgId);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 9: showCalendar, showSupply, showCrews, showStatus,
//            showError, showNotLinked
// ═══════════════════════════════════════════════════════════════

async function showCalendar(chatId: number, session: Session | null, user: UserProfile, projectId: string) {
  const today = new Date();
  const weekLater = new Date(today.getTime() + 7 * 86400000);
  const todayStr = today.toISOString().split("T")[0];
  const weekStr = weekLater.toISOString().split("T")[0];

  const [projRes, eventsRes] = await Promise.all([
    supabase.from("projects").select("name").eq("id", projectId).single(),
    supabase.from("calendar_events")
      .select("id, title, date, type, priority, is_done")
      .eq("project_id", projectId)
      .gte("date", todayStr)
      .lte("date", weekStr)
      .order("date", { ascending: true })
      .limit(15),
  ]);

  const projectName = projRes.data?.name || "Объект";
  const events = eventsRes.data || [];

  let text = `📍 ${projectName} › Календарь\n───────────────────────────\n📅 Ближайшие 7 дней\n\n`;

  if (events.length === 0) {
    text += `✨ Нет запланированных событий.`;
  } else {
    for (const e of events) {
      const done = e.is_done ? "✅" : "⬜";
      const date = new Date(e.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short", weekday: "short" });
      const priIcon = ({ critical: "🔴", high: "🟠", medium: "🟡", low: "⚪" } as Record<string, string>)[e.priority] || "⚪";
      const typeLabel = e.type ? ` · ${e.type}` : "";
      text += `${done} ${priIcon} <b>${date}</b> ${e.title}${typeLabel}\n`;
    }
  }

  const buttons: { text: string; callback_data?: string; url?: string }[][] = [
    [{ text: "📊 Дашборд", callback_data: `dash:view:${shortId(projectId)}` }],
    [{ text: "🏠 В меню", callback_data: "nav:home" }],
    [{ text: "🚀 Открыть", url: `${MINI_APP_URL}?project=${projectId}&tab=calendar` }],
  ];

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "PROJECT_SELECTED", { project_id: projectId }, msgId);
}

async function showSupply(chatId: number, session: Session | null, user: UserProfile, projectId: string) {
  const [projRes, matsRes] = await Promise.all([
    supabase.from("projects").select("name").eq("id", projectId).single(),
    supabase.from("materials").select("name, status, deficit, unit, eta")
      .eq("project_id", projectId).order("deficit", { ascending: false }).limit(15),
  ]);

  const projectName = projRes.data?.name || "Объект";
  const mats = matsRes.data || [];
  const okCount = mats.filter((m: any) => Number(m.deficit) <= 0).length;
  const deficitMats = mats.filter((m: any) => Number(m.deficit) > 0);
  const transitCount = mats.filter((m: any) => m.status === "ordered" || m.status === "shipped").length;

  let text = [
    `📍 ${projectName} › Снабжение`,
    `───────────────────────────`,
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

  const buttons: { text: string; callback_data?: string; url?: string }[][] = [
    [{ text: "📊 Дашборд", callback_data: `dash:view:${shortId(projectId)}` }],
    [{ text: "🏠 В меню", callback_data: "nav:home" }],
    [{ text: "🚀 Открыть", url: `${MINI_APP_URL}?project=${projectId}&tab=supply` }],
  ];

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "PROJECT_SELECTED", { project_id: projectId }, msgId);
}

async function showCrews(chatId: number, session: Session | null, user: UserProfile, projectId: string) {
  const [projRes, crewsRes] = await Promise.all([
    supabase.from("projects").select("name").eq("id", projectId).single(),
    supabase.from("crews").select("name, headcount, specialization, foreman_name")
      .eq("project_id", projectId).eq("is_active", true).order("name"),
  ]);

  const projectName = projRes.data?.name || "Объект";
  const crews = crewsRes.data || [];
  const total = crews.reduce((s: number, c: any) => s + (c.headcount || 0), 0);

  let text = `📍 ${projectName} › Бригады\n───────────────────────────\n👷 ${crews.length} бригад · ${total} чел.\n\n`;
  for (const c of crews.slice(0, 5)) {
    text += `🔹 <b>${c.name}</b> — ${c.headcount} чел.`;
    if (c.specialization) text += `\n   <i>${c.specialization}</i>`;
    if (c.foreman_name) text += `\n   Прораб: ${c.foreman_name}`;
    text += "\n\n";
  }

  const buttons: { text: string; callback_data?: string; url?: string }[][] = [
    [{ text: "📊 Дашборд", callback_data: `dash:view:${shortId(projectId)}` }],
    [{ text: "🏠 В меню", callback_data: "nav:home" }],
  ];

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "PROJECT_SELECTED", { project_id: projectId }, msgId);
}

async function showStatus(chatId: number, session: Session | null, message: string, projectId: string) {
  const text = `📍 STSphera · Готово\n───────────────────────────\n${message}`;
  const buttons = [
    [{ text: "📊 Дашборд", callback_data: `dash:view:${shortId(projectId)}` }, { text: "🏠 В меню", callback_data: "nav:home" }],
  ];
  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "IDLE", { project_id: projectId }, msgId);
}

async function showError(chatId: number, session: Session | null, errorMsg: string) {
  const text = [
    `📍 STSphera · Ошибка`,
    `───────────────────────────`,
    `⚠️ ${errorMsg}`,
    ``,
    `Попробуйте ещё раз или`,
    `откройте приложение.`,
  ].join("\n");

  const buttons: { text: string; callback_data?: string; url?: string }[][] = [
    [{ text: "🔄 Повторить", callback_data: "nav:home" }, { text: "🏠 В меню", callback_data: "nav:home" }],
    [{ text: "🚀 Открыть приложение", url: MINI_APP_URL }],
  ];

  const msgId = await renderScreen(chatId, session, text, kb(buttons));
  await setSession(chatId, "IDLE", {}, msgId);
}

async function showNotLinked(chatId: number, session: Session | null) {
  const text = [
    `📍 STSphera · Привязка аккаунта`,
    `───────────────────────────`,
    `⚠️ Ваш аккаунт не привязан.`,
    ``,
    `Откройте приложение и укажите`,
    `Chat ID в настройках профиля:`,
    ``,
    `🆔 Ваш Chat ID: <code>${chatId}</code>`,
  ].join("\n");

  const msgId = await sendMessage(chatId, text,
    kb([[{ text: "🚀 Открыть приложение", url: MINI_APP_URL }]]));
  if (msgId) await setSession(chatId, "IDLE", {}, msgId);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 10: resolveProjectId, AI chat, handleCallback,
//             handleMessage
// ═══════════════════════════════════════════════════════════════

async function resolveProjectId(shortPid: string, _userId: string): Promise<string | null> {
  const { data } = await supabase.from("projects").select("id")
    .eq("status", "active").ilike("id", `${shortPid}%`).limit(1).single();
  return data?.id ?? null;
}

// ─── AI Chat ─────────────────────────────────────────────────
async function handleAIChat(chatId: number, session: Session | null, user: UserProfile | null, text: string) {
  if (!LOVABLE_API_KEY) {
    await sendMessage(chatId, "⚠️ AI-ассистент временно недоступен.");
    return;
  }

  let contextNote = "";
  if (user) {
    const roles = await getUserRoles(user.user_id);
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
            content: `Ты — AI-ассистент строительной платформы STSphera. Отвечай кратко, по делу, на русском.${contextNote}`,
          },
          { role: "user", content: text },
        ],
        stream: false,
      }),
    });

    if (response.status === 429) {
      await sendMessage(chatId, "⏳ Слишком много запросов к AI. Попробуйте через минуту.");
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
    console.error("[ai] error:", err);
    await sendMessage(chatId, "⚠️ Ошибка при обращении к AI.");
  }
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
    // ── nav: namespace ──
    if (ns === "nav") {
      if (action === "home") return await showHub(chatId, session, user, roles);
      if (action === "dashboard") return await showProjectSelect(chatId, session, user, "dashboard");
      if (action === "alerts") return await showProjectSelect(chatId, session, user, "alerts");
      if (action === "supply") return await showProjectSelect(chatId, session, user, "supply");
      if (action === "report") {
        if (!canAccess(roles, "report")) return await showError(chatId, session, "У вас нет доступа к отчётам.");
        return await showProjectSelect(chatId, session, user, "report");
      }
      if (action === "portfolio") {
        if (!canAccess(roles, "portfolio")) return await showError(chatId, session, "У вас нет доступа к этому разделу.");
        return await showPortfolio(chatId, session, user);
      }
      if (action === "tasks") return await showTasks(chatId, session, user);
      if (action === "approvals") return await showApprovals(chatId, session, user);
      if (action === "calendar") return await showProjectSelect(chatId, session, user, "calendar");
      if (action === "crews") return await showProjectSelect(chatId, session, user, "crews");
      if (action === "back") return await showHub(chatId, session, user, roles);
    }

    // ── dash: namespace ──
    if (ns === "dash" && action === "view") {
      const pid = await resolveProjectId(params[0], user.user_id);
      if (!pid) return await showError(chatId, session, "Объект не найден.");
      return await showDashboard(chatId, session, user, pid);
    }

    // ── proj: namespace ──
    if (ns === "proj" && action === "select") {
      const pid = await resolveProjectId(params[0], user.user_id);
      const nextAction = params[1] || "dashboard";
      if (!pid) return await showError(chatId, session, "Объект не найден.");
      return await routeToAction(chatId, session, user, nextAction, pid);
    }

    // ── alert: namespace ──
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

    // ── report: namespace ──
    if (ns === "report") {
      if (action === "zone") {
        const zoneName = params.join(":");
        return await reportWorks(chatId, session, zoneName);
      }
      if (action === "confirm") {
        return await reportSave(chatId, session, user);
      }
      if (action === "cancel") {
        await clearSession(chatId);
        return await showHub(chatId, session, user, roles);
      }
    }

    // ── task: namespace ──
    if (ns === "task") {
      if (action === "start") {
        return await handleTaskStatusChange(chatId, session, user, params[0], "В работе");
      }
      if (action === "done") {
        return await handleTaskStatusChange(chatId, session, user, params[0], "Готово");
      }
      if (action === "detail") {
        const { data: t } = await supabase.from("ecosystem_tasks").select("id").ilike("id", `${params[0]}%`).limit(1).single();
        if (t) return await showTaskDetail(chatId, session, t.id);
        return await showError(chatId, session, "Задача не найдена.");
      }
    }

    // ── approve: namespace ──
    if (ns === "approve") {
      if (action === "detail") {
        return await showApprovalDetail(chatId, session, params[0]);
      }
      if (action === "yes") {
        return await handleApproveReject(chatId, session, user, params[0], "approved");
      }
      if (action === "no") {
        return await handleApproveReject(chatId, session, user, params[0], "rejected");
      }
    }

    // ── supply: namespace ──
    if (ns === "supply" && action === "view") {
      const pid = await resolveProjectId(params[0], user.user_id);
      if (!pid) return await showError(chatId, session, "Объект не найден.");
      return await showSupply(chatId, session, user, pid);
    }

    // ── crew: namespace ──
    if (ns === "crew" && action === "view") {
      const pid = await resolveProjectId(params[0], user.user_id);
      if (!pid) return await showError(chatId, session, "Объект не найден.");
      return await showCrews(chatId, session, user, pid);
    }

    // ── cal: namespace ──
    if (ns === "cal" && action === "view") {
      const pid = await resolveProjectId(params[0], user.user_id);
      if (!pid) return await showError(chatId, session, "Объект не найден.");
      return await showCalendar(chatId, session, user, pid);
    }

    console.log(`[bot] unknown callback: ${cbData}`);
  } catch (err) {
    console.error(`[bot] callback error:`, err);
    await audit(chatId, user.user_id, `callback.error`, { data: cbData }, "error", Date.now() - start);
    await showError(chatId, session, "Произошла ошибка. Попробуйте позже.");
  }
}

// ─── MESSAGE ROUTER ──────────────────────────────────────────
async function handleMessage(chatId: number, text: string, firstName: string) {
  const start = Date.now();
  const session = await getSession(chatId);
  const user = await getUserByChatId(chatId);

  // ── /start with deep links ──
  if (text.startsWith("/start")) {
    const param = text.split(" ")[1];

    if (param) {
      // Deep link: project
      if (param.startsWith("project_")) {
        const projectId = param.replace("project_", "");
        if (!user) return await showNotLinked(chatId, session);
        return await showDashboard(chatId, session, user, projectId);
      }
      // Deep link: report for project
      if (param.startsWith("report_")) {
        const projectId = param.replace("report_", "");
        if (!user) return await showNotLinked(chatId, session);
        return await reportSelectZone(chatId, session, user, projectId);
      }
      // Deep link: approval detail
      if (param.startsWith("approval_")) {
        const approvalId = param.replace("approval_", "");
        return await showApprovalDetail(chatId, session, approvalId);
      }
      // Deep link: approvals list
      if (param === "approvals") {
        if (!user) return await showNotLinked(chatId, session);
        return await showApprovals(chatId, session, user);
      }
    }

    // Default /start — show hub
    if (!user) return await showNotLinked(chatId, session);
    const roles = await getUserRoles(user.user_id);
    return await showHub(chatId, session, user, roles);
  }

  // ── Commands ──
  if (text === "/menu" || text === "/cancel") {
    if (!user) return await showNotLinked(chatId, session);
    await clearSession(chatId);
    const roles = await getUserRoles(user.user_id);
    return await showHub(chatId, session, user, roles);
  }

  if (text === "/myid") {
    await sendMessage(chatId,
      `🆔 Ваш Chat ID: <code>${chatId}</code>\n\nСкопируйте и вставьте в настройки профиля STSphera.`);
    return;
  }

  if (text === "/tasks") {
    if (!user) return await showNotLinked(chatId, session);
    return await showTasks(chatId, session, user);
  }

  if (text === "/approvals") {
    if (!user) return await showNotLinked(chatId, session);
    return await showApprovals(chatId, session, user);
  }

  if (text === "/help") {
    await sendMessage(chatId, [
      `📍 <b>STSphera Bot · Справка</b>`,
      `───────────────────────────`,
      ``,
      `/start — Главное меню`,
      `/myid — Узнать Chat ID`,
      `/tasks — Мои задачи`,
      `/approvals — Согласования`,
      `/help — Эта справка`,
      ``,
      `<b>Deep links:</b>`,
      `<code>?start=project_{id}</code> — Проект`,
      `<code>?start=report_{id}</code> — Отчёт`,
      `<code>?start=approval_{id}</code> — Согласование`,
      `<code>?start=approvals</code> — Все согласования`,
      ``,
      `Или просто напишите вопрос — AI-ассистент ответит.`,
    ].join("\n"));
    return;
  }

  // Shortcuts
  if (text === "/d" || text === "/dashboard") {
    if (!user) return await showNotLinked(chatId, session);
    return await showProjectSelect(chatId, session, user, "dashboard");
  }
  if (text === "/a" || text === "/alerts") {
    if (!user) return await showNotLinked(chatId, session);
    return await showProjectSelect(chatId, session, user, "alerts");
  }
  if (text === "/r" || text === "/report") {
    if (!user) return await showNotLinked(chatId, session);
    const roles = await getUserRoles(user.user_id);
    if (!canAccess(roles, "report")) return await showError(chatId, session, "У вас нет доступа к отчётам.");
    return await showProjectSelect(chatId, session, user, "report");
  }
  if (text === "/p" || text === "/portfolio") {
    if (!user) return await showNotLinked(chatId, session);
    const roles = await getUserRoles(user.user_id);
    if (!canAccess(roles, "portfolio")) return await showError(chatId, session, "У вас нет доступа к портфелю.");
    return await showPortfolio(chatId, session, user);
  }
  if (text === "/calendar") {
    if (!user) return await showNotLinked(chatId, session);
    return await showProjectSelect(chatId, session, user, "calendar");
  }

  // ── FSM state handlers for text input ──
  if (!user) return await showNotLinked(chatId, session);

  if (session?.state === "ALERT_STEP1") {
    const title = text.trim().slice(0, 100);
    if (!title) { await sendMessage(chatId, "⚠️ Введите название алерта."); return; }
    return await alertStep2(chatId, session, session.context.project_id as string, title);
  }

  if (session?.state === "REPORT_WORKS") {
    const works = text.trim();
    if (!works) { await sendMessage(chatId, "⚠️ Опишите выполненные работы."); return; }
    await setSession(chatId, "REPORT_VOLUME", { works });
    return await reportVolume(chatId, await getSession(chatId));
  }

  if (session?.state === "REPORT_VOLUME") {
    const volume = text.trim();
    if (!volume) { await sendMessage(chatId, "⚠️ Введите объём."); return; }
    await setSession(chatId, "REPORT_WORKERS", { volume });
    return await reportWorkers(chatId, await getSession(chatId));
  }

  if (session?.state === "REPORT_WORKERS") {
    const workers = text.trim();
    if (!workers) { await sendMessage(chatId, "⚠️ Введите количество рабочих."); return; }
    await setSession(chatId, "REPORT_ISSUES", { workers });
    return await reportIssues(chatId, await getSession(chatId));
  }

  if (session?.state === "REPORT_ISSUES") {
    const issues = text.trim().toLowerCase() === "нет" ? null : text.trim();
    await setSession(chatId, "REPORT_CONFIRM", { issues });
    return await reportConfirm(chatId, await getSession(chatId), issues);
  }

  if (session?.state === "REPORT_NOTES") {
    const ctx = session.context;
    const today = new Date().toISOString().split("T")[0];
    const factValue = parseFloat(String(ctx.fact_value)) || 0;
    const { error } = await supabase.from("plan_fact").insert({
      project_id: ctx.project_id, date: today,
      week_number: getWeekNumber(new Date()),
      fact_value: factValue, plan_value: 0, notes: text,
    });
    if (error) return await showError(chatId, session, "Ошибка сохранения отчёта.");
    await audit(chatId, user.user_id, "report.submit", { project_id: ctx.project_id, notes: text }, "success", Date.now() - start);
    return await showStatus(chatId, session, `✅ Отчёт сохранён\n\n📅 ${today}\n📝 ${text}`, ctx.project_id as string);
  }

  // ── Default: AI chat for IDLE state ──
  if (!session || session.state === "IDLE") {
    return await handleAIChat(chatId, session, user, text);
  }

  // Unknown state — show hub
  const roles = await getUserRoles(user.user_id);
  return await showHub(chatId, session, user, roles);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 11: Deno.serve webhook entry point
// ═══════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("OK", { status: 200 });

  try {
    const update = await req.json();

    if (update.message?.text) {
      const msg = update.message;
      const chatId = msg.chat.id;

      // Rate limit check
      if (!checkRateLimit(chatId)) {
        await sendMessage(chatId, "⏳ Слишком много запросов. Подождите минуту.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      await handleMessage(chatId, msg.text.trim(), msg.from?.first_name || "Пользователь");
    } else if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.from.id;

      if (!checkRateLimit(chatId)) {
        await answerCb(cq.id, "⏳ Подождите минуту");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const session = await getSession(chatId);
      await handleCallback(chatId, cq.data || "", cq.id, session);
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
