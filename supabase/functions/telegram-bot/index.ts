// ═══════════════════════════════════════════════════════════════
// STSphera Telegram Bot v4 — Full Role-Based Architecture
// ═══════════════════════════════════════════════════════════════
// 10 roles: Director, PM, OPR, KM, KMD, Supply, Production,
//           Foreman, PTO, Inspector
// Each role: Hub → Inbox → Send → FSM document flows
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SB_URL    = Deno.env.get("SUPABASE_URL")!;
const SB_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RAW_APP_URL = Deno.env.get("MINI_APP_URL") || "https://smr-sfera.lovable.app";
const APP_URL = RAW_APP_URL.startsWith("http") ? RAW_APP_URL : `https://${RAW_APP_URL}`;
const TG        = `https://api.telegram.org/bot${BOT_TOKEN}`;
const db = createClient(SB_URL, SB_KEY);
const SEP = "─".repeat(29);

// ── TG API helpers ──────────────────────────────────────────
async function tgSend(chatId: number, text: string, markup?: object): Promise<number | null> {
  const res = await fetch(`${TG}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(markup ? { reply_markup: markup } : {}) }) });
  const j = await res.json();
  if (!j.ok) console.error(`[tgSend] FAILED:`, JSON.stringify(j));
  return j.ok ? j.result.message_id : null;
}
async function tgEdit(chatId: number, msgId: number, text: string, markup?: object) {
  await fetch(`${TG}/editMessageText`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: msgId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(markup ? { reply_markup: markup } : {}) }) });
}
async function tgAnswer(cbId: string, text?: string) {
  await fetch(`${TG}/answerCallbackQuery`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: cbId, ...(text ? { text } : {}) }) });
}
async function tgDeleteMsg(chatId: number, msgId: number) {
  await fetch(`${TG}/deleteMessage`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: msgId }) }).catch(() => {});
}
function progressBar(pct: number): string {
  const filled = Math.round(Math.min(pct, 100) / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

// ── DB helpers ──────────────────────────────────────────────
interface BotUser { user_id: string; display_name: string; roles: string[]; }

async function getUser(chatId: number): Promise<BotUser | null> {
  const { data } = await db.from("profiles").select("user_id, display_name").eq("telegram_chat_id", String(chatId)).maybeSingle();
  if (!data) return null;
  const { data: rolesData } = await db.from("user_roles").select("role").eq("user_id", data.user_id);
  return { user_id: data.user_id, display_name: data.display_name, roles: (rolesData || []).map((r: any) => r.role) };
}

// ── Role detection (priority order) ─────────────────────────
const ROLE_PRIORITY = ["director", "pm", "project_opr", "project_km", "project_kmd", "supply", "production", "foreman1", "foreman2", "foreman3", "pto", "inspector"];
const ROLE_LABELS: Record<string, string> = {
  director: "👔 Директор", pm: "📋 Руководитель проекта",
  project_opr: "📐 ОПР", project_km: "📏 КМ", project_kmd: "✏️ КМД",
  supply: "📦 Снабжение", production: "🏭 Производство",
  foreman1: "🏗️ Прораб", foreman2: "🏗️ Прораб", foreman3: "🏗️ Прораб",
  pto: "📁 ПТО", inspector: "🔍 Технадзор",
};
const ROLE_PREFIXES: Record<string, string> = {
  director: "d", pm: "pm", project_opr: "opr", project_km: "km", project_kmd: "kmd",
  supply: "sup", production: "prod", foreman1: "f", foreman2: "f", foreman3: "f",
  pto: "pto", inspector: "insp",
};

function detectPrimaryRole(roles: string[]): string {
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return "generic";
}
function isForeman(roles: string[]) { return roles.some(r => ["foreman1", "foreman2", "foreman3"].includes(r)); }
function isManager(roles: string[]) { return roles.includes("director") || roles.includes("pm"); }
function rp(roles: string[]) { return ROLE_PREFIXES[detectPrimaryRole(roles)] || "g"; }
function roleLabel(roles: string[]) { return ROLE_LABELS[detectPrimaryRole(roles)] || "📋 Сотрудник"; }

// ── Session management ──────────────────────────────────────
async function getSession(chatId: number) {
  const { data } = await db.from("bot_sessions").select("state, context, message_id, user_id")
    .eq("chat_id", String(chatId)).gt("expires_at", new Date().toISOString()).maybeSingle();
  return data as { state: string; context: any; message_id: number | null; user_id: string } | null;
}
async function saveSession(chatId: number, userId: string, state: string, context: any, msgId?: number) {
  await db.from("bot_sessions").upsert({ chat_id: String(chatId), user_id: userId, state, context: context || {},
    message_id: msgId ?? null, updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7200000).toISOString() }, { onConflict: "chat_id" });
}
async function clearSession(chatId: number) {
  await db.from("bot_sessions").update({ state: "IDLE", context: {} }).eq("chat_id", String(chatId));
}
async function audit(chatId: number, userId: string, action: string, payload?: object) {
  await db.from("bot_audit_log").insert({ chat_id: String(chatId), user_id: userId, action, payload: payload || {} });
}

// ── Data fetchers ───────────────────────────────────────────
async function getProjects() {
  const { data } = await db.from("projects").select("id, name, code, city, status, end_date")
    .eq("status", "active").order("created_at", { ascending: false }).limit(10);
  return data || [];
}
async function getProject(projectId: string) {
  const { data } = await db.from("projects").select("id, name, code, end_date").eq("id", projectId).maybeSingle();
  return data;
}
async function getFacades(projectId: string) {
  const { data } = await db.from("facades").select("id, name, code, total_modules, floors_count").eq("project_id", projectId).order("name");
  return data || [];
}
async function getFacadeStats(facadeId: string) {
  const { data: floors } = await db.from("floors").select("floor_number, modules_plan, modules_fact, brackets_plan, brackets_fact, status").eq("facade_id", facadeId).order("floor_number");
  const all = floors || [];
  const totalPlan = all.reduce((s: number, f: any) => s + (f.modules_plan || 0), 0);
  const totalFact = all.reduce((s: number, f: any) => s + (f.modules_fact || 0), 0);
  const pct = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;
  return { floors: all, totalPlan, totalFact, pct, doneFloors: all.filter((f: any) => f.status === "done").length };
}
async function getOpenAlerts(projectId: string, limit = 5) {
  const { data } = await db.from("alerts").select("id, title, priority, category, facade_id, floor_number, created_at")
    .eq("project_id", projectId).eq("is_resolved", false).order("priority", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  const { count } = await db.from("alerts").select("*", { count: "exact", head: true }).eq("project_id", projectId).eq("is_resolved", false);
  const { count: critCount } = await db.from("alerts").select("*", { count: "exact", head: true }).eq("project_id", projectId).eq("is_resolved", false).eq("priority", "critical");
  return { list: data || [], counts: { total: count || 0, critical: critCount || 0 } };
}
async function getDeficitMaterials(projectId: string, limit = 5) {
  const { data } = await db.from("materials").select("name, unit, total_required, on_site, deficit, status, eta")
    .eq("project_id", projectId).gt("deficit", 0).order("deficit", { ascending: false }).limit(limit);
  return data || [];
}
async function getMyTasks(userId: string, projectId: string, limit = 5) {
  const { data } = await db.from("ecosystem_tasks").select("id, code, name, status, priority, planned_date, block")
    .eq("project_id", projectId).eq("assigned_to", userId).neq("status", "Выполнено").order("planned_date", { ascending: true }).limit(limit);
  return data || [];
}
async function getTodayPlanFact(projectId: string) {
  const today = new Date().toISOString().split("T")[0];
  const { data } = await db.from("plan_fact").select("plan_value, fact_value").eq("project_id", projectId).eq("date", today);
  const all = data || [];
  const plan = all.reduce((s: number, r: any) => s + Number(r.plan_value || 0), 0);
  const fact = all.reduce((s: number, r: any) => s + Number(r.fact_value || 0), 0);
  return { plan, fact, pct: plan > 0 ? Math.round((fact / plan) * 100) : 0, count: all.length };
}
async function getPendingApprovals(projectId: string) {
  const { data } = await db.from("approvals").select("id, title, type, status, level, created_at, description")
    .eq("project_id", projectId).eq("status", "pending").order("created_at", { ascending: false }).limit(5);
  return data || [];
}
async function getDailyLogs(projectId: string, limit = 5) {
  const { data } = await db.from("daily_logs").select("id, date, works_description, workers_count, status, zone_name, submitted_by")
    .eq("project_id", projectId).order("date", { ascending: false }).limit(limit);
  return data || [];
}
async function getInboxCount(projectId: string, toRole: string) {
  const { count } = await db.from("bot_inbox").select("*", { count: "exact", head: true })
    .eq("project_id", projectId).eq("status", "new").contains("to_roles", [toRole]);
  return count || 0;
}
async function getInboxItems(projectId: string, toRole: string, limit = 5) {
  const { data } = await db.from("bot_inbox").select("id, title, type, from_role, status, created_at, description, file_url")
    .eq("project_id", projectId).contains("to_roles", [toRole]).order("created_at", { ascending: false }).limit(limit);
  return data || [];
}

// ── Shared UI helpers ───────────────────────────────────────
const todayStr = () => new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
const pe: Record<string, string> = { critical: "🔴", high: "🟠", normal: "🟡", low: "⚪" };
const typeIcons: Record<string, string> = { daily_log: "📋", material_request: "📦", task_completion: "✔️", budget: "💰", other: "📌" };
const typeLabels: Record<string, string> = { daily_log: "Дневной отчёт", material_request: "Заявка на материалы", task_completion: "Завершение задачи", budget: "Бюджет" };

async function sendOrEdit(chatId: number, session: any, userId: string, text: string, buttons: any[][], state = "IDLE", ctx?: any) {
  const msgId = session?.message_id;
  if (msgId) {
    await tgEdit(chatId, msgId, text, { inline_keyboard: buttons });
    await saveSession(chatId, userId, state, ctx || session?.context || {}, msgId);
  } else {
    const n = await tgSend(chatId, text, { inline_keyboard: buttons });
    await saveSession(chatId, userId, state, ctx || {}, n ?? undefined);
  }
}

// ══════════════════════════════════════════════════════════════
// Universal Inbox screen (works for any role)
// ══════════════════════════════════════════════════════════════
async function screenInbox(chatId: number, user: BotUser, session: any, role: string, prefix: string) {
  const projectId = session?.context?.project_id;
  if (!projectId) return routeToMenu(chatId, user, session);
  const items = await getInboxItems(projectId, role);
  const label = ROLE_LABELS[role] || role;
  let text = `📥 <b>Входящие · ${label}</b>\n${SEP}\n`;
  if (items.length === 0) {
    text += "✅ Нет новых входящих";
  } else {
    const fromIcons: Record<string, string> = { pm: "📋", supply: "📦", production: "🏭", project_opr: "📐", project_km: "📏", project_kmd: "✏️", foreman: "🏗️", pto: "📁", inspector: "🔍", director: "👔" };
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const icon = fromIcons[item.from_role] || "📌";
      const age = Math.round((Date.now() - new Date(item.created_at).getTime()) / 3600000);
      text += `${i + 1}. ${icon} <b>${item.title}</b>\n   от: ${item.from_role} · ${age}ч назад\n`;
      if (item.description) text += `   <i>${item.description.slice(0, 50)}</i>\n`;
      text += "\n";
    }
  }
  const buttons: any[][] = items.slice(0, 4).map((item: any, i: number) => [
    { text: `${i + 1}. ${item.title.slice(0, 28)}`, callback_data: `inbox:view:${item.id}` },
  ]);
  buttons.push([{ text: "◀️ Назад", callback_data: `${prefix}:menu` }]);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: buttons });
}

async function screenInboxDetail(chatId: number, user: BotUser, session: any, itemId: string) {
  const { data: item } = await db.from("bot_inbox").select("*").eq("id", itemId).maybeSingle();
  if (!item) return;
  // Mark as read
  if (item.status === "new") {
    await db.from("bot_inbox").update({ status: "read" }).eq("id", itemId);
  }
  let text = `📥 <b>${item.title}</b>\n${SEP}\n`;
  text += `От: ${item.from_role}\nТип: ${item.type}\n`;
  if (item.description) text += `\n${item.description}\n`;
  if (item.file_url) text += `\n📎 <a href="${item.file_url}">Файл</a>\n`;
  text += `\n📅 ${new Date(item.created_at).toLocaleString("ru-RU")}`;

  const prefix = rp(user.roles);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "✅ Обработано", callback_data: `inbox:done:${itemId}` }],
    [{ text: "◀️ Входящие", callback_data: `${prefix}:inbox` }],
  ] });
}

async function handleInboxDone(chatId: number, user: BotUser, session: any, itemId: string) {
  await db.from("bot_inbox").update({ status: "processed" }).eq("id", itemId);
  await audit(chatId, user.user_id, "inbox:processed", { item_id: itemId });
  const prefix = rp(user.roles);
  await tgEdit(chatId, session.message_id, "✅ Отмечено как обработанное", { inline_keyboard: [
    [{ text: "📥 Входящие", callback_data: `${prefix}:inbox` }],
    [{ text: "◀️ Меню", callback_data: `${prefix}:menu` }],
  ] });
}

// ══════════════════════════════════════════════════════════════
// Universal Document FSM
// States: DOC_TYPE → DOC_UPLOAD → DOC_COMMENT → DOC_CONFIRM → SENT
// ══════════════════════════════════════════════════════════════
async function startDocFSM(chatId: number, user: BotUser, session: any, docType: string, docLabel: string, recipients: string[]) {
  const ctx = { ...session.context, doc_type: docType, doc_label: docLabel, doc_recipients: recipients };
  await tgEdit(chatId, session.message_id,
    `📤 <b>${docLabel}</b>\n${SEP}\n📎 Отправьте файл (документ или фото):`,
    { inline_keyboard: [[{ text: "✕ Отмена", callback_data: `${rp(user.roles)}:send` }]] });
  await saveSession(chatId, user.user_id, "DOC_UPLOAD", ctx, session.message_id);
}

async function handleDocFile(chatId: number, user: BotUser, session: any, fileUrl: string) {
  const ctx = { ...session.context, doc_file_url: fileUrl };
  await tgEdit(chatId, session.message_id,
    `📤 <b>${ctx.doc_label}</b>\n${SEP}\n📎 Файл получен\n\n💬 Добавьте комментарий или отправьте «—» для пропуска:`,
    { inline_keyboard: [[{ text: "— Без комментария", callback_data: "doc:nocomment" }], [{ text: "✕ Отмена", callback_data: `${rp(user.roles)}:send` }]] });
  await saveSession(chatId, user.user_id, "DOC_COMMENT", ctx, session.message_id);
}

async function handleDocComment(chatId: number, user: BotUser, session: any, comment: string) {
  const ctx = { ...session.context, doc_comment: comment === "—" ? null : comment };
  const recipients = (ctx.doc_recipients || []).join(", ");
  await tgEdit(chatId, session.message_id,
    `📤 <b>Подтверждение</b>\n${SEP}\nТип: ${ctx.doc_label}\nПолучатели: ${recipients}\n📎 Файл: прикреплён\n${ctx.doc_comment ? `💬 ${ctx.doc_comment}` : ""}\n\nОтправить?`,
    { inline_keyboard: [
      [{ text: "✅ Отправить", callback_data: "doc:confirm" }],
      [{ text: "✕ Отмена", callback_data: `${rp(user.roles)}:send` }],
    ] });
  await saveSession(chatId, user.user_id, "DOC_CONFIRM", ctx, session.message_id);
}

async function handleDocConfirm(chatId: number, user: BotUser, session: any) {
  const ctx = session.context;
  // Save to bot_documents
  await db.from("bot_documents").insert({
    project_id: ctx.project_id, sender_id: user.user_id,
    doc_type: ctx.doc_type, file_url: ctx.doc_file_url || null,
    comment: ctx.doc_comment || null, recipients: ctx.doc_recipients || [],
    status: "sent",
  });
  // Create inbox items for recipients
  for (const role of (ctx.doc_recipients || [])) {
    await db.from("bot_inbox").insert({
      project_id: ctx.project_id, from_user_id: user.user_id,
      from_role: detectPrimaryRole(user.roles), to_roles: [role],
      type: "document", title: ctx.doc_label,
      description: ctx.doc_comment || null, file_url: ctx.doc_file_url || null,
      status: "new",
    });
  }
  // Notify via event queue
  await db.from("bot_event_queue").insert({
    event_type: "document.sent", target_roles: ctx.doc_recipients || [],
    project_id: ctx.project_id, priority: "normal",
    payload: { doc_type: ctx.doc_type, label: ctx.doc_label, sender: user.display_name, comment: ctx.doc_comment },
    scheduled_at: new Date().toISOString(),
  });
  await audit(chatId, user.user_id, "doc:sent", { doc_type: ctx.doc_type, recipients: ctx.doc_recipients });
  const prefix = rp(user.roles);
  await tgEdit(chatId, session.message_id, `✅ <b>Документ отправлен</b>\n${SEP}\n${ctx.doc_label}\nПолучатели: ${(ctx.doc_recipients || []).join(", ")}`,
    { inline_keyboard: [[{ text: "📤 Ещё", callback_data: `${prefix}:send` }], [{ text: "◀️ Меню", callback_data: `${prefix}:menu` }]] });
  await clearSession(chatId);
}

// ══════════════════════════════════════════════════════════════
// SHARED SCREENS (used by multiple roles)
// ══════════════════════════════════════════════════════════════
async function screenProjectsList(chatId: number, user: BotUser, session: any) {
  const projects = await getProjects();
  let text = `📋 <b>Ваши проекты</b>\n${SEP}\n`;
  if (projects.length === 0) {
    text += "Нет активных проектов";
    await sendOrEdit(chatId, session, user.user_id, text, [[{ text: "🚀 Открыть приложение", web_app: { url: APP_URL } }]]);
    return;
  }
  for (const p of projects) { text += `\n🏗️ <b>${p.name}</b>${p.city ? ` · ${p.city}` : ""}${p.code ? ` (${p.code})` : ""}\n`; }
  const buttons = projects.map((p: any) => [{ text: `🏗️ ${p.name}`, callback_data: `proj:sel:${p.id}` }]);
  buttons.push([{ text: "◀️ Назад", callback_data: `${rp(user.roles)}:menu` }]);
  await sendOrEdit(chatId, session, user.user_id, text, buttons);
}

async function selectProject(chatId: number, user: BotUser, session: any, projectId: string) {
  const project = await getProject(projectId);
  if (!project) return;
  const ctx = { ...session?.context, project_id: projectId, project_name: project.name };
  await saveSession(chatId, user.user_id, "IDLE", ctx, session?.message_id ?? undefined);
  return routeToMenu(chatId, user, { ...session, context: ctx });
}

async function screenAlerts(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) return routeToMenu(chatId, user, session);
  const { list, counts } = await getOpenAlerts(projectId, 8);
  let text = `🔔 <b>Алерты</b>\n${SEP}\n`;
  if (counts.total === 0) { text += "✅ Нет открытых алертов"; }
  else {
    text += `Открытых: <b>${counts.total}</b>`; if (counts.critical > 0) text += ` 🔴 крит: <b>${counts.critical}</b>`; text += `\n\n`;
    for (const a of list) {
      const age = Math.round((Date.now() - new Date(a.created_at).getTime()) / 3600000);
      text += `${pe[a.priority] || "⚪"} ${a.title}\n`;
      if (a.floor_number) text += `   Этаж ${a.floor_number}`;
      text += `   <i>${age}ч назад</i>\n`;
    }
    if (counts.total > list.length) text += `\n<i>...ещё ${counts.total - list.length}</i>`;
  }
  const prefix = rp(user.roles);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    ...(isManager(user.roles) ? [[{ text: "✏️ Создать алерт", callback_data: `${prefix}:alert_new` }]] : []),
    [{ text: "◀️ Меню", callback_data: `${prefix}:menu` }],
  ] });
}

async function screenSupply(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) return routeToMenu(chatId, user, session);
  const deficit = await getDeficitMaterials(projectId);
  let text = `📦 <b>Снабжение</b>\n${SEP}\n`;
  if (deficit.length === 0) { text += "✅ Дефицита нет"; }
  else {
    text += `⚠️ Дефицит по <b>${deficit.length}</b> позициям:\n\n`;
    for (const m of deficit) {
      const etaStr = m.eta ? ` · ETA ${new Date(m.eta).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}` : "";
      text += `📌 ${m.name}\n   Нужно: ${m.total_required} ${m.unit} · На объекте: ${m.on_site}${etaStr}\n   ⚠️ Дефицит: <b>${m.deficit} ${m.unit}</b>\n\n`;
    }
  }
  const prefix = rp(user.roles);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "🚀 Снабжение в приложении", web_app: { url: APP_URL } }],
    [{ text: "◀️ Меню", callback_data: `${prefix}:menu` }],
  ] });
}

async function screenDashboard(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  const project = projectId ? await getProject(projectId) : (await getProjects())[0];
  if (!project) { await tgEdit(chatId, session.message_id, "❌ Нет активных проектов.", { inline_keyboard: [[{ text: "◀️ Назад", callback_data: `${rp(user.roles)}:menu` }]] }); return; }
  const facades = await getFacades(project.id);
  const alerts = await getOpenAlerts(project.id);
  let totalPlan = 0, totalFact = 0;
  for (const f of facades) { const s = await getFacadeStats(f.id); totalPlan += s.totalPlan; totalFact += s.totalFact; }
  const totalPct = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;
  const daysLeft = project.end_date ? Math.ceil((new Date(project.end_date).getTime() - Date.now()) / 86400000) : null;
  let text = `📊 <b>Дашборд</b>\n${SEP}\n🏗️ ${project.name}\n📅 ${todayStr()}\n\n${progressBar(totalPct)} <b>${totalPct}%</b>\nМодули: ${totalFact} / ${totalPlan} шт.\n\n`;
  if (daysLeft !== null) text += daysLeft < 0 ? `🔴 Просрочка: <b>${Math.abs(daysLeft)} дн.</b>\n` : `📅 До сдачи: <b>${daysLeft} дн.</b>\n`;
  if (facades.length > 0) { text += `\n<b>По фасадам:</b>\n`; for (const f of facades) { const s = await getFacadeStats(f.id); text += `${f.name}: ${progressBar(s.pct)} ${s.pct}%\n`; } }
  if (alerts.counts.total > 0) { text += `\n🔔 Алертов: ${alerts.counts.total}`; if (alerts.counts.critical > 0) text += ` 🔴 крит: ${alerts.counts.critical}`; text += "\n"; }
  const prefix = rp(user.roles);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "🔔 Алерты", callback_data: `${prefix}:alerts` }, { text: "📦 Снабжение", callback_data: `${prefix}:supply` }],
    [{ text: "◀️ Меню", callback_data: `${prefix}:menu` }],
  ] });
}

async function screenFacades(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) return routeToMenu(chatId, user, session);
  const facades = await getFacades(projectId);
  let text = `🏗️ <b>Фасады</b>\n${SEP}\n`;
  for (const f of facades) {
    const s = await getFacadeStats(f.id);
    text += `<b>${f.name}</b> ${f.code ? `(${f.code})` : ""}\n${progressBar(s.pct)} ${s.pct}%  ${s.totalFact}/${s.totalPlan} мод.\n\n`;
  }
  const prefix = rp(user.roles);
  const buttons = facades.map((f: any) => [{ text: `📋 ${f.name}`, callback_data: `${prefix}:fcd:${f.id}` }]);
  buttons.push([{ text: "◀️ Меню", callback_data: `${prefix}:menu` }]);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: buttons });
}

async function screenFacadeDetail(chatId: number, user: BotUser, session: any, facadeId: string) {
  const { data: facade } = await db.from("facades").select("name, code, total_modules, floors_count").eq("id", facadeId).maybeSingle();
  if (!facade) return;
  const stats = await getFacadeStats(facadeId);
  let text = `🏗️ <b>${facade.name}</b>\n${SEP}\n${progressBar(stats.pct)} <b>${stats.pct}%</b>\nМодули: ${stats.totalFact} / ${stats.totalPlan}\n\n`;
  if (stats.floors.length > 0) {
    text += `<b>По этажам:</b>\n`;
    const sorted = [...stats.floors].sort((a: any, b: any) => b.floor_number - a.floor_number);
    for (const fl of sorted.slice(0, 8)) {
      const flPct = fl.modules_plan > 0 ? Math.round((fl.modules_fact / fl.modules_plan) * 100) : 0;
      const icon = fl.status === "done" ? "✅" : fl.status === "in_progress" ? "🔄" : "⬜";
      text += `${icon} Эт.${fl.floor_number}: ${fl.modules_fact}/${fl.modules_plan} (${flPct}%)\n`;
    }
  }
  const prefix = rp(user.roles);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "◀️ Фасады", callback_data: `${prefix}:facades` }],
    [{ text: "◀️ Меню", callback_data: `${prefix}:menu` }],
  ] });
}

async function screenApprovals(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) return routeToMenu(chatId, user, session);
  const approvals = await getPendingApprovals(projectId);
  let text = `📝 <b>Согласования</b>\n${SEP}\n`;
  if (approvals.length === 0) { text += "✅ Нет ожидающих"; }
  else {
    text += `Ожидают: <b>${approvals.length}</b>\n\n`;
    for (const a of approvals) {
      text += `${typeIcons[a.type] || "📌"} <b>${a.title}</b>\n   Ур.${a.level} · ${new Date(a.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}\n\n`;
    }
  }
  const prefix = rp(user.roles);
  const buttons: any[][] = [];
  for (const a of approvals.slice(0, 3)) {
    buttons.push([
      { text: `✅ ${a.title.slice(0, 18)}`, callback_data: `appr:yes:${a.id}` },
      { text: `❌`, callback_data: `appr:no:${a.id}` },
    ]);
  }
  buttons.push([{ text: "◀️ Меню", callback_data: `${prefix}:menu` }]);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: buttons });
}

async function handleApproval(chatId: number, user: BotUser, session: any, approvalId: string, decision: "approved" | "rejected") {
  const { data: approval } = await db.from("approvals").select("title, status").eq("id", approvalId).maybeSingle();
  if (!approval || approval.status !== "pending") return screenApprovals(chatId, user, session);
  await db.from("approvals").update({ status: decision, assigned_to: user.user_id, decided_at: new Date().toISOString() }).eq("id", approvalId);
  const icon = decision === "approved" ? "✅" : "❌";
  await audit(chatId, user.user_id, `approval:${decision}`, { approval_id: approvalId });
  const prefix = rp(user.roles);
  await tgEdit(chatId, session.message_id, `${icon} <b>${approval.title}</b>\nРешение: ${decision === "approved" ? "согласовано" : "отклонено"}`,
    { inline_keyboard: [[{ text: "📝 Согласования", callback_data: `${prefix}:approvals` }], [{ text: "◀️ Меню", callback_data: `${prefix}:menu` }]] });
}

async function screenTasks(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) return routeToMenu(chatId, user, session);
  const tasks = await getMyTasks(user.user_id, projectId);
  let text = `📋 <b>Мои задачи</b>\n${SEP}\n`;
  if (tasks.length === 0) { text += "✅ Нет активных задач"; }
  else {
    const si: Record<string, string> = { "В работе": "🔄", "Ожидание": "⏳", "Выполнено": "✅" };
    for (const t of tasks) {
      text += `${pe[t.priority] || "⚪"} ${si[t.status] || "⏳"} <b>[${t.code}]</b> ${t.name}\n`;
      if (t.planned_date) text += `   📅 ${new Date(t.planned_date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}\n`;
      text += "\n";
    }
  }
  const prefix = rp(user.roles);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "🚀 Задачи в приложении", web_app: { url: APP_URL } }],
    [{ text: "◀️ Меню", callback_data: `${prefix}:menu` }],
  ] });
}

async function screenSettings(chatId: number, user: BotUser, session: any) {
  const { data: profile } = await db.from("profiles").select("notification_preferences, telegram_chat_id").eq("user_id", user.user_id).maybeSingle();
  const prefs = (profile?.notification_preferences || {}) as Record<string, any>;
  let text = `⚙️ <b>Настройки</b>\n${SEP}\n👤 ${user.display_name}\n${roleLabel(user.roles)}\n📱 Chat ID: ${profile?.telegram_chat_id || "—"}\n\n`;
  text += `<b>Уведомления:</b>\n`;
  text += `${prefs.alert_created !== false ? "✅" : "❌"} Новые алерты\n`;
  text += `${prefs.daily_report_missing !== false ? "✅" : "❌"} Напоминание об отчёте\n`;
  text += `${prefs.project_summary !== false ? "✅" : "❌"} Дайджест проекта\n`;
  text += `${prefs.supply_overdue !== false ? "✅" : "❌"} Дефицит материалов\n`;
  text += `\n🌙 Не беспокоить: ${prefs.do_not_disturb_from || "23:00"} — ${prefs.do_not_disturb_to || "07:00"}\n`;
  const prefix = rp(user.roles);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: `${prefs.alert_created !== false ? "🔕" : "🔔"} Алерты`, callback_data: "set:t:alert_created" }],
    [{ text: `${prefs.daily_report_missing !== false ? "🔕" : "🔔"} Напоминания`, callback_data: "set:t:daily_report_missing" }],
    [{ text: `${prefs.project_summary !== false ? "🔕" : "🔔"} Дайджест`, callback_data: "set:t:project_summary" }],
    [{ text: "◀️ Меню", callback_data: `${prefix}:menu` }],
  ] });
}

async function toggleNotification(chatId: number, user: BotUser, session: any, key: string) {
  const { data: profile } = await db.from("profiles").select("notification_preferences").eq("user_id", user.user_id).maybeSingle();
  const prefs = { ...(profile?.notification_preferences || {}) } as Record<string, any>;
  prefs[key] = prefs[key] === false ? true : false;
  await db.from("profiles").update({ notification_preferences: prefs }).eq("user_id", user.user_id);
  return screenSettings(chatId, user, session);
}

async function screenDailyLogs(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) return routeToMenu(chatId, user, session);
  const logs = await getDailyLogs(projectId);
  let text = `📋 <b>Дневные журналы</b>\n${SEP}\n`;
  if (logs.length === 0) { text += "Нет записей"; }
  else {
    for (const log of logs) {
      const date = new Date(log.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      const statusIcon = log.status === "approved" ? "✅" : log.status === "submitted" ? "📤" : "📝";
      text += `${statusIcon} <b>${date}</b>${log.zone_name ? ` · ${log.zone_name}` : ""}\n   ${log.works_description.slice(0, 60)}\n\n`;
    }
  }
  const prefix = rp(user.roles);
  const buttons: any[][] = [];
  if (isForeman(user.roles)) buttons.push([{ text: "📝 Новая запись", callback_data: "log:new" }]);
  buttons.push([{ text: "🚀 В приложении", web_app: { url: APP_URL } }]);
  buttons.push([{ text: "◀️ Меню", callback_data: `${prefix}:menu` }]);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: buttons });
}

// ── Alert creation FSM ──────────────────────────────────────
async function screenAlertNew(chatId: number, user: BotUser, session: any) {
  const prefix = rp(user.roles);
  await tgEdit(chatId, session.message_id, `✏️ <b>Новый алерт</b>\n${SEP}\nВыберите приоритет:`, { inline_keyboard: [
    [{ text: "🔴 Критический", callback_data: `at:critical` }, { text: "🟠 Высокий", callback_data: `at:high` }],
    [{ text: "🟡 Обычный", callback_data: `at:normal` }, { text: "⚪ Низкий", callback_data: `at:low` }],
    [{ text: "✕ Отмена", callback_data: `${prefix}:alerts` }],
  ] });
  await saveSession(chatId, user.user_id, "ALERT_PRIORITY", session.context, session.message_id);
}

async function screenAlertTitle(chatId: number, user: BotUser, session: any, priority: string) {
  const pl: Record<string, string> = { critical: "🔴 Критический", high: "🟠 Высокий", normal: "🟡 Обычный", low: "⚪ Низкий" };
  await tgEdit(chatId, session.message_id, `✏️ <b>Алерт: ${pl[priority] || priority}</b>\n${SEP}\n✉️ Введите заголовок:`,
    { inline_keyboard: [[{ text: "✕ Отмена", callback_data: `${rp(user.roles)}:menu` }]] });
  await saveSession(chatId, user.user_id, "ALERT_TITLE", { ...session.context, alert_priority: priority }, session.message_id);
}

async function saveAlert(chatId: number, user: BotUser, session: any, title: string) {
  const ctx = session.context;
  const { error } = await db.from("alerts").insert({
    title, priority: ctx.alert_priority || "normal", type: ctx.alert_priority === "critical" ? "danger" : "warning",
    project_id: ctx.project_id, created_by: user.user_id, is_read: false, is_resolved: false,
  });
  const prefix = rp(user.roles);
  const text = error ? `❌ Ошибка: ${error.message}` : `✅ <b>Алерт создан</b>\n${SEP}\n"${title}"\nПриоритет: ${ctx.alert_priority}`;
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [[{ text: "◀️ Меню", callback_data: `${prefix}:menu` }]] });
  if (!error) {
    await audit(chatId, user.user_id, "alert:create", { title, priority: ctx.alert_priority });
    await db.from("bot_event_queue").insert({
      event_type: "alert.created", target_roles: ["director", "pm"], project_id: ctx.project_id,
      priority: ctx.alert_priority === "critical" ? "critical" : "high",
      payload: { title, priority: ctx.alert_priority, creator: user.display_name },
      scheduled_at: new Date().toISOString(),
    });
  }
  await clearSession(chatId);
}

// ── Daily log creation (foreman) ────────────────────────────
async function screenLogZone(chatId: number, user: BotUser, session: any) {
  await tgEdit(chatId, session.message_id, `📝 <b>Новая запись</b>\n${SEP}\nВведите название зоны / участка:`,
    { inline_keyboard: [[{ text: "✕ Отмена", callback_data: "f:menu" }]] });
  await saveSession(chatId, user.user_id, "LOG_ZONE", session.context, session.message_id);
}
async function screenLogWorks(chatId: number, user: BotUser, session: any) {
  await tgEdit(chatId, session.message_id, `📝 <b>Журнал · ${session.context.log_zone || ""}</b>\n${SEP}\n✏️ Опишите выполненные работы:`,
    { inline_keyboard: [[{ text: "✕ Отмена", callback_data: "f:menu" }]] });
  await saveSession(chatId, user.user_id, "LOG_WORKS", session.context, session.message_id);
}
async function screenLogWorkers(chatId: number, user: BotUser, session: any) {
  await tgEdit(chatId, session.message_id, `📝 <b>Журнал</b>\n${SEP}\n👷 Количество рабочих?`, { inline_keyboard: [
    [3,5,8,10].map(n => ({ text: String(n), callback_data: `log:w:${n}` })),
    [15,20,25,30].map(n => ({ text: String(n), callback_data: `log:w:${n}` })),
    [{ text: "✕ Отмена", callback_data: "f:menu" }],
  ] });
  await saveSession(chatId, user.user_id, "LOG_WORKERS", session.context, session.message_id);
}
async function saveLogEntry(chatId: number, user: BotUser, session: any, workers: number) {
  const ctx = session.context;
  await db.from("daily_logs").insert({ project_id: ctx.project_id, zone_name: ctx.log_zone || null, works_description: ctx.log_works, workers_count: workers, submitted_by: user.user_id, status: "submitted" });
  await audit(chatId, user.user_id, "daily_log:submit", { zone: ctx.log_zone, workers });
  await tgEdit(chatId, session.message_id, `✅ <b>Запись сохранена</b>\n${SEP}\n📍 ${ctx.log_zone || "—"}\n📝 ${ctx.log_works?.slice(0, 80)}\n👷 ${workers} чел.`,
    { inline_keyboard: [[{ text: "📋 Журналы", callback_data: `f:logs` }], [{ text: "◀️ Меню", callback_data: "f:menu" }]] });
  await clearSession(chatId);
}

// ══════════════════════════════════════════════════════════════
// ROLE MENUS
// ══════════════════════════════════════════════════════════════

// ── Director ────────────────────────────────────────────────
async function screenDirectorMenu(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  const project = projectId ? await getProject(projectId) : (await getProjects())[0];
  let text = `👔 <b>${user.display_name}</b> · Директор\n${SEP}\n📅 ${todayStr()}\n\n`;
  const ctx: any = { project_id: project?.id, project_name: project?.name };
  if (project) {
    const pf = await getTodayPlanFact(project.id);
    const alerts = await getOpenAlerts(project.id);
    text += `🏗️ <b>${project.name}</b>\n`;
    text += pf.count > 0 ? `${progressBar(pf.pct)} <b>${pf.pct}%</b> сегодня\n` : `📊 Отчётов сегодня нет\n`;
    if (alerts.counts.total > 0) { text += `🔔 Алертов: <b>${alerts.counts.total}</b>`; if (alerts.counts.critical > 0) text += ` 🔴 крит: <b>${alerts.counts.critical}</b>`; text += "\n"; }
  }
  await sendOrEdit(chatId, session, user.user_id, text, [
    [{ text: "📊 Портфель", callback_data: "d:portfolio" }, { text: "📈 KPI", callback_data: "d:kpi" }],
    [{ text: "🔴 Критические", callback_data: "d:critical" }, { text: "💰 Финансы", callback_data: "d:finance" }],
    [{ text: "🔔 Алерты", callback_data: "d:alerts" }, { text: "📝 Согласования", callback_data: "d:approvals" }],
    [{ text: "📂 Сменить проект", callback_data: "proj:list" }, { text: "⚙️ Настройки", callback_data: "c:settings" }],
    [{ text: "🚀 Открыть приложение", web_app: { url: APP_URL } }],
  ], "IDLE", ctx);
}

async function screenPortfolio(chatId: number, user: BotUser, session: any) {
  const projects = await getProjects();
  let text = `📊 <b>Портфель проектов</b>\n${SEP}\n`;
  for (const p of projects) {
    const pf = await getTodayPlanFact(p.id);
    const alerts = await getOpenAlerts(p.id);
    text += `🏗️ <b>${p.name}</b>\n${progressBar(pf.pct)} ${pf.pct}%`;
    if (alerts.counts.critical > 0) text += ` ⚠️`;
    text += `\n\n`;
  }
  text += `Всего: ${projects.length} активных`;
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "📉 Отклонения от ГПР", callback_data: "d:critical" }],
    [{ text: "◀️ Назад", callback_data: "d:menu" }],
  ] });
}

async function screenKPI(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  let text = `📈 <b>KPI по отделам</b>\n${SEP}\n`;
  if (projectId) {
    const deficit = await getDeficitMaterials(projectId);
    const alerts = await getOpenAlerts(projectId);
    const pf = await getTodayPlanFact(projectId);
    text += `📐 Проектный: ${alerts.counts.total === 0 ? "✅ без замечаний" : `⚠️ ${alerts.counts.total} алертов`}\n`;
    text += `📦 Снабжение: ${deficit.length > 0 ? `⚠️ ${deficit.length} позиций с дефицитом` : "✅ в норме"}\n`;
    text += `🏗️ Монтаж: ${pf.count > 0 ? `${pf.pct}% выполнения` : "нет данных"}\n`;
  } else { text += "Выберите проект для просмотра KPI"; }
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "📦 Снабжение", callback_data: "d:supply" }],
    [{ text: "◀️ Назад", callback_data: "d:menu" }],
  ] });
}

async function screenCritical(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) return screenDirectorMenu(chatId, user, session);
  const { list } = await getOpenAlerts(projectId, 5);
  const critical = list.filter((a: any) => a.priority === "critical" || a.priority === "high");
  let text = `🔴 <b>Критические отклонения</b>\n${SEP}\n`;
  if (critical.length === 0) { text += "✅ Нет критических отклонений"; }
  else {
    for (const a of critical) {
      text += `${pe[a.priority]} ${a.title}\n`;
      if (a.floor_number) text += `   Этаж ${a.floor_number}\n`;
      text += "\n";
    }
  }
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "🔔 Все алерты", callback_data: "d:alerts" }],
    [{ text: "◀️ Назад", callback_data: "d:menu" }],
  ] });
}

async function screenFinance(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  const project = projectId ? await getProject(projectId) : null;
  let text = `💰 <b>Финансовый обзор</b>\n${SEP}\n`;
  if (project) {
    const pf = await getTodayPlanFact(project.id);
    text += `🏗️ ${project.name}\n📊 Прогресс: ${pf.pct}%\n\n<i>Детальная финансовая аналитика доступна в приложении</i>`;
  } else { text += "Выберите проект"; }
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "📊 В приложении", web_app: { url: APP_URL } }],
    [{ text: "◀️ Назад", callback_data: "d:menu" }],
  ] });
}

// ── PM ──────────────────────────────────────────────────────
async function screenPMMenu(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  const project = projectId ? await getProject(projectId) : (await getProjects())[0];
  let text = `📋 <b>${user.display_name}</b> · РП\n${SEP}\n📅 ${todayStr()}\n\n`;
  const ctx: any = { project_id: project?.id, project_name: project?.name };
  if (project) {
    const pf = await getTodayPlanFact(project.id);
    const alerts = await getOpenAlerts(project.id);
    const inboxCount = await getInboxCount(project.id, "pm");
    text += `🏗️ ${project.name}\n`;
    if (pf.count > 0) text += `${progressBar(pf.pct)} <b>${pf.pct}%</b> сегодня\n`;
    if (inboxCount > 0) text += `📥 Входящих: <b>${inboxCount}</b>\n`;
    if (alerts.counts.total > 0) text += `🔔 Алертов: <b>${alerts.counts.total}</b>\n`;
  }
  await sendOrEdit(chatId, session, user.user_id, text, [
    [{ text: "📥 Входящие", callback_data: "pm:inbox" }, { text: "📤 Отправить", callback_data: "pm:send" }],
    [{ text: "📊 Дашборд", callback_data: "pm:dash" }, { text: "🔔 Алерты", callback_data: "pm:alerts" }],
    [{ text: "📋 Задачи", callback_data: "pm:tasks" }, { text: "⚡ Быстрые", callback_data: "pm:quick" }],
    [{ text: "📂 Проект", callback_data: "proj:list" }, { text: "⚙️ Настройки", callback_data: "c:settings" }],
    [{ text: "🚀 Открыть приложение", web_app: { url: APP_URL } }],
  ], "IDLE", ctx);
}

async function screenPMSend(chatId: number, user: BotUser, session: any) {
  await tgEdit(chatId, session.message_id, `📤 <b>РП · Отправить</b>\n${SEP}\nВыберите категорию:`, { inline_keyboard: [
    [{ text: "🚀 Запуск проекта", callback_data: "pm:s:launch" }],
    [{ text: "📐 Проектные работы", callback_data: "pm:s:design" }],
    [{ text: "📦 Снабжение", callback_data: "pm:s:supply" }],
    [{ text: "🏭 Производство", callback_data: "pm:s:prod" }],
    [{ text: "◀️ Назад", callback_data: "pm:menu" }],
  ] });
}

async function screenPMSendLaunch(chatId: number, user: BotUser, session: any) {
  await tgEdit(chatId, session.message_id, `🚀 <b>Запуск проекта</b>\n${SEP}`, { inline_keyboard: [
    [{ text: "📋 Составить ГПР", callback_data: "pm:doc:gpr" }],
    [{ text: "📨 Разослать ГПР", callback_data: "pm:doc:gpr_send" }],
    [{ text: "👤 Назначить ответственных", callback_data: "pm:doc:assign" }],
    [{ text: "📄 Подготовить ИРД", callback_data: "pm:doc:ird" }],
    [{ text: "◀️ Назад", callback_data: "pm:send" }],
  ] });
}

async function screenPMSendDesign(chatId: number, user: BotUser, session: any) {
  await tgEdit(chatId, session.message_id, `📐 <b>Проектные работы</b>\n${SEP}`, { inline_keyboard: [
    [{ text: "📄 Запрос документации", callback_data: "pm:doc:docreq" }],
    [{ text: "✅ Согласование образцов", callback_data: "pm:doc:samples" }],
    [{ text: "📏 Геодезическая съёмка", callback_data: "pm:doc:geodesy" }],
    [{ text: "◀️ Назад", callback_data: "pm:send" }],
  ] });
}

async function screenPMQuick(chatId: number, user: BotUser, session: any) {
  await tgEdit(chatId, session.message_id, `⚡ <b>Быстрые действия</b>\n${SEP}`, { inline_keyboard: [
    [{ text: "⏰ Напоминание отделу", callback_data: "pm:doc:remind" }],
    [{ text: "🔴 Эскалация", callback_data: "pm:doc:escalate" }],
    [{ text: "📸 Запросить фотоотчёт", callback_data: "pm:doc:photoreq" }],
    [{ text: "📊 Сводка для директора", callback_data: "pm:doc:summary" }],
    [{ text: "◀️ Назад", callback_data: "pm:menu" }],
  ] });
}

// ── OPR ─────────────────────────────────────────────────────
async function screenOPRMenu(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  const project = projectId ? await getProject(projectId) : (await getProjects())[0];
  const ctx: any = { project_id: project?.id, project_name: project?.name };
  const inboxCount = project ? await getInboxCount(project.id, "project_opr") : 0;
  let text = `📐 <b>${user.display_name}</b> · ОПР\n${SEP}\n`;
  if (project) { text += `📍 ${project.name}\n`; if (inboxCount > 0) text += `📥 Входящих: <b>${inboxCount}</b>\n`; }
  await sendOrEdit(chatId, session, user.user_id, text, [
    [{ text: `📥 Входящие${inboxCount ? ` (${inboxCount})` : ""}`, callback_data: "opr:inbox" }],
    [{ text: "📤 Отправить", callback_data: "opr:send" }],
    [{ text: "📊 Мой прогресс", callback_data: "opr:progress" }],
    [{ text: "📂 Сменить проект", callback_data: "proj:list" }],
    [{ text: "🚀 Открыть приложение", web_app: { url: APP_URL } }],
  ], "IDLE", ctx);
}

async function screenOPRSend(chatId: number, user: BotUser, session: any) {
  await tgEdit(chatId, session.message_id, `📤 <b>ОПР · Документация</b>\n${SEP}`, { inline_keyboard: [
    [{ text: "🔧 Определение системы", callback_data: "opr:doc:system" }],
    [{ text: "📊 Расчёты", callback_data: "opr:doc:calc" }],
    [{ text: "🔩 Узловые решения", callback_data: "opr:doc:nodes" }],
    [{ text: "🏢 Фасады и планы", callback_data: "opr:doc:facades" }],
    [{ text: "◀️ Назад", callback_data: "opr:menu" }],
  ] });
}

// ── KM ──────────────────────────────────────────────────────
async function screenKMMenu(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  const project = projectId ? await getProject(projectId) : (await getProjects())[0];
  const ctx: any = { project_id: project?.id, project_name: project?.name };
  const inboxCount = project ? await getInboxCount(project.id, "project_km") : 0;
  let text = `📏 <b>${user.display_name}</b> · КМ\n${SEP}\n`;
  if (project) { text += `📍 ${project.name}\n`; if (inboxCount > 0) text += `📥 Входящих: <b>${inboxCount}</b>\n`; }
  await sendOrEdit(chatId, session, user.user_id, text, [
    [{ text: `📥 Входящие${inboxCount ? ` (${inboxCount})` : ""}`, callback_data: "km:inbox" }],
    [{ text: "📤 Отправить", callback_data: "km:send" }],
    [{ text: "📊 Мой прогресс", callback_data: "km:progress" }],
    [{ text: "📂 Сменить проект", callback_data: "proj:list" }],
    [{ text: "🚀 Открыть приложение", web_app: { url: APP_URL } }],
  ], "IDLE", ctx);
}

async function screenKMSend(chatId: number, user: BotUser, session: any) {
  await tgEdit(chatId, session.message_id, `📤 <b>КМ · Документация</b>\n${SEP}`, { inline_keyboard: [
    [{ text: "📋 Деталировка фасадов", callback_data: "km:doc:detail" }],
    [{ text: "📦 Спецификации → Снабж.", callback_data: "km:doc:spec" }],
    [{ text: "📊 ВОР → РП", callback_data: "km:doc:vor" }],
    [{ text: "🔩 ТЗ на сопутствующие", callback_data: "km:doc:tz" }],
    [{ text: "◀️ Назад", callback_data: "km:menu" }],
  ] });
}

// ── KMD ─────────────────────────────────────────────────────
async function screenKMDMenu(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  const project = projectId ? await getProject(projectId) : (await getProjects())[0];
  const ctx: any = { project_id: project?.id, project_name: project?.name };
  const inboxCount = project ? await getInboxCount(project.id, "project_kmd") : 0;
  let text = `✏️ <b>${user.display_name}</b> · КМД\n${SEP}\n`;
  if (project) { text += `📍 ${project.name}\n`; if (inboxCount > 0) text += `📥 Входящих: <b>${inboxCount}</b>\n`; }
  await sendOrEdit(chatId, session, user.user_id, text, [
    [{ text: `📥 Входящие${inboxCount ? ` (${inboxCount})` : ""}`, callback_data: "kmd:inbox" }],
    [{ text: "📤 Отправить", callback_data: "kmd:send" }],
    [{ text: "📊 Мой прогресс", callback_data: "kmd:progress" }],
    [{ text: "📂 Сменить проект", callback_data: "proj:list" }],
    [{ text: "🚀 Открыть приложение", web_app: { url: APP_URL } }],
  ], "IDLE", ctx);
}

async function screenKMDSend(chatId: number, user: BotUser, session: any) {
  await tgEdit(chatId, session.message_id, `📤 <b>КМД · Документация</b>\n${SEP}`, { inline_keyboard: [
    [{ text: "📐 Наложение геодезии", callback_data: "kmd:doc:geo" }],
    [{ text: "🔩 Чертежи кронштейнов", callback_data: "kmd:doc:brackets" }],
    [{ text: "📋 КМД → Производство", callback_data: "kmd:doc:kmd" }],
    [{ text: "🪟 Заявка на заполнения", callback_data: "kmd:doc:glass" }],
    [{ text: "◀️ Назад", callback_data: "kmd:menu" }],
  ] });
}

// ── Supply ──────────────────────────────────────────────────
async function screenSupplyMenu(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  const project = projectId ? await getProject(projectId) : (await getProjects())[0];
  const ctx: any = { project_id: project?.id, project_name: project?.name };
  const inboxCount = project ? await getInboxCount(project.id, "supply") : 0;
  const deficit = project ? await getDeficitMaterials(project.id) : [];
  let text = `📦 <b>${user.display_name}</b> · Снабжение\n${SEP}\n`;
  if (project) {
    text += `📍 ${project.name}\n`;
    if (inboxCount > 0) text += `📥 Входящих: <b>${inboxCount}</b>\n`;
    if (deficit.length > 0) text += `🔴 Дефицит: <b>${deficit.length}</b> позиций\n`;
  }
  await sendOrEdit(chatId, session, user.user_id, text, [
    [{ text: `📥 Входящие${inboxCount ? ` (${inboxCount})` : ""}`, callback_data: "sup:inbox" }],
    [{ text: "📤 Отправить", callback_data: "sup:send" }],
    [{ text: "📊 Статус закупок", callback_data: "sup:status" }],
    [{ text: "🔴 Дефицит", callback_data: "sup:deficit" }],
    [{ text: "🚀 Открыть приложение", web_app: { url: APP_URL } }],
  ], "IDLE", ctx);
}

async function screenSupplySend(chatId: number, user: BotUser, session: any) {
  await tgEdit(chatId, session.message_id, `📤 <b>Снабжение · Отчёты</b>\n${SEP}`, { inline_keyboard: [
    [{ text: "📊 Статус закупки", callback_data: "sup:doc:status" }],
    [{ text: "🚚 Уведом. об отгрузке", callback_data: "sup:doc:shipment" }],
    [{ text: "⚠️ Отчёт о несхождениях", callback_data: "sup:doc:mismatch" }],
    [{ text: "🚛 Заявка на транспорт", callback_data: "sup:doc:transport" }],
    [{ text: "◀️ Назад", callback_data: "sup:menu" }],
  ] });
}

async function screenSupplyStatus(chatId: number, user: BotUser, session: any) {
  return screenSupply(chatId, user, session); // Reuses the shared supply view
}

async function screenSupplyDeficit(chatId: number, user: BotUser, session: any) {
  return screenSupply(chatId, user, session); // Reuses the shared supply view
}

// ── Production ──────────────────────────────────────────────
async function screenProductionMenu(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  const project = projectId ? await getProject(projectId) : (await getProjects())[0];
  const ctx: any = { project_id: project?.id, project_name: project?.name };
  const inboxCount = project ? await getInboxCount(project.id, "production") : 0;
  let text = `🏭 <b>${user.display_name}</b> · Производство\n${SEP}\n`;
  if (project) { text += `📍 ${project.name}\n`; if (inboxCount > 0) text += `📥 Входящих: <b>${inboxCount}</b>\n`; }
  await sendOrEdit(chatId, session, user.user_id, text, [
    [{ text: `📥 Входящие${inboxCount ? ` (${inboxCount})` : ""}`, callback_data: "prod:inbox" }],
    [{ text: "📤 Отправить", callback_data: "prod:send" }],
    [{ text: "📊 Загрузка", callback_data: "prod:load" }],
    [{ text: "📂 Сменить проект", callback_data: "proj:list" }],
    [{ text: "🚀 Открыть приложение", web_app: { url: APP_URL } }],
  ], "IDLE", ctx);
}

async function screenProductionSend(chatId: number, user: BotUser, session: any) {
  await tgEdit(chatId, session.message_id, `📤 <b>Производство · Отчёты</b>\n${SEP}`, { inline_keyboard: [
    [{ text: "🏭 КП + ГПР", callback_data: "prod:doc:kp" }],
    [{ text: "✅ Подтверждение приёмки", callback_data: "prod:doc:accept" }],
    [{ text: "📋 Мягкая накладная", callback_data: "prod:doc:waybill" }],
    [{ text: "📦 Отчёт об остатках", callback_data: "prod:doc:stock" }],
    [{ text: "◀️ Назад", callback_data: "prod:menu" }],
  ] });
}

async function screenProductionLoad(chatId: number, user: BotUser, session: any) {
  return screenDashboard(chatId, user, session); // Reuse dashboard for load view
}

// ── Foreman ─────────────────────────────────────────────────
async function screenForemanMenu(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  const project = projectId ? await getProject(projectId) : (await getProjects())[0];
  let text = `🏗️ <b>${user.display_name}</b> · Прораб\n${SEP}\n📅 ${todayStr()}\n\n`;
  const ctx: any = { project_id: project?.id, project_name: project?.name };
  if (project) {
    text += `🏗️ ${project.name}\n`;
    const pf = await getTodayPlanFact(project.id);
    const inboxCount = await getInboxCount(project.id, "foreman");
    text += pf.count > 0 ? `${progressBar(pf.pct)} <b>${pf.pct}%</b> сегодня\n` : `⚠️ <b>Отчёт за сегодня не подан</b>\n`;
    if (inboxCount > 0) text += `📥 Входящих: <b>${inboxCount}</b>\n`;
  }
  await sendOrEdit(chatId, session, user.user_id, text, [
    [{ text: "📥 Входящие", callback_data: "f:inbox" }, { text: "📤 Отправить", callback_data: "f:send" }],
    [{ text: "📋 Подать отчёт", callback_data: "f:report" }],
    [{ text: "📸 Фотоотчёт", callback_data: "f:photo" }, { text: "📊 Прогресс", callback_data: "f:progress" }],
    [{ text: "📂 Проект", callback_data: "proj:list" }, { text: "⚙️ Настройки", callback_data: "c:settings" }],
    [{ text: "🚀 Открыть приложение", web_app: { url: APP_URL } }],
  ], "IDLE", ctx);
}

async function screenForemanSend(chatId: number, user: BotUser, session: any) {
  await tgEdit(chatId, session.message_id, `📤 <b>Прораб · Отчёты</b>\n${SEP}`, { inline_keyboard: [
    [{ text: "🔧 Заявка на инструмент", callback_data: "f:doc:tool" }],
    [{ text: "📸 Фотоотчёт ежедневный", callback_data: "f:doc:daily" }],
    [{ text: "📄 Акт скрытых работ", callback_data: "f:doc:hidden" }],
    [{ text: "⚠️ Проблема на площадке", callback_data: "f:doc:issue" }],
    [{ text: "◀️ Назад", callback_data: "f:menu" }],
  ] });
}

async function screenForemanPhoto(chatId: number, user: BotUser, session: any) {
  await tgEdit(chatId, session.message_id, `📸 <b>Фотоотчёт</b>\n${SEP}\nВыберите тип:`, { inline_keyboard: [
    [{ text: "📷 Ежедневный отчёт", callback_data: "f:doc:daily" }],
    [{ text: "📷 Этапный (кронштейны)", callback_data: "f:doc:stage_br" }],
    [{ text: "📷 Этапный (каркас)", callback_data: "f:doc:stage_fr" }],
    [{ text: "📷 Этапный (заполнение)", callback_data: "f:doc:stage_gl" }],
    [{ text: "◀️ Назад", callback_data: "f:menu" }],
  ] });
}

// Foreman report flow (existing v3 logic preserved)
async function screenForemanReportFacade(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) return screenForemanMenu(chatId, user, session);
  const facades = await getFacades(projectId);
  const buttons = facades.map((f: any) => [{ text: `${f.name} (${f.total_modules} мод.)`, callback_data: `f:rf:${f.id}` }]);
  buttons.push([{ text: "✕ Отмена", callback_data: "f:menu" }]);
  await tgEdit(chatId, session.message_id, `📋 <b>Отчёт — выбор фасада</b>\n${SEP}\nВыберите фасад:`, { inline_keyboard: buttons });
  await saveSession(chatId, user.user_id, "REPORT_FACADE", { project_id: projectId }, session.message_id);
}

async function screenForemanReportFloor(chatId: number, user: BotUser, session: any, facadeId: string) {
  const { data: facade } = await db.from("facades").select("name").eq("id", facadeId).maybeSingle();
  const { data: floors } = await db.from("floors").select("id, floor_number, modules_plan, modules_fact, status")
    .eq("facade_id", facadeId).order("floor_number", { ascending: false }).limit(20);
  const rows: any[][] = [];
  for (let i = 0; i < (floors || []).length; i += 4) {
    rows.push((floors || []).slice(i, i + 4).map((fl: any) => {
      const icon = fl.status === "done" ? "✅" : fl.status === "in_progress" ? "🔄" : "⬜";
      return { text: `${icon}${fl.floor_number}`, callback_data: `f:rfl:${fl.id}` };
    }));
  }
  rows.push([{ text: "◀️ Назад", callback_data: "f:report" }]);
  await tgEdit(chatId, session.message_id, `📋 <b>Отчёт · ${facade?.name}</b>\n${SEP}\nВыберите этаж:`, { inline_keyboard: rows });
  await saveSession(chatId, user.user_id, "REPORT_FLOOR", { ...session.context, facade_id: facadeId, facade_name: facade?.name }, session.message_id);
}

async function screenForemanReportInput(chatId: number, user: BotUser, session: any, floorId: string) {
  const { data: floor } = await db.from("floors").select("floor_number, modules_plan, modules_fact").eq("id", floorId).maybeSingle();
  if (!floor) return;
  const remaining = Math.max(0, (floor.modules_plan || 0) - (floor.modules_fact || 0));
  await tgEdit(chatId, session.message_id,
    `📋 <b>Ввод факта</b>\n${SEP}\nФасад: ${session.context.facade_name}\nЭтаж: <b>${floor.floor_number}</b>\n\nПлан: ${floor.modules_plan}\nФакт: ${floor.modules_fact}\nОсталось: <b>${remaining}</b>\n\n✏️ Кол-во модулей за сегодня:`,
    { inline_keyboard: [
      [5,10,15,20].map(n => ({ text: String(n), callback_data: `f:rv:${n}` })),
      [25,30,40,50].map(n => ({ text: String(n), callback_data: `f:rv:${n}` })),
      [{ text: "✕ Отмена", callback_data: "f:menu" }],
    ] });
  await saveSession(chatId, user.user_id, "REPORT_INPUT", {
    ...session.context, floor_id: floorId, floor_number: floor.floor_number,
    modules_plan: floor.modules_plan, modules_fact: floor.modules_fact,
  }, session.message_id);
}

async function screenForemanReportConfirm(chatId: number, user: BotUser, session: any, value: number) {
  const ctx = session.context;
  await tgEdit(chatId, session.message_id, `📋 <b>Подтверждение</b>\n${SEP}\nФасад: ${ctx.facade_name}\nЭтаж: <b>${ctx.floor_number}</b>\nФакт: <b>${value} мод.</b>\n\nСохранить?`,
    { inline_keyboard: [
      [{ text: "✅ Сохранить", callback_data: `f:rs:${value}` }, { text: "✏️ Изменить", callback_data: `f:rf:${ctx.facade_id}` }],
      [{ text: "✕ Отмена", callback_data: "f:menu" }],
    ] });
}

async function saveForemanReport(chatId: number, user: BotUser, session: any, value: number) {
  const ctx = session.context;
  const today = new Date().toISOString().split("T")[0];
  const weekNum = Math.ceil(new Date().getDate() / 7);
  await db.from("plan_fact").insert({
    project_id: ctx.project_id, facade_id: ctx.facade_id, floor_id: ctx.floor_id,
    week_number: weekNum, date: today, plan_value: 0, fact_value: value,
    reported_by: user.user_id, input_type: "bot",
  });
  const newFact = (ctx.modules_fact || 0) + value;
  const newStatus = newFact >= (ctx.modules_plan || 0) ? "done" : "in_progress";
  await db.from("floors").update({ modules_fact: newFact, status: newStatus }).eq("id", ctx.floor_id);
  await audit(chatId, user.user_id, "report:submit", { floor_id: ctx.floor_id, value });
  const pct = ctx.modules_plan > 0 ? Math.round((newFact / ctx.modules_plan) * 100) : 0;
  let text = `✅ <b>Отчёт сохранён</b>\n${SEP}\nФасад: ${ctx.facade_name}\nЭтаж ${ctx.floor_number}: +<b>${value}</b> мод.\n${progressBar(pct)} ${pct}%\n`;
  if (newStatus === "done") text += "\n✅ <b>Этаж завершён!</b>";
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "📋 Ещё этаж", callback_data: "f:report" }],
    [{ text: "◀️ Меню", callback_data: "f:menu" }],
  ] });
  await clearSession(chatId);
  if (ctx.project_id) {
    await db.from("bot_event_queue").insert({
      event_type: "report.submitted", target_roles: ["pm", "director"], project_id: ctx.project_id, priority: "normal",
      payload: { reporter_name: user.display_name, floor_number: ctx.floor_number, facade_name: ctx.facade_name, value, pct },
      scheduled_at: new Date().toISOString(),
    });
  }
}

async function screenForemanProgress(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) return screenForemanMenu(chatId, user, session);
  const facades = await getFacades(projectId);
  let text = `📊 <b>Прогресс</b>\n${SEP}\n📅 ${todayStr()}\n\n`;
  for (const f of facades) {
    const s = await getFacadeStats(f.id);
    text += `<b>${f.name}</b>: ${progressBar(s.pct)} ${s.pct}%\n  ${s.totalFact}/${s.totalPlan} мод.\n\n`;
  }
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [[{ text: "◀️ Меню", callback_data: "f:menu" }]] });
}

// ── PTO ─────────────────────────────────────────────────────
async function screenPTOMenu(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  const project = projectId ? await getProject(projectId) : (await getProjects())[0];
  const ctx: any = { project_id: project?.id, project_name: project?.name };
  const inboxCount = project ? await getInboxCount(project.id, "pto") : 0;
  let text = `📁 <b>${user.display_name}</b> · ПТО\n${SEP}\n`;
  if (project) { text += `📍 ${project.name}\n`; if (inboxCount > 0) text += `📥 Входящих: <b>${inboxCount}</b>\n`; }
  await sendOrEdit(chatId, session, user.user_id, text, [
    [{ text: `📥 Входящие${inboxCount ? ` (${inboxCount})` : ""}`, callback_data: "pto:inbox" }],
    [{ text: "📤 Отправить АОСР", callback_data: "pto:send" }],
    [{ text: "📊 Реестр документов", callback_data: "pto:registry" }],
    [{ text: "📂 Сменить проект", callback_data: "proj:list" }],
    [{ text: "🚀 Открыть приложение", web_app: { url: APP_URL } }],
  ], "IDLE", ctx);
}

async function screenPTOSend(chatId: number, user: BotUser, session: any) {
  await tgEdit(chatId, session.message_id, `📤 <b>ПТО · Исп. документация</b>\n${SEP}`, { inline_keyboard: [
    [{ text: "🔩 АОСР Кронштейны", callback_data: "pto:doc:brackets" }],
    [{ text: "🏗️ АОСР Каркас", callback_data: "pto:doc:frame" }],
    [{ text: "🪟 АОСР Заполнение", callback_data: "pto:doc:glass" }],
    [{ text: "📋 Исполнительные схемы", callback_data: "pto:doc:schemes" }],
    [{ text: "◀️ Назад", callback_data: "pto:menu" }],
  ] });
}

async function screenPTORegistry(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  let text = `📊 <b>Реестр документов</b>\n${SEP}\n`;
  if (projectId) {
    const { count } = await db.from("documents").select("*", { count: "exact", head: true }).eq("project_id", projectId);
    text += `Всего документов: <b>${count || 0}</b>\n\n<i>Полный реестр доступен в приложении</i>`;
  } else { text += "Выберите проект"; }
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "🚀 В приложении", web_app: { url: APP_URL } }],
    [{ text: "◀️ Назад", callback_data: "pto:menu" }],
  ] });
}

// ── Inspector ───────────────────────────────────────────────
async function screenInspectorMenu(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  const project = projectId ? await getProject(projectId) : (await getProjects())[0];
  const ctx: any = { project_id: project?.id, project_name: project?.name };
  const inboxCount = project ? await getInboxCount(project.id, "inspector") : 0;
  let text = `🔍 <b>${user.display_name}</b> · Технадзор\n${SEP}\n`;
  if (project) { text += `📍 ${project.name}\n`; if (inboxCount > 0) text += `📥 Входящих: <b>${inboxCount}</b>\n`; }
  await sendOrEdit(chatId, session, user.user_id, text, [
    [{ text: `📥 Входящие${inboxCount ? ` (${inboxCount})` : ""}`, callback_data: "insp:inbox" }],
    [{ text: "📤 Предписание", callback_data: "insp:send" }],
    [{ text: "✅ Приёмка этапа", callback_data: "insp:accept" }],
    [{ text: "📊 История проверок", callback_data: "insp:history" }],
    [{ text: "🚀 Открыть приложение", web_app: { url: APP_URL } }],
  ], "IDLE", ctx);
}

async function screenInspectorSend(chatId: number, user: BotUser, session: any) {
  await tgEdit(chatId, session.message_id, `📤 <b>Предписание</b>\n${SEP}\nВыберите тип:`, { inline_keyboard: [
    [{ text: "⚠️ Замечание по качеству", callback_data: "insp:doc:quality" }],
    [{ text: "🛑 Остановка работ", callback_data: "insp:doc:stop" }],
    [{ text: "📸 Фотофиксация", callback_data: "insp:doc:photo" }],
    [{ text: "◀️ Назад", callback_data: "insp:menu" }],
  ] });
}

async function screenInspectorAccept(chatId: number, user: BotUser, session: any) {
  return screenFacades(chatId, user, session); // Reuse facades for stage acceptance
}

async function screenInspectorHistory(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  let text = `📊 <b>История проверок</b>\n${SEP}\n`;
  if (projectId) {
    const { data } = await db.from("bot_documents").select("doc_type, comment, created_at")
      .eq("project_id", projectId).eq("sender_id", user.user_id).order("created_at", { ascending: false }).limit(10);
    if (!data || data.length === 0) { text += "Нет записей"; }
    else {
      for (const d of data) {
        text += `📋 ${d.doc_type} · ${new Date(d.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}\n`;
        if (d.comment) text += `   <i>${d.comment.slice(0, 50)}</i>\n`;
      }
    }
  } else { text += "Выберите проект"; }
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "◀️ Назад", callback_data: "insp:menu" }],
  ] });
}

// ── Generic (fallback) ──────────────────────────────────────
async function screenGenericMenu(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  const project = projectId ? await getProject(projectId) : (await getProjects())[0];
  const ctx: any = { project_id: project?.id, project_name: project?.name };
  let text = `👤 <b>${user.display_name}</b> · ${user.roles.join(", ") || "Сотрудник"}\n${SEP}\n📅 ${todayStr()}\n\n`;
  if (project) text += `🏗️ ${project.name}\n`;
  await sendOrEdit(chatId, session, user.user_id, text, [
    [{ text: "📊 Дашборд", callback_data: "g:dash" }, { text: "🔔 Алерты", callback_data: "g:alerts" }],
    [{ text: "📋 Задачи", callback_data: "g:tasks" }, { text: "📋 Журналы", callback_data: "g:logs" }],
    [{ text: "📂 Проект", callback_data: "proj:list" }, { text: "⚙️ Настройки", callback_data: "c:settings" }],
    [{ text: "🚀 Открыть приложение", web_app: { url: APP_URL } }],
  ], "IDLE", ctx);
}

// ── Progress screen (shared for OPR/KM/KMD) ────────────────
async function screenProgress(chatId: number, user: BotUser, session: any, prefix: string) {
  const projectId = session?.context?.project_id;
  if (!projectId) return routeToMenu(chatId, user, session);
  const tasks = await getMyTasks(user.user_id, projectId, 10);
  let text = `📊 <b>Мой прогресс</b>\n${SEP}\n`;
  if (tasks.length === 0) { text += "✅ Нет активных задач"; }
  else {
    const done = tasks.filter((t: any) => t.status === "Выполнено").length;
    text += `Задач: ${tasks.length} · Выполнено: ${done}\n\n`;
    for (const t of tasks.slice(0, 5)) {
      const si: Record<string, string> = { "В работе": "🔄", "Ожидание": "⏳" };
      text += `${si[t.status] || "⏳"} [${t.code}] ${t.name}\n`;
    }
  }
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "🚀 В приложении", web_app: { url: APP_URL } }],
    [{ text: "◀️ Меню", callback_data: `${prefix}:menu` }],
  ] });
}

// ── Unknown user ────────────────────────────────────────────
async function screenUnknownUser(chatId: number, firstName: string) {
  await tgSend(chatId, `👋 <b>Добро пожаловать, ${firstName}!</b>\n${SEP}\nЭто бот STSphera.\n\nВаш Telegram не привязан.\nВойдите в приложение → ⚙️ Настройки → привяжите Telegram.\n\nChat ID: <code>${chatId}</code>`,
    { inline_keyboard: [[{ text: "🚀 Открыть STSphera", web_app: { url: APP_URL } }]] });
}

// ── Route to correct menu by role ───────────────────────────
function routeToMenu(chatId: number, user: BotUser, session: any) {
  const primary = detectPrimaryRole(user.roles);
  switch (primary) {
    case "director": return screenDirectorMenu(chatId, user, session);
    case "pm": return screenPMMenu(chatId, user, session);
    case "project_opr": return screenOPRMenu(chatId, user, session);
    case "project_km": return screenKMMenu(chatId, user, session);
    case "project_kmd": return screenKMDMenu(chatId, user, session);
    case "supply": return screenSupplyMenu(chatId, user, session);
    case "production": return screenProductionMenu(chatId, user, session);
    case "foreman1": case "foreman2": case "foreman3": return screenForemanMenu(chatId, user, session);
    case "pto": return screenPTOMenu(chatId, user, session);
    case "inspector": return screenInspectorMenu(chatId, user, session);
    default: return screenGenericMenu(chatId, user, session);
  }
}

// ── Doc FSM routing (maps callback to FSM start) ────────────
const DOC_FSM_MAP: Record<string, { label: string; recipients: string[] }> = {
  // PM docs
  "pm:doc:gpr": { label: "ГПР", recipients: ["project_opr", "project_km", "project_kmd", "supply", "production", "foreman1", "pto"] },
  "pm:doc:gpr_send": { label: "Рассылка ГПР", recipients: ["project_opr", "project_km", "project_kmd", "supply", "production"] },
  "pm:doc:assign": { label: "Назначение ответственных", recipients: ["director"] },
  "pm:doc:ird": { label: "ИРД", recipients: ["director", "pto"] },
  "pm:doc:docreq": { label: "Запрос документации", recipients: ["project_opr", "project_km", "project_kmd"] },
  "pm:doc:samples": { label: "Согласование образцов", recipients: ["supply", "production"] },
  "pm:doc:geodesy": { label: "Геодезическая съёмка", recipients: ["project_kmd"] },
  "pm:doc:remind": { label: "Напоминание отделу", recipients: ["project_opr", "project_km", "project_kmd", "supply", "production"] },
  "pm:doc:escalate": { label: "Эскалация", recipients: ["director"] },
  "pm:doc:photoreq": { label: "Запрос фотоотчёта", recipients: ["foreman1", "foreman2", "foreman3"] },
  "pm:doc:summary": { label: "Сводка для директора", recipients: ["director"] },
  // OPR docs
  "opr:doc:system": { label: "Определение системы", recipients: ["pm"] },
  "opr:doc:calc": { label: "Расчёты", recipients: ["pm"] },
  "opr:doc:nodes": { label: "Узловые решения", recipients: ["pm", "production"] },
  "opr:doc:facades": { label: "Фасады и планы", recipients: ["pm", "project_km"] },
  // KM docs
  "km:doc:detail": { label: "Деталировка фасадов", recipients: ["pm", "project_kmd"] },
  "km:doc:spec": { label: "Спецификации", recipients: ["supply", "pm"] },
  "km:doc:vor": { label: "ВОР", recipients: ["pm"] },
  "km:doc:tz": { label: "ТЗ на сопутствующие", recipients: ["supply", "pm"] },
  // KMD docs
  "kmd:doc:geo": { label: "Наложение геодезии", recipients: ["pm"] },
  "kmd:doc:brackets": { label: "Чертежи кронштейнов", recipients: ["production", "pm"] },
  "kmd:doc:kmd": { label: "КМД", recipients: ["production", "pm"] },
  "kmd:doc:glass": { label: "Заявка на заполнения", recipients: ["supply", "pm"] },
  // Supply docs
  "sup:doc:status": { label: "Статус закупки", recipients: ["pm"] },
  "sup:doc:shipment": { label: "Уведомление об отгрузке", recipients: ["production", "pm"] },
  "sup:doc:mismatch": { label: "Отчёт о несхождениях", recipients: ["pm"] },
  "sup:doc:transport": { label: "Заявка на транспорт", recipients: ["pm", "production"] },
  // Production docs
  "prod:doc:kp": { label: "КП + ГПР", recipients: ["pm", "supply"] },
  "prod:doc:accept": { label: "Подтверждение приёмки", recipients: ["supply", "pm"] },
  "prod:doc:waybill": { label: "Мягкая накладная", recipients: ["pm"] },
  "prod:doc:stock": { label: "Отчёт об остатках", recipients: ["pm", "supply"] },
  // Foreman docs
  "f:doc:tool": { label: "Заявка на инструмент", recipients: ["pm", "supply"] },
  "f:doc:daily": { label: "Фотоотчёт ежедневный", recipients: ["pm"] },
  "f:doc:hidden": { label: "Акт скрытых работ", recipients: ["pto", "pm"] },
  "f:doc:issue": { label: "Проблема на площадке", recipients: ["pm"] },
  "f:doc:stage_br": { label: "Этапный: кронштейны", recipients: ["pm", "pto"] },
  "f:doc:stage_fr": { label: "Этапный: каркас", recipients: ["pm", "pto"] },
  "f:doc:stage_gl": { label: "Этапный: заполнение", recipients: ["pm", "pto"] },
  // PTO docs
  "pto:doc:brackets": { label: "АОСР Кронштейны", recipients: ["pm", "foreman1"] },
  "pto:doc:frame": { label: "АОСР Каркас", recipients: ["pm", "foreman1"] },
  "pto:doc:glass": { label: "АОСР Заполнение", recipients: ["pm", "foreman1"] },
  "pto:doc:schemes": { label: "Исполнительные схемы", recipients: ["pm"] },
  // Inspector docs
  "insp:doc:quality": { label: "Замечание по качеству", recipients: ["pm", "foreman1"] },
  "insp:doc:stop": { label: "Остановка работ", recipients: ["pm", "director", "foreman1"] },
  "insp:doc:photo": { label: "Фотофиксация нарушения", recipients: ["pm"] },
};

// ══════════════════════════════════════════════════════════════
// MAIN DISPATCHER
// ══════════════════════════════════════════════════════════════
async function handleUpdate(update: any) {
  // ── File uploads (for doc FSM) ────────────────────────────
  if (update.message && (update.message.document || update.message.photo)) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const user = await getUser(chatId);
    if (!user) return;
    const session = await getSession(chatId);
    if (!session || session.state !== "DOC_UPLOAD") return;

    await tgDeleteMsg(chatId, msg.message_id);
    let fileId: string;
    if (msg.document) { fileId = msg.document.file_id; }
    else { fileId = msg.photo[msg.photo.length - 1].file_id; }
    // Get file URL from Telegram
    const fileRes = await fetch(`${TG}/getFile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_id: fileId }) });
    const fileData = await fileRes.json();
    const fileUrl = fileData.ok ? `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}` : null;
    return handleDocFile(chatId, user, session, fileUrl || "file_received");
  }

  // ── Text messages ─────────────────────────────────────────
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const text: string = msg.text || "";
    const firstName = msg.from?.first_name || "Пользователь";

    if (msg.voice) { await tgSend(chatId, "🎤 Голосовые доступны в Mini App."); return; }

    const user = await getUser(chatId);
    const session = user ? await getSession(chatId) : null;

    // /start, /menu
    if (text.startsWith("/start") || text.startsWith("/menu")) {
      if (!user) { await screenUnknownUser(chatId, firstName); return; }
      await tgDeleteMsg(chatId, msg.message_id);
      if (session?.message_id) await tgDeleteMsg(chatId, session.message_id);
      await clearSession(chatId);
      return routeToMenu(chatId, user, null);
    }

    if (text.startsWith("/help")) {
      await tgDeleteMsg(chatId, msg.message_id);
      await tgSend(chatId, `ℹ️ <b>STSphera Bot v4</b>\n${SEP}\n/start — главное меню\n/projects — проекты\n/settings — настройки`);
      return;
    }
    if (text.startsWith("/projects")) { if (!user) { await screenUnknownUser(chatId, firstName); return; } await tgDeleteMsg(chatId, msg.message_id); return screenProjectsList(chatId, user, session); }
    if (text.startsWith("/settings")) { if (!user) { await screenUnknownUser(chatId, firstName); return; } await tgDeleteMsg(chatId, msg.message_id); return screenSettings(chatId, user, session); }

    // FSM text inputs
    if (user && session && session.state !== "IDLE") {
      await tgDeleteMsg(chatId, msg.message_id);

      if (session.state === "REPORT_INPUT") {
        const num = parseFloat(text.replace(",", "."));
        if (isNaN(num) || num <= 0 || num > 1000) { await tgEdit(chatId, session.message_id!, "⚠️ Введите число от 1 до 1000:"); return; }
        return screenForemanReportConfirm(chatId, user, session, num);
      }
      if (session.state === "ALERT_TITLE") {
        const trimmed = text.trim().slice(0, 200);
        if (trimmed.length < 3) { await tgEdit(chatId, session.message_id!, "⚠️ Заголовок слишком короткий:"); return; }
        return saveAlert(chatId, user, session, trimmed);
      }
      if (session.state === "LOG_ZONE") {
        const zone = text.trim().slice(0, 100);
        if (zone.length < 2) { await tgEdit(chatId, session.message_id!, "⚠️ Слишком короткое:"); return; }
        const s = { ...session, context: { ...session.context, log_zone: zone } };
        await saveSession(chatId, user.user_id, "LOG_WORKS", s.context, session.message_id ?? undefined);
        return screenLogWorks(chatId, user, s);
      }
      if (session.state === "LOG_WORKS") {
        const works = text.trim().slice(0, 500);
        if (works.length < 5) { await tgEdit(chatId, session.message_id!, "⚠️ Опишите подробнее:"); return; }
        const s = { ...session, context: { ...session.context, log_works: works } };
        await saveSession(chatId, user.user_id, "LOG_WORKERS", s.context, session.message_id ?? undefined);
        return screenLogWorkers(chatId, user, s);
      }
      if (session.state === "DOC_COMMENT") {
        return handleDocComment(chatId, user, session, text.trim());
      }
    }
  }

  // ── Callback queries ──────────────────────────────────────
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.from.id;
    const data: string = cq.data || "";
    await tgAnswer(cq.id);

    const user = await getUser(chatId);
    if (!user) { await screenUnknownUser(chatId, cq.from.first_name || ""); return; }
    const session = await getSession(chatId);
    if (!session) return routeToMenu(chatId, user, null);

    // ── Doc FSM callbacks ──
    if (DOC_FSM_MAP[data]) {
      const { label, recipients } = DOC_FSM_MAP[data];
      return startDocFSM(chatId, user, session, data, label, recipients);
    }
    if (data === "doc:nocomment") return handleDocComment(chatId, user, session, "—");
    if (data === "doc:confirm") return handleDocConfirm(chatId, user, session);

    // ── Inbox ──
    if (data.startsWith("inbox:view:")) return screenInboxDetail(chatId, user, session, data.slice(11));
    if (data.startsWith("inbox:done:")) return handleInboxDone(chatId, user, session, data.slice(11));

    // ── Projects ──
    if (data === "proj:list") return screenProjectsList(chatId, user, session);
    if (data.startsWith("proj:sel:")) return selectProject(chatId, user, session, data.slice(9));

    // ── Common ──
    if (data === "c:settings") return screenSettings(chatId, user, session);
    if (data.startsWith("set:t:")) return toggleNotification(chatId, user, session, data.slice(6));

    // ── Approvals ──
    if (data.startsWith("appr:yes:")) return handleApproval(chatId, user, session, data.slice(9), "approved");
    if (data.startsWith("appr:no:")) return handleApproval(chatId, user, session, data.slice(8), "rejected");

    // ── Alert creation ──
    if (data.startsWith("at:")) return screenAlertTitle(chatId, user, session, data.slice(3));

    // ── Daily logs ──
    if (data === "log:new") return screenLogZone(chatId, user, session);
    if (data.startsWith("log:w:")) return saveLogEntry(chatId, user, session, parseInt(data.slice(6)));

    // ── Director ──
    if (data === "d:menu") return screenDirectorMenu(chatId, user, session);
    if (data === "d:portfolio") return screenPortfolio(chatId, user, session);
    if (data === "d:kpi") return screenKPI(chatId, user, session);
    if (data === "d:critical") return screenCritical(chatId, user, session);
    if (data === "d:finance") return screenFinance(chatId, user, session);
    if (data === "d:dash") return screenDashboard(chatId, user, session);
    if (data === "d:alerts") return screenAlerts(chatId, user, session);
    if (data === "d:supply") return screenSupply(chatId, user, session);
    if (data === "d:facades") return screenFacades(chatId, user, session);
    if (data === "d:approvals") return screenApprovals(chatId, user, session);
    if (data === "d:logs") return screenDailyLogs(chatId, user, session);
    if (data === "d:alert_new") return screenAlertNew(chatId, user, session);
    if (data.startsWith("d:fcd:")) return screenFacadeDetail(chatId, user, session, data.slice(6));

    // ── PM ──
    if (data === "pm:menu") return screenPMMenu(chatId, user, session);
    if (data === "pm:inbox") return screenInbox(chatId, user, session, "pm", "pm");
    if (data === "pm:send") return screenPMSend(chatId, user, session);
    if (data === "pm:s:launch") return screenPMSendLaunch(chatId, user, session);
    if (data === "pm:s:design") return screenPMSendDesign(chatId, user, session);
    if (data === "pm:s:supply") return screenSupply(chatId, user, session);
    if (data === "pm:s:prod") return screenDashboard(chatId, user, session);
    if (data === "pm:quick") return screenPMQuick(chatId, user, session);
    if (data === "pm:dash") return screenDashboard(chatId, user, session);
    if (data === "pm:alerts") return screenAlerts(chatId, user, session);
    if (data === "pm:tasks") return screenTasks(chatId, user, session);
    if (data === "pm:approvals") return screenApprovals(chatId, user, session);
    if (data === "pm:logs") return screenDailyLogs(chatId, user, session);
    if (data === "pm:alert_new") return screenAlertNew(chatId, user, session);

    // ── OPR ──
    if (data === "opr:menu") return screenOPRMenu(chatId, user, session);
    if (data === "opr:inbox") return screenInbox(chatId, user, session, "project_opr", "opr");
    if (data === "opr:send") return screenOPRSend(chatId, user, session);
    if (data === "opr:progress") return screenProgress(chatId, user, session, "opr");

    // ── KM ──
    if (data === "km:menu") return screenKMMenu(chatId, user, session);
    if (data === "km:inbox") return screenInbox(chatId, user, session, "project_km", "km");
    if (data === "km:send") return screenKMSend(chatId, user, session);
    if (data === "km:progress") return screenProgress(chatId, user, session, "km");

    // ── KMD ──
    if (data === "kmd:menu") return screenKMDMenu(chatId, user, session);
    if (data === "kmd:inbox") return screenInbox(chatId, user, session, "project_kmd", "kmd");
    if (data === "kmd:send") return screenKMDSend(chatId, user, session);
    if (data === "kmd:progress") return screenProgress(chatId, user, session, "kmd");

    // ── Supply ──
    if (data === "sup:menu") return screenSupplyMenu(chatId, user, session);
    if (data === "sup:inbox") return screenInbox(chatId, user, session, "supply", "sup");
    if (data === "sup:send") return screenSupplySend(chatId, user, session);
    if (data === "sup:status") return screenSupplyStatus(chatId, user, session);
    if (data === "sup:deficit") return screenSupplyDeficit(chatId, user, session);

    // ── Production ──
    if (data === "prod:menu") return screenProductionMenu(chatId, user, session);
    if (data === "prod:inbox") return screenInbox(chatId, user, session, "production", "prod");
    if (data === "prod:send") return screenProductionSend(chatId, user, session);
    if (data === "prod:load") return screenProductionLoad(chatId, user, session);

    // ── Foreman ──
    if (data === "f:menu") return screenForemanMenu(chatId, user, session);
    if (data === "f:inbox") return screenInbox(chatId, user, session, "foreman", "f");
    if (data === "f:send") return screenForemanSend(chatId, user, session);
    if (data === "f:report") return screenForemanReportFacade(chatId, user, session);
    if (data === "f:photo") return screenForemanPhoto(chatId, user, session);
    if (data === "f:progress") return screenForemanProgress(chatId, user, session);
    if (data === "f:alerts") return screenAlerts(chatId, user, session);
    if (data === "f:tasks") return screenTasks(chatId, user, session);
    if (data === "f:logs") return screenDailyLogs(chatId, user, session);
    if (data === "f:facades") return screenFacades(chatId, user, session);
    if (data.startsWith("f:rf:")) return screenForemanReportFloor(chatId, user, session, data.slice(5));
    if (data.startsWith("f:rfl:")) return screenForemanReportInput(chatId, user, session, data.slice(6));
    if (data.startsWith("f:rv:")) return screenForemanReportConfirm(chatId, user, session, parseInt(data.slice(5)));
    if (data.startsWith("f:rs:")) return saveForemanReport(chatId, user, session, parseInt(data.slice(5)));
    if (data.startsWith("f:fcd:")) return screenFacadeDetail(chatId, user, session, data.slice(6));

    // ── PTO ──
    if (data === "pto:menu") return screenPTOMenu(chatId, user, session);
    if (data === "pto:inbox") return screenInbox(chatId, user, session, "pto", "pto");
    if (data === "pto:send") return screenPTOSend(chatId, user, session);
    if (data === "pto:registry") return screenPTORegistry(chatId, user, session);

    // ── Inspector ──
    if (data === "insp:menu") return screenInspectorMenu(chatId, user, session);
    if (data === "insp:inbox") return screenInbox(chatId, user, session, "inspector", "insp");
    if (data === "insp:send") return screenInspectorSend(chatId, user, session);
    if (data === "insp:accept") return screenInspectorAccept(chatId, user, session);
    if (data === "insp:history") return screenInspectorHistory(chatId, user, session);

    // ── Generic ──
    if (data === "g:menu") return screenGenericMenu(chatId, user, session);
    if (data === "g:dash") return screenDashboard(chatId, user, session);
    if (data === "g:alerts") return screenAlerts(chatId, user, session);
    if (data === "g:tasks") return screenTasks(chatId, user, session);
    if (data === "g:logs") return screenDailyLogs(chatId, user, session);
  }
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("OK");
  try {
    const update = await req.json();
    console.log("[Bot v4]", JSON.stringify({
      text: update.message?.text, chat: update.message?.chat?.id || update.callback_query?.from?.id, cb: update.callback_query?.data,
    }));
    await handleUpdate(update);
  } catch (err) {
    console.error("[Bot v4] ERROR:", err instanceof Error ? err.stack || err.message : String(err));
  }
  return new Response("OK");
});
