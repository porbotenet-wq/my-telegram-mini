// ═══════════════════════════════════════════════════════════════
// STSphera Telegram Bot v3 — полная версия
// ═══════════════════════════════════════════════════════════════
// Экраны:
//   Все роли: /start → меню → проекты, настройки
//   Директор/РП: дашборд, алерты, снабжение, фасады, согласования, задачи
//   Прораб: отчёт (фасад→этаж→факт), прогресс, алерты, задачи
//   Все: дневные журналы, настройки уведомлений
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SB_URL    = Deno.env.get("SUPABASE_URL")!;
const SB_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL   = Deno.env.get("MINI_APP_URL") || "https://smr-sfera.lovable.app";
const TG        = `https://api.telegram.org/bot${BOT_TOKEN}`;
const db = createClient(SB_URL, SB_KEY);
const SEP = "─".repeat(29);

// ── TG API helpers ──────────────────────────────────────────
async function tgSend(chatId: number, text: string, markup?: object): Promise<number | null> {
  const res = await fetch(`${TG}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(markup ? { reply_markup: markup } : {}) }) });
  const j = await res.json(); return j.ok ? j.result.message_id : null;
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
function isDirector(roles: string[]) { return roles.includes("director"); }
function isPM(roles: string[]) { return roles.includes("pm"); }
function isForeman(roles: string[]) { return roles.some(r => ["foreman1", "foreman2", "foreman3"].includes(r)); }
function isManager(roles: string[]) { return isDirector(roles) || isPM(roles); }

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

// ── Shared helpers ──────────────────────────────────────────
const todayStr = () => new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
const pe: Record<string, string> = { critical: "🔴", high: "🟠", normal: "🟡", low: "⚪" };
const typeIcons: Record<string, string> = { daily_log: "📋", material_request: "📦", task_completion: "✔️", budget: "💰", other: "📌" };
const typeLabels: Record<string, string> = { daily_log: "Дневной отчёт", material_request: "Заявка на материалы", task_completion: "Завершение задачи", budget: "Бюджет" };

function rolePrefix(roles: string[]) {
  if (isDirector(roles)) return "d";
  if (isPM(roles)) return "pm";
  return "f";
}

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
// ЭКРАН: Список проектов
// ══════════════════════════════════════════════════════════════
async function screenProjectsList(chatId: number, user: BotUser, session: any) {
  const projects = await getProjects();
  let text = `📋 <b>Ваши проекты</b>\n${SEP}\n`;
  if (projects.length === 0) {
    text += "Нет активных проектов";
    await sendOrEdit(chatId, session, user.user_id, text, [[{ text: "🚀 Открыть приложение", web_app: { url: APP_URL } }]]);
    return;
  }
  for (const p of projects) {
    text += `\n🏗️ <b>${p.name}</b>`;
    if (p.city) text += ` · ${p.city}`;
    if (p.code) text += ` (${p.code})`;
    text += "\n";
  }
  const buttons = projects.map((p: any) => [{ text: `🏗️ ${p.name}`, callback_data: `proj:select:${p.id}` }]);
  buttons.push([{ text: "← Назад", callback_data: `${rolePrefix(user.roles)}:menu` }]);
  await sendOrEdit(chatId, session, user.user_id, text, buttons);
}

async function selectProject(chatId: number, user: BotUser, session: any, projectId: string) {
  const project = await getProject(projectId);
  if (!project) return;
  const ctx = { ...session?.context, project_id: projectId, project_name: project.name };
  await saveSession(chatId, user.user_id, "IDLE", ctx, session?.message_id ?? undefined);
  // Redirect to role menu with new project
  const updatedSession = { ...session, context: ctx };
  if (isDirector(user.roles)) return screenDirectorMenu(chatId, user, updatedSession);
  if (isPM(user.roles)) return screenPMMenu(chatId, user, updatedSession);
  return screenForemanMenu(chatId, user, updatedSession);
}

// ══════════════════════════════════════════════════════════════
// ЭКРАНЫ: Director
// ══════════════════════════════════════════════════════════════
async function screenDirectorMenu(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  const project = projectId ? await getProject(projectId) : (await getProjects())[0];
  let text = `👔 <b>${user.display_name}</b> · Директор\n${SEP}\n📅 ${todayStr()}\n\n`;
  const ctx: any = { project_id: project?.id, project_name: project?.name };
  if (project) {
    const pf = await getTodayPlanFact(project.id);
    const alerts = await getOpenAlerts(project.id);
    const approvals = await getPendingApprovals(project.id);
    text += `🏗️ <b>${project.name}</b>\n`;
    text += pf.count > 0 ? `${progressBar(pf.pct)} <b>${pf.pct}%</b> сегодня\n` : `📊 Отчётов сегодня нет\n`;
    if (alerts.counts.total > 0) { text += `🔔 Алертов: <b>${alerts.counts.total}</b>`; if (alerts.counts.critical > 0) text += ` 🔴 крит: <b>${alerts.counts.critical}</b>`; text += "\n"; }
    if (approvals.length > 0) text += `📝 Согласований: <b>${approvals.length}</b>\n`;
  }
  const buttons = [
    [{ text: "📊 Дашборд", callback_data: "d:dash" }, { text: "🔔 Алерты", callback_data: "d:alerts" }],
    [{ text: "📦 Снабжение", callback_data: "d:supply" }, { text: "🏗️ Фасады", callback_data: "d:facades" }],
    [{ text: "📝 Согласования", callback_data: "d:approvals" }, { text: "⚙️ Процессы", callback_data: "d:workflow" }],
    [{ text: "📋 Журналы", callback_data: "d:logs" }, { text: "⚙️ Настройки", callback_data: "c:settings" }],
    [{ text: "📂 Сменить проект", callback_data: "proj:list" }],
    [{ text: "🚀 Открыть приложение", web_app: { url: APP_URL } }],
  ];
  await sendOrEdit(chatId, session, user.user_id, text, buttons, "IDLE", ctx);
}

async function screenDirectorDashboard(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  const project = projectId ? await getProject(projectId) : (await getProjects())[0];
  if (!project) { await tgEdit(chatId, session.message_id, "❌ Нет активных проектов.", { inline_keyboard: [[{ text: "← Назад", callback_data: "d:menu" }]] }); return; }
  const facades = await getFacades(project.id);
  const alerts = await getOpenAlerts(project.id);
  let totalPlan = 0, totalFact = 0;
  for (const f of facades) { const s = await getFacadeStats(f.id); totalPlan += s.totalPlan; totalFact += s.totalFact; }
  const totalPct = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;
  const daysLeft = project.end_date ? Math.ceil((new Date(project.end_date).getTime() - Date.now()) / 86400000) : null;
  let text = `📊 <b>Дашборд</b>\n${SEP}\n🏗️ ${project.name}\n📅 ${todayStr()}\n\n${progressBar(totalPct)} <b>${totalPct}%</b>\nМодули: ${totalFact} / ${totalPlan} шт.\n\n`;
  if (daysLeft !== null) text += daysLeft < 0 ? `🔴 Просрочка: <b>${Math.abs(daysLeft)} дн.</b>\n` : `📅 До сдачи: <b>${daysLeft} дн.</b>\n`;
  if (facades.length > 0) { text += `\n<b>По фасадам:</b>\n`; for (const f of facades) { const s = await getFacadeStats(f.id); text += `${f.name}: ${progressBar(s.pct)} ${s.pct}% (${s.totalFact}/${s.totalPlan})\n`; } }
  if (alerts.counts.total > 0) { text += `\n🔔 Алертов: ${alerts.counts.total}`; if (alerts.counts.critical > 0) text += ` 🔴 крит: ${alerts.counts.critical}`; text += "\n"; }
  const rp = rolePrefix(user.roles);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "🔔 Алерты", callback_data: `${rp}:alerts` }, { text: "📦 Снабжение", callback_data: `${rp}:supply` }],
    [{ text: "← Меню", callback_data: `${rp}:menu` }],
  ] });
}

async function screenAlerts(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) return screenDirectorMenu(chatId, user, session);
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
  const rp = rolePrefix(user.roles);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "✏️ Создать алерт", callback_data: `${rp}:alert_new` }],
    [{ text: "← Меню", callback_data: `${rp}:menu` }],
  ] });
}

async function screenSupply(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) return screenDirectorMenu(chatId, user, session);
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
  const rp = rolePrefix(user.roles);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "🚀 Снабжение в приложении", web_app: { url: APP_URL } }],
    [{ text: "← Меню", callback_data: `${rp}:menu` }],
  ] });
}

async function screenFacades(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) return screenDirectorMenu(chatId, user, session);
  const facades = await getFacades(projectId);
  let text = `🏗️ <b>Фасады</b>\n${SEP}\n`;
  for (const f of facades) {
    const s = await getFacadeStats(f.id);
    text += `<b>${f.name}</b> ${f.code ? `(${f.code})` : ""}\n${progressBar(s.pct)} ${s.pct}%  ${s.totalFact}/${s.totalPlan} мод.\nЭтажей завершено: ${s.doneFloors}/${s.floors.length}\n\n`;
  }
  const rp = rolePrefix(user.roles);
  const buttons = facades.map((f: any) => [{ text: `📋 ${f.name}`, callback_data: `${rp}:facade:${f.id}` }]);
  buttons.push([{ text: "← Меню", callback_data: `${rp}:menu` }]);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: buttons });
}

async function screenFacadeDetail(chatId: number, user: BotUser, session: any, facadeId: string) {
  const { data: facade } = await db.from("facades").select("name, code, total_modules, floors_count").eq("id", facadeId).maybeSingle();
  if (!facade) return;
  const stats = await getFacadeStats(facadeId);
  let text = `🏗️ <b>${facade.name}</b>${facade.code ? ` (${facade.code})` : ""}\n${SEP}\n${progressBar(stats.pct)} <b>${stats.pct}%</b>\nМодули: ${stats.totalFact} / ${stats.totalPlan} шт.\n\n`;
  if (stats.floors.length > 0) {
    text += `<b>По этажам:</b>\n`;
    const sorted = [...stats.floors].sort((a: any, b: any) => b.floor_number - a.floor_number);
    for (const fl of sorted.slice(0, 8)) {
      const flPct = fl.modules_plan > 0 ? Math.round((fl.modules_fact / fl.modules_plan) * 100) : 0;
      const icon = fl.status === "done" ? "✅" : fl.status === "in_progress" ? "🔄" : "⬜";
      text += `${icon} Эт.${fl.floor_number}: ${fl.modules_fact}/${fl.modules_plan} мод. (${flPct}%)\n`;
    }
  }
  const rp = rolePrefix(user.roles);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "← Все фасады", callback_data: `${rp}:facades` }],
    [{ text: "← Меню", callback_data: `${rp}:menu` }],
  ] });
}

// ══════════════════════════════════════════════════════════════
// ЭКРАН: Согласования
// ══════════════════════════════════════════════════════════════
async function screenApprovals(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) return screenDirectorMenu(chatId, user, session);
  const approvals = await getPendingApprovals(projectId);
  let text = `📝 <b>Согласования</b>\n${SEP}\n`;
  if (approvals.length === 0) {
    text += "✅ Нет ожидающих согласований";
  } else {
    text += `Ожидают: <b>${approvals.length}</b>\n\n`;
    for (const a of approvals) {
      const icon = typeIcons[a.type] || "📌";
      const label = typeLabels[a.type] || a.type;
      const date = new Date(a.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      text += `${icon} <b>${a.title}</b>\n   ${label} · Ур.${a.level} · ${date}\n`;
      if (a.description) text += `   <i>${a.description.slice(0, 60)}</i>\n`;
      text += "\n";
    }
  }
  const rp = rolePrefix(user.roles);
  const buttons: any[][] = [];
  for (const a of approvals.slice(0, 3)) {
    buttons.push([
      { text: `✅ ${a.title.slice(0, 18)}`, callback_data: `appr:yes:${a.id}` },
      { text: `❌ Отклонить`, callback_data: `appr:no:${a.id}` },
    ]);
  }
  buttons.push([{ text: "← Меню", callback_data: `${rp}:menu` }]);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: buttons });
}

async function handleApproval(chatId: number, user: BotUser, session: any, approvalId: string, decision: "approved" | "rejected") {
  const { data: approval } = await db.from("approvals").select("title, status").eq("id", approvalId).maybeSingle();
  if (!approval || approval.status !== "pending") {
    await tgAnswer("", "Уже обработано");
    return screenApprovals(chatId, user, session);
  }
  const { error } = await db.from("approvals").update({
    status: decision,
    assigned_to: user.user_id,
    decided_at: new Date().toISOString(),
  }).eq("id", approvalId);

  if (error) {
    await tgEdit(chatId, session.message_id, `❌ Ошибка: ${error.message}`, { inline_keyboard: [[{ text: "← Назад", callback_data: `${rolePrefix(user.roles)}:approvals` }]] });
    return;
  }
  const icon = decision === "approved" ? "✅" : "❌";
  const label = decision === "approved" ? "согласовано" : "отклонено";
  await audit(chatId, user.user_id, `approval:${decision}`, { approval_id: approvalId });
  await tgEdit(chatId, session.message_id, `${icon} <b>${approval.title}</b>\nРешение: ${label}`, { inline_keyboard: [
    [{ text: "📝 Все согласования", callback_data: `${rolePrefix(user.roles)}:approvals` }],
    [{ text: "← Меню", callback_data: `${rolePrefix(user.roles)}:menu` }],
  ] });
}

// ══════════════════════════════════════════════════════════════
// ЭКРАН: Дневные журналы
// ══════════════════════════════════════════════════════════════
async function screenDailyLogs(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) return screenDirectorMenu(chatId, user, session);
  const logs = await getDailyLogs(projectId);
  let text = `📋 <b>Дневные журналы</b>\n${SEP}\n`;
  if (logs.length === 0) {
    text += "Нет записей";
  } else {
    for (const log of logs) {
      const date = new Date(log.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      const statusIcon = log.status === "approved" ? "✅" : log.status === "submitted" ? "📤" : "📝";
      text += `${statusIcon} <b>${date}</b>`;
      if (log.zone_name) text += ` · ${log.zone_name}`;
      text += `\n   ${log.works_description.slice(0, 60)}`;
      if (log.workers_count) text += `\n   👷 ${log.workers_count} чел.`;
      text += "\n\n";
    }
  }
  const rp = rolePrefix(user.roles);
  const buttons: any[][] = [];
  if (isForeman(user.roles)) {
    buttons.push([{ text: "📝 Новая запись", callback_data: "log:new" }]);
  }
  buttons.push([{ text: "🚀 Журналы в приложении", web_app: { url: APP_URL } }]);
  buttons.push([{ text: "← Меню", callback_data: `${rp}:menu` }]);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: buttons });
}

// Daily log creation flow for foremen
async function screenLogZone(chatId: number, user: BotUser, session: any) {
  await tgEdit(chatId, session.message_id, `📝 <b>Новая запись журнала</b>\n${SEP}\nВведите название зоны / участка:`,
    { inline_keyboard: [[{ text: "✕ Отмена", callback_data: "f:menu" }]] });
  await saveSession(chatId, user.user_id, "LOG_ZONE", session.context, session.message_id);
}

async function screenLogWorks(chatId: number, user: BotUser, session: any) {
  await tgEdit(chatId, session.message_id, `📝 <b>Журнал · ${session.context.log_zone || ""}</b>\n${SEP}\n✏️ Опишите выполненные работы:`,
    { inline_keyboard: [[{ text: "✕ Отмена", callback_data: "f:menu" }]] });
  await saveSession(chatId, user.user_id, "LOG_WORKS", session.context, session.message_id);
}

async function screenLogWorkers(chatId: number, user: BotUser, session: any) {
  await tgEdit(chatId, session.message_id, `📝 <b>Журнал</b>\n${SEP}\n👷 Количество рабочих на участке?`,
    { inline_keyboard: [
      [3,5,8,10].map(n => ({ text: String(n), callback_data: `log:workers:${n}` })),
      [15,20,25,30].map(n => ({ text: String(n), callback_data: `log:workers:${n}` })),
      [{ text: "✕ Отмена", callback_data: "f:menu" }],
    ] });
  await saveSession(chatId, user.user_id, "LOG_WORKERS", session.context, session.message_id);
}

async function saveLogEntry(chatId: number, user: BotUser, session: any, workers: number) {
  const ctx = session.context;
  const { error } = await db.from("daily_logs").insert({
    project_id: ctx.project_id,
    zone_name: ctx.log_zone || null,
    works_description: ctx.log_works,
    workers_count: workers,
    submitted_by: user.user_id,
    status: "submitted",
  });
  if (error) {
    await tgEdit(chatId, session.message_id, `❌ Ошибка: ${error.message}`, { inline_keyboard: [[{ text: "← Меню", callback_data: "f:menu" }]] });
    return;
  }
  await audit(chatId, user.user_id, "daily_log:submit", { zone: ctx.log_zone, workers });
  await tgEdit(chatId, session.message_id, `✅ <b>Запись сохранена</b>\n${SEP}\n📍 ${ctx.log_zone || "—"}\n📝 ${ctx.log_works?.slice(0, 80)}\n👷 ${workers} чел.`,
    { inline_keyboard: [[{ text: "📋 Все журналы", callback_data: `${rolePrefix(user.roles)}:logs` }], [{ text: "← Меню", callback_data: "f:menu" }]] });
  await clearSession(chatId);
}

// ══════════════════════════════════════════════════════════════
// ЭКРАН: Настройки
// ══════════════════════════════════════════════════════════════
async function screenSettings(chatId: number, user: BotUser, session: any) {
  const { data: profile } = await db.from("profiles").select("notification_preferences, telegram_chat_id, telegram_username")
    .eq("user_id", user.user_id).maybeSingle();
  const prefs = (profile?.notification_preferences || {}) as Record<string, any>;
  const roleLabel = isDirector(user.roles) ? "👔 Директор" : isPM(user.roles) ? "👷 РП" : isForeman(user.roles) ? "🏗️ Прораб" : "📋 Сотрудник";

  let text = `⚙️ <b>Настройки</b>\n${SEP}\n👤 ${user.display_name}\n${roleLabel}\n📱 Chat ID: ${profile?.telegram_chat_id || "—"}\n\n`;
  text += `<b>Уведомления:</b>\n`;
  text += `${prefs.alert_created !== false ? "✅" : "❌"} Новые алерты\n`;
  text += `${prefs.alert_overdue !== false ? "✅" : "❌"} Просроченные алерты\n`;
  text += `${prefs.daily_report_missing !== false ? "✅" : "❌"} Напоминание об отчёте\n`;
  text += `${prefs.project_summary !== false ? "✅" : "❌"} Дайджест проекта\n`;
  text += `${prefs.supply_overdue !== false ? "✅" : "❌"} Дефицит материалов\n`;
  text += `\n🌙 Не беспокоить: ${prefs.do_not_disturb_from || "23:00"} — ${prefs.do_not_disturb_to || "07:00"}\n`;

  const rp = rolePrefix(user.roles);
  const buttons = [
    [{ text: `${prefs.alert_created !== false ? "🔕" : "🔔"} Алерты`, callback_data: "set:toggle:alert_created" }],
    [{ text: `${prefs.daily_report_missing !== false ? "🔕" : "🔔"} Напоминания`, callback_data: "set:toggle:daily_report_missing" }],
    [{ text: `${prefs.project_summary !== false ? "🔕" : "🔔"} Дайджест`, callback_data: "set:toggle:project_summary" }],
    [{ text: `${prefs.supply_overdue !== false ? "🔕" : "🔔"} Снабжение`, callback_data: "set:toggle:supply_overdue" }],
    [{ text: "← Меню", callback_data: `${rp}:menu` }],
  ];
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: buttons });
}

async function toggleNotification(chatId: number, user: BotUser, session: any, key: string) {
  const { data: profile } = await db.from("profiles").select("notification_preferences").eq("user_id", user.user_id).maybeSingle();
  const prefs = { ...(profile?.notification_preferences || {}) } as Record<string, any>;
  prefs[key] = prefs[key] === false ? true : false;
  await db.from("profiles").update({ notification_preferences: prefs }).eq("user_id", user.user_id);
  return screenSettings(chatId, user, session);
}

// ══════════════════════════════════════════════════════════════
// ЭКРАНЫ: PM
// ══════════════════════════════════════════════════════════════
async function screenPMMenu(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  const project = projectId ? await getProject(projectId) : (await getProjects())[0];
  let text = `👷 <b>${user.display_name}</b> · РП\n${SEP}\n📅 ${todayStr()}\n\n`;
  const ctx: any = { project_id: project?.id, project_name: project?.name };
  if (project) {
    const pf = await getTodayPlanFact(project.id);
    const alerts = await getOpenAlerts(project.id);
    const approvals = await getPendingApprovals(project.id);
    text += `🏗️ ${project.name}\n`;
    if (pf.count > 0) text += `${progressBar(pf.pct)} <b>${pf.pct}%</b> сегодня\n`;
    if (alerts.counts.total > 0) text += `🔔 Алертов: <b>${alerts.counts.total}</b>\n`;
    if (approvals.length > 0) text += `📝 Согласований: <b>${approvals.length}</b>\n`;
  }
  const buttons = [
    [{ text: "📊 Дашборд", callback_data: "pm:dash" }, { text: "🔔 Алерты", callback_data: "pm:alerts" }],
    [{ text: "📋 Мои задачи", callback_data: "pm:tasks" }, { text: "📦 Снабжение", callback_data: "pm:supply" }],
    [{ text: "📝 Согласования", callback_data: "pm:approvals" }, { text: "⚙️ Процессы", callback_data: "pm:workflow" }],
    [{ text: "📋 Журналы", callback_data: "pm:logs" }, { text: "✏️ Новый алерт", callback_data: "pm:alert_new" }],
    [{ text: "📂 Сменить проект", callback_data: "proj:list" }, { text: "⚙️ Настройки", callback_data: "c:settings" }],
    [{ text: "🚀 Открыть приложение", web_app: { url: APP_URL } }],
  ];
  await sendOrEdit(chatId, session, user.user_id, text, buttons, "IDLE", ctx);
}

async function screenTasks(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) return;
  const tasks = await getMyTasks(user.user_id, projectId);
  let text = `📋 <b>Мои задачи</b>\n${SEP}\n`;
  if (tasks.length === 0) { text += "✅ Нет активных задач"; }
  else {
    const si: Record<string, string> = { "В работе": "🔄", "Ожидание": "⏳", "Выполнено": "✅" };
    for (const t of tasks) {
      const d = t.planned_date ? new Date(t.planned_date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "";
      text += `${pe[t.priority] || "⚪"} ${si[t.status] || "⏳"} <b>[${t.code}]</b> ${t.name}\n`;
      if (d) text += `   📅 ${d}\n`;
      text += "\n";
    }
  }
  const rp = rolePrefix(user.roles);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "🚀 Все задачи в приложении", web_app: { url: APP_URL } }],
    [{ text: "← Меню", callback_data: `${rp}:menu` }],
  ] });
}

// ══════════════════════════════════════════════════════════════
// ЭКРАНЫ: Прораб
// ══════════════════════════════════════════════════════════════
async function screenForemanMenu(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  const project = projectId ? await getProject(projectId) : (await getProjects())[0];
  let text = `🏗️ <b>${user.display_name}</b> · Прораб\n${SEP}\n📅 ${todayStr()}\n\n`;
  const ctx: any = { project_id: project?.id, project_name: project?.name };
  if (project) {
    text += `🏗️ ${project.name}\n`;
    const pf = await getTodayPlanFact(project.id);
    text += pf.count > 0 ? `${progressBar(pf.pct)} <b>${pf.pct}%</b> сегодня\n` : `⚠️ <b>Отчёт за сегодня не подан</b>\n`;
  }
  const buttons = [
    [{ text: "📋 Подать отчёт", callback_data: "f:report_start" }],
    [{ text: "📊 Мой прогресс", callback_data: "f:progress" }, { text: "🔔 Алерты", callback_data: "f:alerts" }],
    [{ text: "📋 Задачи", callback_data: "f:tasks" }, { text: "📋 Журнал", callback_data: "f:logs" }],
    [{ text: "📂 Сменить проект", callback_data: "proj:list" }, { text: "⚙️ Настройки", callback_data: "c:settings" }],
    [{ text: "🚀 Открыть приложение", web_app: { url: APP_URL } }],
  ];
  await sendOrEdit(chatId, session, user.user_id, text, buttons, "IDLE", ctx);
}

// Foreman report flow
async function screenForemanReportFacade(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) return screenForemanMenu(chatId, user, session);
  const facades = await getFacades(projectId);
  const buttons = facades.map((f: any) => [{ text: `${f.name} (${f.total_modules} мод.)`, callback_data: `f:rep_facade:${f.id}` }]);
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
      return { text: `${icon}${fl.floor_number}`, callback_data: `f:rep_floor:${fl.id}` };
    }));
  }
  rows.push([{ text: "← Назад", callback_data: "f:report_start" }]);
  await tgEdit(chatId, session.message_id, `📋 <b>Отчёт · ${facade?.name}</b>\n${SEP}\nВыберите этаж:\n<i>(✅ завершён, 🔄 в работе, ⬜ не начат)</i>`, { inline_keyboard: rows });
  await saveSession(chatId, user.user_id, "REPORT_FLOOR", { ...session.context, facade_id: facadeId, facade_name: facade?.name }, session.message_id);
}

async function screenForemanReportInput(chatId: number, user: BotUser, session: any, floorId: string) {
  const { data: floor } = await db.from("floors").select("floor_number, modules_plan, modules_fact, brackets_plan, brackets_fact").eq("id", floorId).maybeSingle();
  if (!floor) return;
  const remaining = Math.max(0, (floor.modules_plan || 0) - (floor.modules_fact || 0));
  await tgEdit(chatId, session.message_id,
    `📋 <b>Ввод факта</b>\n${SEP}\nФасад: ${session.context.facade_name}\nЭтаж: <b>${floor.floor_number}</b>\n\nПлан: ${floor.modules_plan} мод.\nФакт: ${floor.modules_fact} мод.\nОсталось: <b>${remaining} мод.</b>\n\n✏️ <b>Введите кол-во модулей за сегодня:</b>`,
    { inline_keyboard: [
      [5,10,15,20].map(n => ({ text: String(n), callback_data: `f:rep_val:${n}` })),
      [25,30,40,50].map(n => ({ text: String(n), callback_data: `f:rep_val:${n}` })),
      [{ text: "✕ Отмена", callback_data: "f:menu" }],
    ] });
  await saveSession(chatId, user.user_id, "REPORT_INPUT", {
    ...session.context, floor_id: floorId, floor_number: floor.floor_number,
    modules_plan: floor.modules_plan, modules_fact: floor.modules_fact,
  }, session.message_id);
}

async function screenForemanReportConfirm(chatId: number, user: BotUser, session: any, value: number) {
  const ctx = session.context;
  await tgEdit(chatId, session.message_id, `📋 <b>Подтверждение</b>\n${SEP}\nФасад: ${ctx.facade_name}\nЭтаж: <b>${ctx.floor_number}</b>\nФакт за сегодня: <b>${value} модулей</b>\n\nСохранить?`,
    { inline_keyboard: [
      [{ text: "✅ Да, сохранить", callback_data: `f:rep_save:${value}` }, { text: "✏️ Изменить", callback_data: `f:rep_floor:${ctx.facade_id}` }],
      [{ text: "✕ Отмена", callback_data: "f:menu" }],
    ] });
}

async function saveForemanReport(chatId: number, user: BotUser, session: any, value: number) {
  const ctx = session.context;
  const today = new Date().toISOString().split("T")[0];
  const weekNum = Math.ceil(new Date().getDate() / 7);
  const { error: pfError } = await db.from("plan_fact").insert({
    project_id: ctx.project_id, facade_id: ctx.facade_id, floor_id: ctx.floor_id,
    week_number: weekNum, date: today, plan_value: 0, fact_value: value,
    reported_by: user.user_id, input_type: "bot",
  });
  const newFact = (ctx.modules_fact || 0) + value;
  const newStatus = newFact >= (ctx.modules_plan || 0) ? "done" : "in_progress";
  await db.from("floors").update({ modules_fact: newFact, status: newStatus }).eq("id", ctx.floor_id);

  if (pfError) {
    await tgEdit(chatId, session.message_id, `❌ Ошибка: ${pfError.message}`, { inline_keyboard: [[{ text: "← Меню", callback_data: "f:menu" }]] });
    return;
  }
  await audit(chatId, user.user_id, "report:submit", { floor_id: ctx.floor_id, value });
  const pct = ctx.modules_plan > 0 ? Math.round((newFact / ctx.modules_plan) * 100) : 0;
  let text = `✅ <b>Отчёт сохранён</b>\n${SEP}\nФасад: ${ctx.facade_name}\nЭтаж ${ctx.floor_number}: +<b>${value}</b> мод.\nИтого: ${newFact}/${ctx.modules_plan || "?"} мод.\n${progressBar(pct)} ${pct}%\n`;
  if (newStatus === "done") text += "\n✅ <b>Этаж завершён!</b>";
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "📋 Ещё один этаж", callback_data: "f:report_start" }],
    [{ text: "← Главное меню", callback_data: "f:menu" }],
  ] });
  await clearSession(chatId);
  // Notify PM/Director
  if (ctx.project_id) {
    await db.from("bot_event_queue").insert({
      event_type: "report.submitted", target_roles: ["pm", "director"], project_id: ctx.project_id, priority: "normal",
      payload: { reporter_name: user.display_name, floor_number: ctx.floor_number, facade_name: ctx.facade_name, value, total_fact: newFact, total_plan: ctx.modules_plan, pct },
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
    text += `<b>${f.name}</b>: ${progressBar(s.pct)} ${s.pct}%\n  ${s.totalFact}/${s.totalPlan} мод. · ${s.doneFloors}/${s.floors.length} эт.\n\n`;
  }
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [[{ text: "← Меню", callback_data: "f:menu" }]] });
}

// ══════════════════════════════════════════════════════════════
// ЭКРАН: Бизнес-процессы (Workflow)
// ══════════════════════════════════════════════════════════════
const WORKFLOW_STAGES = [
  { key: "contract", icon: "📄", label: "Договорной этап" },
  { key: "launch", icon: "🚀", label: "Запуск проекта" },
  { key: "design", icon: "📐", label: "Проектные работы" },
  { key: "supply", icon: "📦", label: "Снабжение" },
  { key: "production", icon: "🏭", label: "Производство" },
  { key: "install", icon: "🔧", label: "Монтаж" },
  { key: "pto", icon: "📋", label: "ПТО" },
  { key: "control", icon: "🎯", label: "Контроль" },
];

const STAGE_MAP: Record<string, string> = {
  contract: "Договорной этап",
  launch: "Запуск проекта",
  design: "Проектные работы",
  supply: "Снабжение",
  production: "Производство",
  install: "Монтаж",
  pto: "ПТО",
  control: "Контроль",
};

async function getWorkflowTasks(projectId: string, block?: string) {
  let query = db.from("ecosystem_tasks")
    .select("id, code, name, status, priority, block, department, planned_date, responsible, progress")
    .eq("project_id", projectId)
    .order("task_number", { ascending: true });
  if (block) query = query.eq("block", block);
  const { data } = await query.limit(50);
  return data || [];
}

async function screenWorkflow(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) {
    if (isDirector(user.roles)) return screenDirectorMenu(chatId, user, session);
    if (isPM(user.roles)) return screenPMMenu(chatId, user, session);
    return screenForemanMenu(chatId, user, session);
  }

  const tasks = await getWorkflowTasks(projectId);
  let text = `⚙️ <b>Бизнес-процессы</b>\n${SEP}\n`;

  // Group by block
  const byBlock: Record<string, any[]> = {};
  for (const t of tasks) {
    if (!byBlock[t.block]) byBlock[t.block] = [];
    byBlock[t.block].push(t);
  }

  if (tasks.length === 0) {
    text += "Нет задач по процессам.\n<i>Добавьте задачи в приложении → Процессы</i>";
  } else {
    for (const stage of WORKFLOW_STAGES) {
      const blockTasks = byBlock[stage.label] || [];
      if (blockTasks.length === 0) continue;
      const done = blockTasks.filter((t: any) => t.status === "Выполнено").length;
      const inWork = blockTasks.filter((t: any) => t.status === "В работе").length;
      const total = blockTasks.length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const statusIcon = done === total ? "✅" : inWork > 0 ? "🔄" : "⏳";
      text += `\n${stage.icon} <b>${stage.label}</b> ${statusIcon}\n`;
      text += `${progressBar(pct)} ${pct}% (${done}/${total})\n`;
    }
  }

  const buttons: any[][] = [];
  // Show stage buttons for stages that have tasks
  const stagesWithTasks = WORKFLOW_STAGES.filter(s => (byBlock[s.label] || []).length > 0);
  for (let i = 0; i < stagesWithTasks.length; i += 2) {
    const row: any[] = [];
    row.push({ text: `${stagesWithTasks[i].icon} ${stagesWithTasks[i].label.slice(0, 15)}`, callback_data: `wf:stage:${stagesWithTasks[i].key}` });
    if (stagesWithTasks[i + 1]) {
      row.push({ text: `${stagesWithTasks[i + 1].icon} ${stagesWithTasks[i + 1].label.slice(0, 15)}`, callback_data: `wf:stage:${stagesWithTasks[i + 1].key}` });
    }
    buttons.push(row);
  }

  const rp = rolePrefix(user.roles);
  buttons.push([{ text: "← Меню", callback_data: `${rp}:menu` }]);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: buttons });
}

async function screenWorkflowStage(chatId: number, user: BotUser, session: any, stageKey: string) {
  const projectId = session?.context?.project_id;
  if (!projectId) return;
  const stageName = STAGE_MAP[stageKey];
  if (!stageName) return;

  const tasks = await getWorkflowTasks(projectId, stageName);
  const stageInfo = WORKFLOW_STAGES.find(s => s.key === stageKey);
  let text = `${stageInfo?.icon || "⚙️"} <b>${stageName}</b>\n${SEP}\n`;

  if (tasks.length === 0) {
    text += "Нет задач на этом этапе";
  } else {
    const si: Record<string, string> = { "В работе": "🔄", "Ожидание": "⏳", "Выполнено": "✅", "Заблокировано": "🚫" };
    for (const t of tasks) {
      text += `${si[t.status] || "⏳"} <b>[${t.code}]</b> ${t.name}\n`;
      if (t.responsible) text += `   👤 ${t.responsible}\n`;
      if (t.planned_date) text += `   📅 ${new Date(t.planned_date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}\n`;
      text += "\n";
    }
  }

  const buttons: any[][] = [];
  // Only PM/Director can change status
  if (isManager(user.roles) && tasks.length > 0) {
    const actionable = tasks.filter((t: any) => t.status !== "Выполнено").slice(0, 3);
    for (const t of actionable) {
      const nextStatus = t.status === "Ожидание" ? "В работе" : "Выполнено";
      const nextIcon = nextStatus === "В работе" ? "▶️" : "✅";
      const label = `${nextIcon} ${t.code}: ${nextStatus}`;
      buttons.push([{ text: label.slice(0, 40), callback_data: `wf:upd:${t.id}:${nextStatus === "В работе" ? "work" : "done"}` }]);
    }
  }

  const rp = rolePrefix(user.roles);
  buttons.push([{ text: "← Все процессы", callback_data: `${rp}:workflow` }]);
  buttons.push([{ text: "← Меню", callback_data: `${rp}:menu` }]);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: buttons });
}

async function handleWorkflowUpdate(chatId: number, user: BotUser, session: any, taskId: string, action: string) {
  const newStatus = action === "work" ? "В работе" : "Выполнено";
  const progress = action === "done" ? 100 : 50;

  const { data: task } = await db.from("ecosystem_tasks").select("code, name, block").eq("id", taskId).maybeSingle();
  if (!task) return;

  const { error } = await db.from("ecosystem_tasks").update({
    status: newStatus,
    progress,
    assigned_to: user.user_id,
  }).eq("id", taskId);

  if (error) {
    const rp = rolePrefix(user.roles);
    await tgEdit(chatId, session.message_id, `❌ Ошибка: ${error.message}`, { inline_keyboard: [[{ text: "← Назад", callback_data: `${rp}:workflow` }]] });
    return;
  }

  await audit(chatId, user.user_id, `workflow:${action}`, { task_id: taskId, code: task.code, status: newStatus });

  // Notify about status change
  await db.from("bot_event_queue").insert({
    event_type: "workflow.status_changed",
    target_roles: ["director", "pm"],
    project_id: session.context.project_id,
    priority: "normal",
    payload: {
      task_code: task.code,
      task_name: task.name,
      block: task.block,
      new_status: newStatus,
      changed_by: user.display_name,
    },
    scheduled_at: new Date().toISOString(),
  });

  const icon = action === "done" ? "✅" : "▶️";
  await tgEdit(chatId, session.message_id,
    `${icon} <b>[${task.code}] ${task.name}</b>\n\nСтатус: <b>${newStatus}</b>`,
    { inline_keyboard: [
      [{ text: "← К этапу", callback_data: `wf:stage:${Object.entries(STAGE_MAP).find(([, v]) => v === task.block)?.[0] || "contract"}` }],
      [{ text: "← Все процессы", callback_data: `${rolePrefix(user.roles)}:workflow` }],
    ] });
}

// ══════════════════════════════════════════════════════════════
// Alert creation flow
// ══════════════════════════════════════════════════════════════
async function screenAlertNew(chatId: number, user: BotUser, session: any) {
  const rp = rolePrefix(user.roles);
  await tgEdit(chatId, session.message_id, `✏️ <b>Новый алерт</b>\n${SEP}\nВыберите приоритет:`, { inline_keyboard: [
    [{ text: "🔴 Критический", callback_data: `alert_type:critical` }, { text: "🟠 Высокий", callback_data: `alert_type:high` }],
    [{ text: "🟡 Обычный", callback_data: `alert_type:normal` }, { text: "⚪ Низкий", callback_data: `alert_type:low` }],
    [{ text: "✕ Отмена", callback_data: `${rp}:alerts` }],
  ] });
  await saveSession(chatId, user.user_id, "ALERT_PRIORITY", { ...session.context, back: `${rp}:alerts` }, session.message_id);
}

async function screenAlertTitle(chatId: number, user: BotUser, session: any, priority: string) {
  const pl: Record<string, string> = { critical: "🔴 Критический", high: "🟠 Высокий", normal: "🟡 Обычный", low: "⚪ Низкий" };
  await tgEdit(chatId, session.message_id, `✏️ <b>Алерт: ${pl[priority] || priority}</b>\n${SEP}\n✉️ Введите заголовок:`,
    { inline_keyboard: [[{ text: "✕ Отмена", callback_data: session.context.back || "d:menu" }]] });
  await saveSession(chatId, user.user_id, "ALERT_TITLE", { ...session.context, alert_priority: priority }, session.message_id);
}

async function saveAlert(chatId: number, user: BotUser, session: any, title: string) {
  const ctx = session.context;
  const { error } = await db.from("alerts").insert({
    title, priority: ctx.alert_priority || "normal",
    type: ctx.alert_priority === "critical" ? "danger" : "warning",
    project_id: ctx.project_id, created_by: user.user_id,
    is_read: false, is_resolved: false,
  });
  const rp = rolePrefix(user.roles);
  const text = error ? `❌ Ошибка: ${error.message}` : `✅ <b>Алерт создан</b>\n${SEP}\n"${title}"\nПриоритет: ${ctx.alert_priority}`;
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [[{ text: "← Меню", callback_data: `${rp}:menu` }]] });
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

// ══════════════════════════════════════════════════════════════
// Unknown user
// ══════════════════════════════════════════════════════════════
async function screenUnknownUser(chatId: number, firstName: string) {
  await tgSend(chatId, `👋 <b>Добро пожаловать, ${firstName}!</b>\n${SEP}\nЭто внутренний бот STSphera.\n\nВаш Telegram не привязан к аккаунту.\nВойдите в приложение → ⚙️ Настройки → привяжите Telegram.\n\nВаш Chat ID: <code>${chatId}</code>`,
    { inline_keyboard: [[{ text: "🚀 Открыть STSphera", web_app: { url: APP_URL } }]] });
}

// ══════════════════════════════════════════════════════════════
// MAIN DISPATCHER
// ══════════════════════════════════════════════════════════════
async function handleUpdate(update: any) {
  // ── Text messages ─────────────────────────────────────────
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const text: string = msg.text || "";
    const firstName = msg.from?.first_name || "Пользователь";

    if (msg.voice) { await tgSend(chatId, "🎤 Голосовые отчёты доступны в Mini App (кнопка 🚀)."); return; }

    const user = await getUser(chatId);
    const session = user ? await getSession(chatId) : null;

    // /start, /menu
    if (text.startsWith("/start") || text.startsWith("/menu")) {
      if (!user) { await screenUnknownUser(chatId, firstName); return; }
      await tgDeleteMsg(chatId, msg.message_id);
      if (isDirector(user.roles)) return screenDirectorMenu(chatId, user, session);
      if (isPM(user.roles)) return screenPMMenu(chatId, user, session);
      if (isForeman(user.roles)) return screenForemanMenu(chatId, user, session);
      await tgSend(chatId, `👋 ${user.display_name}, ваша роль не настроена. Обратитесь к администратору.`);
      return;
    }

    // /help
    if (text.startsWith("/help")) {
      await tgDeleteMsg(chatId, msg.message_id);
      await tgSend(chatId, `ℹ️ <b>STSphera Bot</b>\n${SEP}\n/start — главное меню\n/menu — главное меню\n/projects — список проектов\n/settings — настройки\n\nИспользуйте кнопки для навигации.`);
      return;
    }

    // /projects
    if (text.startsWith("/projects")) {
      if (!user) { await screenUnknownUser(chatId, firstName); return; }
      await tgDeleteMsg(chatId, msg.message_id);
      return screenProjectsList(chatId, user, session);
    }

    // /settings
    if (text.startsWith("/settings")) {
      if (!user) { await screenUnknownUser(chatId, firstName); return; }
      await tgDeleteMsg(chatId, msg.message_id);
      return screenSettings(chatId, user, session);
    }

    // FSM text inputs
    if (user && session && session.state !== "IDLE") {
      await tgDeleteMsg(chatId, msg.message_id);

      if (session.state === "REPORT_INPUT") {
        const num = parseFloat(text.replace(",", "."));
        if (isNaN(num) || num <= 0 || num > 1000) {
          await tgEdit(chatId, session.message_id!, "⚠️ Введите число от 1 до 1000.\n\nСколько модулей за сегодня?");
          return;
        }
        return screenForemanReportConfirm(chatId, user, session, num);
      }

      if (session.state === "ALERT_TITLE") {
        const trimmed = text.trim().slice(0, 200);
        if (trimmed.length < 3) { await tgEdit(chatId, session.message_id!, "⚠️ Заголовок слишком короткий. Введите снова:"); return; }
        return saveAlert(chatId, user, session, trimmed);
      }

      if (session.state === "LOG_ZONE") {
        const zone = text.trim().slice(0, 100);
        if (zone.length < 2) { await tgEdit(chatId, session.message_id!, "⚠️ Слишком короткое название. Введите снова:"); return; }
        const updatedSession = { ...session, context: { ...session.context, log_zone: zone } };
        await saveSession(chatId, user.user_id, "LOG_WORKS", updatedSession.context, session.message_id ?? undefined);
        return screenLogWorks(chatId, user, updatedSession);
      }

      if (session.state === "LOG_WORKS") {
        const works = text.trim().slice(0, 500);
        if (works.length < 5) { await tgEdit(chatId, session.message_id!, "⚠️ Опишите подробнее. Введите снова:"); return; }
        const updatedSession = { ...session, context: { ...session.context, log_works: works } };
        await saveSession(chatId, user.user_id, "LOG_WORKERS", updatedSession.context, session.message_id ?? undefined);
        return screenLogWorkers(chatId, user, updatedSession);
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
    if (!session) {
      if (isDirector(user.roles)) return screenDirectorMenu(chatId, user, null);
      if (isPM(user.roles)) return screenPMMenu(chatId, user, null);
      if (isForeman(user.roles)) return screenForemanMenu(chatId, user, null);
      return;
    }

    // ── Projects ──
    if (data === "proj:list") return screenProjectsList(chatId, user, session);
    if (data.startsWith("proj:select:")) return selectProject(chatId, user, session, data.slice(12));

    // ── Common ──
    if (data === "c:settings") return screenSettings(chatId, user, session);
    if (data.startsWith("set:toggle:")) return toggleNotification(chatId, user, session, data.slice(11));

    // ── Approvals ──
    if (data.startsWith("appr:yes:")) return handleApproval(chatId, user, session, data.slice(9), "approved");
    if (data.startsWith("appr:no:")) return handleApproval(chatId, user, session, data.slice(8), "rejected");

    // ── Workflow ──
    if (data.startsWith("wf:stage:")) return screenWorkflowStage(chatId, user, session, data.slice(9));
    if (data.startsWith("wf:upd:")) {
      const parts = data.split(":");
      return handleWorkflowUpdate(chatId, user, session, parts[2], parts[3]);
    }

    // ── Daily logs ──
    if (data === "log:new") return screenLogZone(chatId, user, session);
    if (data.startsWith("log:workers:")) return saveLogEntry(chatId, user, session, parseInt(data.slice(12)));

    // ── Alert creation ──
    if (data.startsWith("alert_type:")) return screenAlertTitle(chatId, user, session, data.split(":")[1]);

    // ── Director ──
    if (data === "d:menu") return screenDirectorMenu(chatId, user, session);
    if (data === "d:dash") return screenDirectorDashboard(chatId, user, session);
    if (data === "d:alerts") return screenAlerts(chatId, user, session);
    if (data === "d:supply") return screenSupply(chatId, user, session);
    if (data === "d:facades") return screenFacades(chatId, user, session);
    if (data === "d:approvals") return screenApprovals(chatId, user, session);
    if (data === "d:logs") return screenDailyLogs(chatId, user, session);
    if (data === "d:alert_new") return screenAlertNew(chatId, user, session);
    if (data === "d:workflow") return screenWorkflow(chatId, user, session);
    if (data.startsWith("d:facade:")) return screenFacadeDetail(chatId, user, session, data.slice(9));

    // ── PM ──
    if (data === "pm:menu") return screenPMMenu(chatId, user, session);
    if (data === "pm:dash") return screenDirectorDashboard(chatId, user, session);
    if (data === "pm:alerts") return screenAlerts(chatId, user, session);
    if (data === "pm:supply") return screenSupply(chatId, user, session);
    if (data === "pm:tasks") return screenTasks(chatId, user, session);
    if (data === "pm:approvals") return screenApprovals(chatId, user, session);
    if (data === "pm:logs") return screenDailyLogs(chatId, user, session);
    if (data === "pm:alert_new") return screenAlertNew(chatId, user, session);
    if (data === "pm:workflow") return screenWorkflow(chatId, user, session);
    if (data === "pm:facades") return screenFacades(chatId, user, session);
    if (data.startsWith("pm:facade:")) return screenFacadeDetail(chatId, user, session, data.slice(10));

    // ── Foreman ──
    if (data === "f:menu") return screenForemanMenu(chatId, user, session);
    if (data === "f:report_start") return screenForemanReportFacade(chatId, user, session);
    if (data === "f:progress") return screenForemanProgress(chatId, user, session);
    if (data === "f:alerts") return screenAlerts(chatId, user, session);
    if (data === "f:tasks") return screenTasks(chatId, user, session);
    if (data === "f:logs") return screenDailyLogs(chatId, user, session);
    if (data === "f:facades") return screenFacades(chatId, user, session);
    if (data.startsWith("f:rep_facade:")) return screenForemanReportFloor(chatId, user, session, data.slice(13));
    if (data.startsWith("f:rep_floor:")) return screenForemanReportInput(chatId, user, session, data.slice(12));
    if (data.startsWith("f:rep_val:")) return screenForemanReportConfirm(chatId, user, session, parseInt(data.slice(10)));
    if (data.startsWith("f:rep_save:")) return saveForemanReport(chatId, user, session, parseInt(data.slice(11)));
    if (data.startsWith("f:facade:")) return screenFacadeDetail(chatId, user, session, data.slice(9));
  }
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("OK");
  try {
    const update = await req.json();
    await handleUpdate(update);
  } catch (err) {
    console.error("[Bot]", err instanceof Error ? err.message : err);
  }
  return new Response("OK");
});
