// ═══════════════════════════════════════════════════════════════
// STSphera Telegram Bot v2.0
// Архитектура: FSM + editMessage + RBAC + AuditLog
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── ENV ──────────────────────────────────────────────────────
const BOT_TOKEN  = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const APP_URL    = Deno.env.get("MINI_APP_URL") || "https://id-preview--fe942628-85b8-4407-a858-132ee496d745.lovable.app";
const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const db = createClient(SB_URL, SB_KEY);
const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ── FSM States ───────────────────────────────────────────────
type State =
  | "IDLE"
  | "ALERT_STEP1"
  | "ALERT_STEP2"
  | "ALERT_CONFIRM"
  | "REPORT_STEP1"
  | "REPORT_STEP2";

// ── Context ──────────────────────────────────────────────────
interface Ctx {
  project_id?:   string;
  project_name?: string;
  message_id?:   number;
  step?:         number;
  draft?: {
    title?:    string;
    priority?: string;
    fact?:     number;
    notes?:    string;
  };
}

// ── User profile ─────────────────────────────────────────────
interface BotUser {
  user_id:       string;
  display_name:  string;
  role:          string;
  roles:         string[];
}

// ── RBAC map ─────────────────────────────────────────────────
const ROLE_PERMISSIONS: Record<string, Set<string>> = {
  director:   new Set(["dashboard","alerts_view","supply","portfolio","settings"]),
  pm:         new Set(["dashboard","alerts_view","alerts_create","supply","settings"]),
  foreman:    new Set(["dashboard","alerts_view","alerts_create","report"]),
  foreman1:   new Set(["dashboard","alerts_view","alerts_create","report"]),
  foreman2:   new Set(["dashboard","alerts_view","alerts_create","report"]),
  foreman3:   new Set(["dashboard","alerts_view","alerts_create","report"]),
  supply:     new Set(["dashboard","supply","settings"]),
  pto:        new Set(["dashboard","alerts_view"]),
  inspector:  new Set(["dashboard","alerts_view"]),
  production: new Set(["dashboard","alerts_view","report"]),
};

function can(user: BotUser, perm: string): boolean {
  for (const role of user.roles) {
    if (ROLE_PERMISSIONS[role]?.has(perm)) return true;
  }
  return false;
}

// ── Telegram API ─────────────────────────────────────────────
async function tgCall(method: string, body: Record<string, unknown>) {
  const r = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await r.json();
}

function kb(rows: Array<Array<{ text: string; callback_data?: string; url?: string }>>) {
  return {
    inline_keyboard: rows.map(row =>
      row.map(b => b.url
        ? { text: b.text, url: b.url }
        : { text: b.text, callback_data: b.callback_data }
      )
    ),
  };
}

async function sendNew(chatId: number, text: string, replyMarkup?: Record<string, unknown>): Promise<number> {
  const res = await tgCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
  return res.result?.message_id ?? 0;
}

async function editMsg(chatId: number, msgId: number, text: string, replyMarkup?: Record<string, unknown>): Promise<boolean> {
  const res = await tgCall("editMessageText", {
    chat_id: chatId,
    message_id: msgId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
  return res.ok;
}

async function removeKeyboard(chatId: number, msgId: number) {
  await tgCall("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: msgId,
    reply_markup: { inline_keyboard: [] },
  });
}

async function answerCB(id: string, text?: string) {
  await tgCall("answerCallbackQuery", { callback_query_id: id, text });
}

// ── Session management ───────────────────────────────────────
async function getSession(chatId: number): Promise<{ state: State; context: Ctx } | null> {
  const { data } = await db
    .from("bot_sessions")
    .select("state, context")
    .eq("chat_id", String(chatId))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data ? { state: data.state as State, context: data.context as Ctx } : null;
}

async function saveSession(chatId: number, state: State, context: Ctx, userId?: string) {
  await db.from("bot_sessions").upsert({
    chat_id:    String(chatId),
    state,
    context,
    user_id:    userId,
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7200000).toISOString(),
  }, { onConflict: "chat_id" });
}

async function clearSession(chatId: number) {
  await db.from("bot_sessions").upsert({
    chat_id:    String(chatId),
    state:      "IDLE",
    context:    {},
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7200000).toISOString(),
  }, { onConflict: "chat_id" });
}

// ── Audit log ────────────────────────────────────────────────
async function audit(
  chatId: number,
  userId: string | null,
  action: string,
  payload: Record<string, unknown> = {},
  result: string = "success",
  _errorMsg?: string,
  durationMs?: number
) {
  await db.from("bot_audit_log").insert({
    chat_id:     String(chatId),
    user_id:     userId,
    action,
    payload,
    result,
    duration_ms: durationMs,
    created_at:  new Date().toISOString(),
  }).then(() => {});
}

// ── User lookup ───────────────────────────────────────────────
async function getUser(chatId: number): Promise<BotUser | null> {
  const { data: profile } = await db
    .from("profiles")
    .select("user_id, display_name")
    .eq("telegram_chat_id", String(chatId))
    .maybeSingle();

  if (!profile) return null;

  const { data: rolesData } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", profile.user_id);

  const roles = (rolesData || []).map((r: any) => r.role);
  return {
    user_id:      profile.user_id,
    display_name: profile.display_name || "Пользователь",
    role:         roles[0] || "viewer",
    roles:        roles.length > 0 ? roles : ["viewer"],
  };
}

// ── Projects ──────────────────────────────────────────────────
async function getProjects(_userId: string) {
  const { data } = await db
    .from("portfolio_stats")
    .select("project_id, project_name, project_code, progress_pct, open_alerts, critical_alerts, deficit_materials, days_until_deadline")
    .order("project_name");
  return data || [];
}

async function getSingleProject(projectId: string) {
  const { data } = await db
    .from("portfolio_stats")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  return data;
}

// ── Утилиты ──────────────────────────────────────────────────
function progressBar(pct: number): string {
  const filled = Math.round(Math.min(pct, 100) / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function deadlineStatus(days: number | null): string {
  if (days === null) return "";
  if (days < 0)   return `🔴 Просрочка ${Math.abs(days)} дн.`;
  if (days < 10)  return `🔴 ${days} дн.`;
  if (days < 30)  return `⚠️ ${days} дн.`;
  return `✅ ${days} дн.`;
}

function projectEmoji(pct: number): string {
  if (pct >= 70) return "🟢";
  if (pct >= 40) return "🟡";
  return "🔴";
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    director:   "Директор",
    pm:         "Рук. проекта",
    foreman:    "Прораб",
    foreman1:   "Прораб Ф1",
    foreman2:   "Прораб Ф2",
    foreman3:   "Прораб Ф3",
    supply:     "Снабжение",
    pto:        "ПТО",
    inspector:  "Технадзор",
    production: "Производство",
  };
  return map[role] || role;
}

function priorityLabel(p: string): string {
  return ({ critical: "🔴 Критичный", high: "🟠 Высокий", medium: "🟡 Средний", low: "⚪ Низкий" } as Record<string, string>)[p] || p;
}

function fmtNum(n: number) { return n?.toLocaleString("ru") ?? "0"; }
function sep() { return "─".repeat(29); }

// ── ЭКРАНЫ ───────────────────────────────────────────────────

function screenHub(user: BotUser, _ctx: Ctx): [string, Record<string, unknown>] {
  const now = new Date();
  const time = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const day = now.toLocaleDateString("ru-RU", { weekday: "long" });

  const text =
    `📍 <b>STSphera</b> · ${user.display_name}\n` +
    `Роль: ${roleLabel(user.role)}\n` +
    `${sep()}\n` +
    `⏰ ${time} · ${day}\n\n` +
    `Выберите раздел:`;

  const rows: Array<Array<{ text: string; callback_data: string }>> = [];

  const row1: Array<{ text: string; callback_data: string }> = [];
  if (can(user, "portfolio")) {
    row1.push({ text: "📁 Портфель", callback_data: "nav:portfolio" });
  } else {
    row1.push({ text: "📊 Мой объект", callback_data: "nav:dashboard" });
  }
  if (can(user, "alerts_view")) {
    row1.push({ text: "🔔 Алерты", callback_data: "nav:alerts" });
  }
  rows.push(row1);

  const row2: Array<{ text: string; callback_data: string }> = [];
  if (can(user, "supply")) {
    row2.push({ text: "📦 Снабжение", callback_data: "nav:supply" });
  }
  if (can(user, "report")) {
    row2.push({ text: "📋 Отчёт", callback_data: "nav:report" });
  }
  if (row2.length > 0) rows.push(row2);

  if (can(user, "settings")) {
    rows.push([{ text: "⚙️ Настройки", callback_data: "nav:settings" }]);
  }

  return [text, kb(rows)];
}

function screenProjectSelect(projects: any[]): [string, Record<string, unknown>] {
  const text =
    `📍 <b>STSphera › Выбор объекта</b>\n` +
    `${sep()}\n` +
    `Выберите объект:`;

  const rows = projects.slice(0, 5).map(p => [{
    text: `${projectEmoji(p.progress_pct)} ${p.project_name.slice(0, 22)}  ·  ${p.progress_pct}%`,
    callback_data: `dash:view:${p.project_id}`,
  }]);
  rows.push([{ text: "← Назад", callback_data: "nav:home" }]);

  return [text, kb(rows)];
}

function screenDashboard(project: any, user: BotUser): [string, Record<string, unknown>] {
  const pct   = project.progress_pct ?? 0;
  const plan  = fmtNum(Number(project.total_plan));
  const fact  = fmtNum(Number(project.total_fact));
  const dlStr = deadlineStatus(project.days_until_deadline);

  let text =
    `📍 <b>${project.project_name}</b> › Дашборд\n`;
  if (project.project_code) text += `<code>${project.project_code}</code>\n`;
  text +=
    `${sep()}\n` +
    `${progressBar(pct)} <b>${pct}%</b>\n` +
    `План ${plan} · Факт ${fact}\n`;
  if (dlStr) text += `\n📅 ${dlStr}\n`;
  if (project.open_alerts > 0) {
    text += `🔔 Алертов: <b>${project.open_alerts}</b>`;
    if (project.critical_alerts > 0) text += `  (🔴 ${project.critical_alerts} крит.)`;
    text += "\n";
  }
  if (project.deficit_materials > 0) {
    text += `📦 Дефицит: <b>${project.deficit_materials}</b> позиций\n`;
  }

  const rows: any[] = [];
  const r1: any[] = [];
  if (can(user, "alerts_view"))   r1.push({ text: "🔔 Алерты", callback_data: `alert:list:${project.project_id}` });
  if (can(user, "supply"))        r1.push({ text: "📦 Снабжение", callback_data: `supply:view:${project.project_id}` });
  if (r1.length) rows.push(r1);

  const r2: any[] = [];
  if (can(user, "report"))        r2.push({ text: "📋 Отчёт", callback_data: `report:start:${project.project_id}` });
  r2.push({ text: "📊 Открыть", url: `${APP_URL}?project=${project.project_id}&tab=dashboard` });
  rows.push(r2);

  rows.push([{ text: "← Назад", callback_data: "nav:home" }]);

  return [text, kb(rows)];
}

async function screenAlertList(projectId: string, projectName: string, user: BotUser): Promise<[string, Record<string, unknown>]> {
  const { data: alerts } = await db
    .from("alerts")
    .select("id, title, priority, created_at")
    .eq("project_id", projectId)
    .eq("is_resolved", false)
    .order("created_at", { ascending: false })
    .limit(10);

  const list = alerts || [];
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const a of list) {
    if (a.priority in counts) counts[a.priority as keyof typeof counts]++;
  }

  let text =
    `📍 <b>${projectName} › Алерты</b>\n` +
    `${sep()}\n` +
    `Открытых: <b>${list.length}</b>\n\n`;

  if (counts.critical) text += `🔴 Критичных:  ${counts.critical}\n`;
  if (counts.high)     text += `🟠 Высоких:    ${counts.high}\n`;
  if (counts.medium)   text += `🟡 Средних:    ${counts.medium}\n`;

  if (list.length > 0) {
    text += `\nПоследние:\n`;
    for (const a of list.slice(0, 3)) {
      const date = new Date(a.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      text += `• ${a.title.slice(0, 32)}  ·  ${date}\n`;
    }
  } else {
    text += `\n✅ Открытых алертов нет`;
  }

  const rows: any[] = [];
  if (can(user, "alerts_create")) {
    rows.push([
      { text: "➕ Создать", callback_data: `alert:create:${projectId}` },
      { text: "📋 Все", url: `${APP_URL}?project=${projectId}&tab=alerts` },
    ]);
  } else {
    rows.push([{ text: "📋 Все алерты", url: `${APP_URL}?project=${projectId}&tab=alerts` }]);
  }
  rows.push([{ text: "← Назад", callback_data: `dash:view:${projectId}` }]);

  return [text, kb(rows)];
}

function screenAlertStep1(projectName: string): [string, Record<string, unknown>] {
  return [
    `📍 <b>Новый алерт · Шаг 1/3</b>\n` +
    `Объект: ${projectName}\n` +
    `${sep()}\n` +
    `Введите краткое название проблемы:`,
    kb([[{ text: "✕ Отмена", callback_data: "alert:cancel" }]]),
  ];
}

function screenAlertStep2(title: string): [string, Record<string, unknown>] {
  return [
    `📍 <b>Новый алерт · Шаг 2/3</b>\n` +
    `${sep()}\n` +
    `Название: «${title.slice(0, 40)}»\n\n` +
    `Выберите приоритет:`,
    kb([
      [
        { text: "🔴 Критичный", callback_data: "alert:prio:critical" },
        { text: "🟠 Высокий",   callback_data: "alert:prio:high" },
      ],
      [
        { text: "🟡 Средний",   callback_data: "alert:prio:medium" },
        { text: "⚪ Низкий",    callback_data: "alert:prio:low" },
      ],
      [{ text: "✕ Отмена", callback_data: "alert:cancel" }],
    ]),
  ];
}

function screenAlertConfirm(draft: { title?: string; priority?: string }, projectName: string): [string, Record<string, unknown>] {
  return [
    `📍 <b>Новый алерт · Шаг 3/3</b>\n` +
    `${sep()}\n` +
    `Проверьте данные:\n\n` +
    `Название: <b>${draft.title}</b>\n` +
    `Приоритет: ${priorityLabel(draft.priority || "medium")}\n` +
    `Объект: ${projectName}\n` +
    `${sep()}`,
    kb([
      [
        { text: "✅ Создать",   callback_data: "alert:confirm" },
        { text: "✏️ Изменить",  callback_data: "alert:edit" },
      ],
      [{ text: "✕ Отмена", callback_data: "alert:cancel" }],
    ]),
  ];
}

function screenStatus(title: string, detail: string): [string, Record<string, unknown>] {
  const time = new Date().toLocaleString("ru-RU", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  });
  return [
    `📍 <b>STSphera · Готово</b>\n` +
    `${sep()}\n` +
    `✅ ${title}\n\n` +
    `${detail}\n` +
    `\n<code>${time}</code>`,
    kb([
      [
        { text: "📊 Дашборд", callback_data: "nav:dashboard" },
        { text: "🏠 Меню",    callback_data: "nav:home" },
      ],
    ]),
  ];
}

function screenReportStep1(projectName: string): [string, Record<string, unknown>] {
  const date = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  return [
    `📍 <b>Ежедневный отчёт</b> · ${date}\n` +
    `Объект: ${projectName}\n` +
    `${sep()}\n` +
    `Введите выполненный объём\n` +
    `за сегодня (число):`,
    kb([[{ text: "✕ Отмена", callback_data: "report:cancel" }]]),
  ];
}

function screenReportStep2(factValue: number): [string, Record<string, unknown>] {
  return [
    `📍 <b>Ежедневный отчёт · Шаг 2/2</b>\n` +
    `${sep()}\n` +
    `Факт: <b>${factValue} ед.</b>\n\n` +
    `Добавить примечание?`,
    kb([
      [{ text: "✅ Без примечания", callback_data: "report:no_notes" }],
      [{ text: "✏️ Добавить текст", callback_data: "report:add_notes" }],
      [{ text: "✕ Отмена",         callback_data: "report:cancel" }],
    ]),
  ];
}

async function screenSupply(projectId: string, projectName: string): Promise<[string, Record<string, unknown>]> {
  const { data: mats } = await db
    .from("materials")
    .select("name, status, deficit, on_site, total_required, unit, eta, supplier")
    .eq("project_id", projectId)
    .order("deficit", { ascending: false })
    .limit(20);

  const list = mats || [];
  const okCount      = list.filter((m: any) => m.status === "ok" || m.status === "normal").length;
  const deficitItems = list.filter((m: any) => m.deficit > 0);
  const transitItems = list.filter((m: any) => m.status === "ordered" || m.status === "shipped").length;

  let text =
    `📍 <b>${projectName} › Снабжение</b>\n` +
    `${sep()}\n` +
    `✅ Норма:    ${okCount} поз.\n` +
    `🔴 Дефицит: ${deficitItems.length} поз.\n` +
    `🚛 В пути:  ${transitItems} поз.\n`;

  if (deficitItems.length > 0) {
    text += `\nКритичные дефициты:\n`;
    for (const m of deficitItems.slice(0, 3)) {
      const eta = m.eta
        ? new Date(m.eta).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
        : "—";
      text += `• ${(m as any).name.slice(0, 22)}  ·  -${fmtNum(m.deficit)} ${m.unit}  ·  ETA ${eta}\n`;
    }
  }

  return [text, kb([
    [
      { text: "📋 Все материалы", url: `${APP_URL}?project=${projectId}&tab=supply` },
      { text: "🚛 Заказы",        url: `${APP_URL}?project=${projectId}&tab=orders` },
    ],
    [{ text: "← Назад", callback_data: `dash:view:${projectId}` }],
  ])];
}

function screenPortfolio(projects: any[]): [string, Record<string, unknown>] {
  const totalAlerts   = projects.reduce((s: number, p: any) => s + (p.open_alerts || 0), 0);
  const totalCritical = projects.reduce((s: number, p: any) => s + (p.critical_alerts || 0), 0);

  let text =
    `📍 <b>Портфель · ${projects.length} объектов</b>\n` +
    `${sep()}\n`;

  for (const p of projects.slice(0, 6)) {
    const emoji = projectEmoji(p.progress_pct);
    const dl    = p.days_until_deadline !== null
      ? (p.days_until_deadline < 0 ? `🔴просрочка` : `${p.days_until_deadline}д`)
      : "—";
    text += `${emoji} ${p.project_name.slice(0, 18)}  ·  ${p.progress_pct}%  ·  ${dl}\n`;
  }

  text += `\nИтого алертов: <b>${totalAlerts}</b>  Критичных: <b>${totalCritical}</b>`;

  const projButtons = projects.slice(0, 4).map((p: any) => ({
    text: p.project_name.slice(0, 20),
    callback_data: `dash:view:${p.project_id}`,
  }));

  const rows: any[] = [];
  if (projButtons.length >= 2) rows.push(projButtons.slice(0, 2));
  if (projButtons.length >= 4) rows.push(projButtons.slice(2, 4));
  else if (projButtons.length === 3) rows.push([projButtons[2]]);
  rows.push([{ text: "📊 Открыть сводку", url: `${APP_URL}?tab=portfolio` }]);
  rows.push([{ text: "← Назад", callback_data: "nav:home" }]);

  return [text, kb(rows)];
}

function screenError(msg: string): [string, Record<string, unknown>] {
  return [
    `📍 <b>STSphera · Ошибка</b>\n` +
    `${sep()}\n` +
    `⚠️ ${msg}\n\n` +
    `Попробуйте ещё раз или откройте приложение.`,
    kb([
      [
        { text: "🔄 Повторить",  callback_data: "nav:retry" },
        { text: "🏠 В меню",     callback_data: "nav:home" },
      ],
      [{ text: "🚀 Открыть приложение", url: APP_URL }],
    ]),
  ];
}

function screenNotLinked(): [string, Record<string, unknown>] {
  return [
    `📍 <b>STSphera</b>\n` +
    `${sep()}\n` +
    `⚠️ Аккаунт не привязан.\n\n` +
    `Откройте приложение и привяжите\n` +
    `Telegram в настройках профиля.`,
    kb([[{ text: "🚀 Открыть приложение", url: APP_URL }]]),
  ];
}

// ── Главный render-метод ──────────────────────────────────────
async function renderScreen(
  chatId: number,
  text: string,
  markup: Record<string, unknown>,
  session: { state: State; context: Ctx } | null,
  user: BotUser | null,
  newState?: State,
  newCtx?: Ctx
) {
  const existingMsgId = session?.context?.message_id;
  let msgId = existingMsgId;

  if (existingMsgId) {
    const ok = await editMsg(chatId, existingMsgId, text, markup);
    if (!ok) {
      msgId = await sendNew(chatId, text, markup);
    }
  } else {
    msgId = await sendNew(chatId, text, markup);
  }

  const ctx: Ctx = { ...(session?.context || {}), ...(newCtx || {}), message_id: msgId };
  await saveSession(chatId, newState ?? session?.state ?? "IDLE", ctx, user?.user_id);
}

// ── Получить активный проект пользователя ─────────────────────
async function resolveProject(user: BotUser, ctx: Ctx) {
  if (ctx.project_id) {
    return { project_id: ctx.project_id, project_name: ctx.project_name || "" };
  }
  const projects = await getProjects(user.user_id);
  if (projects.length === 1) {
    return { project_id: projects[0].project_id, project_name: projects[0].project_name };
  }
  return null;
}

// ── ОБРАБОТЧИКИ ───────────────────────────────────────────────

async function handleStart(chatId: number, _firstName: string) {
  const t0 = Date.now();
  const user = await getUser(chatId);

  if (!user) {
    const [text, markup] = screenNotLinked();
    const msgId = await sendNew(chatId, text, markup);
    await saveSession(chatId, "IDLE", { message_id: msgId });
    await audit(chatId, null, "nav.start", {}, "success", undefined, Date.now() - t0);
    return;
  }

  const session = await getSession(chatId);
  const [text, markup] = screenHub(user, session?.context || {});

  const msgId = await sendNew(chatId, text, markup);
  await saveSession(chatId, "IDLE", { message_id: msgId }, user.user_id);
  await audit(chatId, user.user_id, "nav.start", {}, "success", undefined, Date.now() - t0);
}

async function handleCallback(
  chatId: number,
  callbackId: string,
  data: string,
  _firstName: string
) {
  await answerCB(callbackId);

  const t0 = Date.now();
  const [user, session] = await Promise.all([getUser(chatId), getSession(chatId)]);

  if (!user) {
    const [text, markup] = screenNotLinked();
    await renderScreen(chatId, text, markup, session, null);
    return;
  }

  const ctx = session?.context || {};

  if (data === "nav:home" || data === "nav:retry") {
    const [text, markup] = screenHub(user, ctx);
    await renderScreen(chatId, text, markup, session, user, "IDLE", {});
    await audit(chatId, user.user_id, "nav.home");
    return;
  }

  if (data === "nav:dashboard") {
    const proj = await resolveProject(user, ctx);
    if (!proj) {
      const projects = await getProjects(user.user_id);
      const [text, markup] = screenProjectSelect(projects);
      await renderScreen(chatId, text, markup, session, user, "IDLE");
      return;
    }
    const project = await getSingleProject(proj.project_id);
    if (!project) {
      const [text, markup] = screenError("Объект не найден.");
      await renderScreen(chatId, text, markup, session, user);
      return;
    }
    const [text, markup] = screenDashboard(project, user);
    await renderScreen(chatId, text, markup, session, user, "IDLE", {
      project_id: project.project_id, project_name: project.project_name
    });
    await audit(chatId, user.user_id, "nav.dashboard", { project_id: project.project_id });
    return;
  }

  if (data === "nav:portfolio") {
    if (!can(user, "portfolio")) {
      const [text, markup] = screenError("У вас нет доступа к этому разделу.");
      await renderScreen(chatId, text, markup, session, user);
      return;
    }
    const projects = await getProjects(user.user_id);
    const [text, markup] = screenPortfolio(projects);
    await renderScreen(chatId, text, markup, session, user, "IDLE");
    await audit(chatId, user.user_id, "nav.portfolio");
    return;
  }

  if (data === "nav:alerts") {
    const proj = await resolveProject(user, ctx);
    if (!proj) {
      const projects = await getProjects(user.user_id);
      const [text, markup] = screenProjectSelect(projects);
      await renderScreen(chatId, text, markup, session, user);
      return;
    }
    const [text, markup] = await screenAlertList(proj.project_id, proj.project_name, user);
    await renderScreen(chatId, text, markup, session, user, "IDLE", {
      project_id: proj.project_id, project_name: proj.project_name
    });
    return;
  }

  if (data === "nav:supply") {
    const proj = await resolveProject(user, ctx);
    if (!proj) {
      const projects = await getProjects(user.user_id);
      const [text, markup] = screenProjectSelect(projects);
      await renderScreen(chatId, text, markup, session, user);
      return;
    }
    const [text, markup] = await screenSupply(proj.project_id, proj.project_name);
    await renderScreen(chatId, text, markup, session, user, "IDLE", {
      project_id: proj.project_id, project_name: proj.project_name
    });
    return;
  }

  if (data === "nav:report") {
    if (!can(user, "report")) {
      const [text, markup] = screenError("У вас нет доступа к ежедневному отчёту.");
      await renderScreen(chatId, text, markup, session, user);
      return;
    }
    const proj = await resolveProject(user, ctx);
    if (!proj) {
      const projects = await getProjects(user.user_id);
      const [text, markup] = screenProjectSelect(projects);
      await renderScreen(chatId, text, markup, session, user);
      return;
    }
    const [text, markup] = screenReportStep1(proj.project_name);
    await renderScreen(chatId, text, markup, session, user, "REPORT_STEP1", {
      project_id: proj.project_id, project_name: proj.project_name, draft: {}
    });
    return;
  }

  if (data === "nav:settings") {
    const text =
      `📍 <b>Настройки</b>\n${sep()}\n` +
      `Telegram привязан: ✅\n` +
      `Профиль и уведомления настраиваются в приложении.`;
    await renderScreen(chatId, text, kb([
      [{ text: "⚙️ Открыть настройки", url: `${APP_URL}?tab=settings` }],
      [{ text: "← Назад", callback_data: "nav:home" }],
    ]), session, user, "IDLE");
    return;
  }

  if (data.startsWith("dash:view:")) {
    const projectId = data.slice(10);
    const project = await getSingleProject(projectId);
    if (!project) {
      const [text, markup] = screenError("Объект не найден или нет доступа.");
      await renderScreen(chatId, text, markup, session, user);
      return;
    }
    const [text, markup] = screenDashboard(project, user);
    await renderScreen(chatId, text, markup, session, user, "IDLE", {
      project_id: project.project_id, project_name: project.project_name
    });
    await audit(chatId, user.user_id, "nav.dashboard", { project_id: projectId });
    return;
  }

  if (data.startsWith("alert:list:")) {
    const projectId   = data.slice(11);
    const projectName = ctx.project_name || "Объект";
    const [text, markup] = await screenAlertList(projectId, projectName, user);
    await renderScreen(chatId, text, markup, session, user, "IDLE", {
      project_id: projectId, project_name: projectName
    });
    return;
  }

  if (data.startsWith("alert:create:")) {
    if (!can(user, "alerts_create")) {
      const [text, markup] = screenError("Нет прав на создание алертов.");
      await renderScreen(chatId, text, markup, session, user);
      return;
    }
    const projectId   = data.slice(13);
    const projectName = ctx.project_name || "Объект";
    const [text, markup] = screenAlertStep1(projectName);
    await renderScreen(chatId, text, markup, session, user, "ALERT_STEP1", {
      project_id: projectId, project_name: projectName, draft: {}
    });
    return;
  }

  if (data.startsWith("alert:prio:")) {
    const priority = data.slice(11);
    const draft    = { ...(ctx.draft || {}), priority };
    const [text, markup] = screenAlertConfirm(draft, ctx.project_name || "Объект");
    await renderScreen(chatId, text, markup, session, user, "ALERT_CONFIRM", { ...ctx, draft });
    return;
  }

  if (data === "alert:edit") {
    const [text, markup] = screenAlertStep1(ctx.project_name || "Объект");
    await renderScreen(chatId, text, markup, session, user, "ALERT_STEP1", { ...ctx, draft: {} });
    return;
  }

  if (data === "alert:confirm") {
    const { project_id, project_name, draft = {} } = ctx;
    if (!project_id || !draft.title) {
      const [text, markup] = screenError("Потеряны данные. Начните заново.");
      await renderScreen(chatId, text, markup, session, user, "IDLE", {});
      return;
    }

    const { error } = await db.from("alerts").insert({
      project_id,
      title:       draft.title,
      priority:    draft.priority || "medium",
      description: null,
      is_resolved: false,
      created_at:  new Date().toISOString(),
    });

    if (error) {
      const [text, markup] = screenError("Ошибка сохранения. Попробуйте снова.");
      await renderScreen(chatId, text, markup, session, user);
      await audit(chatId, user.user_id, "alert.create", { project_id }, "error", error.message);
      return;
    }

    const [text, markup] = screenStatus(
      "Алерт создан",
      `«${draft.title}»\n${priorityLabel(draft.priority || "medium")} · ${project_name}`
    );
    await renderScreen(chatId, text, markup, session, user, "IDLE", { project_id, project_name });
    await audit(chatId, user.user_id, "alert.create", { project_id, title: draft.title, priority: draft.priority }, "success", undefined, Date.now() - t0);

    const msgId = session?.context?.message_id;
    if (msgId) {
      setTimeout(() => removeKeyboard(chatId, msgId), 60000);
    }

    // Уведомить PM и директора через очередь
    await db.from("bot_event_queue").insert({
      event_type:   "alert.created",
      project_id,
      target_roles: ["pm", "director"],
      payload:      { title: draft.title, priority: draft.priority, created_by: user.display_name },
      priority:     draft.priority === "critical" ? "critical" : "normal",
      scheduled_at: new Date().toISOString(),
    });

    return;
  }

  if (data === "alert:cancel") {
    const proj = ctx.project_id;
    if (proj) {
      const [text, markup] = await screenAlertList(proj, ctx.project_name || "Объект", user);
      await renderScreen(chatId, text, markup, session, user, "IDLE", { project_id: proj, project_name: ctx.project_name });
    } else {
      const [text, markup] = screenHub(user, {});
      await renderScreen(chatId, text, markup, session, user, "IDLE", {});
    }
    return;
  }

  if (data.startsWith("report:start:")) {
    if (!can(user, "report")) {
      const [text, markup] = screenError("Нет доступа к отчёту.");
      await renderScreen(chatId, text, markup, session, user);
      return;
    }
    const projectId   = data.slice(13);
    const projectName = ctx.project_name || "Объект";
    const [text, markup] = screenReportStep1(projectName);
    await renderScreen(chatId, text, markup, session, user, "REPORT_STEP1", {
      project_id: projectId, project_name: projectName, draft: {}
    });
    return;
  }

  if (data === "report:no_notes") {
    await saveReportAndShowStatus(chatId, session, user, null);
    return;
  }

  if (data === "report:add_notes") {
    const text =
      `📍 <b>Ежедневный отчёт</b>\n${sep()}\n` +
      `Факт: <b>${ctx.draft?.fact} ед.</b>\n\n` +
      `Введите примечание:`;
    await renderScreen(chatId, text, kb([[{ text: "✕ Отмена", callback_data: "report:cancel" }]]),
      session, user, "REPORT_STEP2");
    return;
  }

  if (data === "report:cancel") {
    const [text, markup] = screenHub(user, ctx);
    await renderScreen(chatId, text, markup, session, user, "IDLE", {});
    return;
  }

  if (data.startsWith("supply:view:")) {
    const projectId   = data.slice(12);
    const projectName = ctx.project_name || "Объект";
    const [text, markup] = await screenSupply(projectId, projectName);
    await renderScreen(chatId, text, markup, session, user, "IDLE", {
      project_id: projectId, project_name: projectName
    });
    return;
  }

  await audit(chatId, user.user_id, "callback.unknown", { data }, "ignored");
}

// ── Сохранить отчёт ───────────────────────────────────────────
async function saveReportAndShowStatus(
  chatId: number,
  session: { state: State; context: Ctx } | null,
  user: BotUser,
  notes: string | null
) {
  const ctx = session?.context || {};
  const { project_id, project_name, draft = {} } = ctx;

  if (!project_id || !draft.fact) {
    const [text, markup] = screenError("Потеряны данные отчёта. Начните заново.");
    await renderScreen(chatId, text, markup, session, user, "IDLE", {});
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const now = new Date();
  const weekNumber = Math.ceil((now.getDate() + new Date(now.getFullYear(), now.getMonth(), 1).getDay()) / 7);

  const { error } = await db.from("plan_fact").insert({
    project_id,
    date:        today,
    week_number: weekNumber,
    fact_value:  draft.fact,
    plan_value:  0,
    notes,
    created_at:  new Date().toISOString(),
  });

  if (error) {
    const [text, markup] = screenError("Ошибка сохранения отчёта.");
    await renderScreen(chatId, text, markup, session, user);
    await audit(chatId, user.user_id, "report.submit", { project_id }, "error", error.message);
    return;
  }

  const detail =
    `Объект: ${project_name}\n` +
    `📊 Факт: <b>${draft.fact} ед.</b>\n` +
    (notes ? `📝 ${notes}` : "");

  const [text, markup] = screenStatus("Отчёт сохранён", detail);
  await renderScreen(chatId, text, markup, session, user, "IDLE", { project_id, project_name });
  await audit(chatId, user.user_id, "report.submit", { project_id, fact: draft.fact }, "success");

  const msgId = session?.context?.message_id;
  if (msgId) setTimeout(() => removeKeyboard(chatId, msgId), 60000);
}

// ── Обработка текстового ввода (FSM) ──────────────────────────
async function handleText(chatId: number, text: string) {
  const [user, session] = await Promise.all([getUser(chatId), getSession(chatId)]);
  if (!user || !session) return;

  const state = session.state;
  const ctx   = session.context;

  if (state === "ALERT_STEP1") {
    const title = text.trim().slice(0, 80);
    const [screenText, markup] = screenAlertStep2(title);
    await renderScreen(chatId, screenText, markup, session, user, "ALERT_STEP2", {
      ...ctx, draft: { ...(ctx.draft || {}), title }
    });
    return;
  }

  if (state === "REPORT_STEP1") {
    const val = parseFloat(text.replace(",", "."));
    if (isNaN(val) || val < 0) {
      const [screenText, markup] = screenReportStep1(ctx.project_name || "Объект");
      await editMsg(chatId, ctx.message_id!,
        screenText + "\n\n❌ <i>Введите корректное число</i>",
        markup
      );
      return;
    }
    const [screenText, markup] = screenReportStep2(val);
    await renderScreen(chatId, screenText, markup, session, user, "REPORT_STEP2", {
      ...ctx, draft: { ...(ctx.draft || {}), fact: val }
    });
    return;
  }

  if (state === "REPORT_STEP2") {
    await saveReportAndShowStatus(chatId, session, user, text.trim());
    return;
  }

  const [screenText, markup] = screenHub(user, ctx);
  await renderScreen(chatId, screenText, markup, session, user, "IDLE");
}

// ── Webhook handler ───────────────────────────────────────────
serve(async (req) => {
  if (req.method !== "POST") return new Response("OK");

  let update: any;
  try {
    update = await req.json();
  } catch {
    return new Response("OK");
  }

  try {
    if (update.message) {
      const msg       = update.message;
      const chatId: number  = msg.chat.id;
      const text: string    = msg.text || "";
      const firstName       = msg.from?.first_name || "Пользователь";

      if (text.startsWith("/start"))  { await handleStart(chatId, firstName); return new Response("OK"); }
      if (text.startsWith("/menu"))   { await handleStart(chatId, firstName); return new Response("OK"); }
      if (text.startsWith("/cancel")) {
        await clearSession(chatId);
        const user = await getUser(chatId);
        if (user) {
          const [t, m] = screenHub(user, {});
          await sendNew(chatId, t, m);
        }
        return new Response("OK");
      }

      await handleText(chatId, text);
    }

    if (update.callback_query) {
      const cq      = update.callback_query;
      const chatId  = cq.from.id;
      const data    = cq.data || "";
      const cbId    = cq.id;
      const firstName = cq.from?.first_name || "";
      await handleCallback(chatId, cbId, data, firstName);
    }

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown";
    console.error("[BOT ERROR]", msg);
  }

  return new Response("OK", { status: 200 });
});
