// ═══════════════════════════════════════════════════════════════
// STSphera Telegram Bot — рабочая версия под реальную схему
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SB_URL    = Deno.env.get("SUPABASE_URL")!;
const SB_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL   = Deno.env.get("MINI_APP_URL") || "https://lovable.dev/projects/fe942628-85b8-4407-a858-132ee496d745";
const TG        = `https://api.telegram.org/bot${BOT_TOKEN}`;
const db = createClient(SB_URL, SB_KEY);
const SEP = "─".repeat(29);

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
    body: JSON.stringify({ chat_id: chatId, message_id: msgId }) });
}
function progressBar(pct: number): string {
  const filled = Math.round(Math.min(pct, 100) / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

// ── DB HELPERS ──────────────────────────────────────────────
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

async function getSession(chatId: number) {
  const { data } = await db.from("bot_sessions").select("state, context, message_id, user_id")
    .eq("chat_id", String(chatId)).gt("expires_at", new Date().toISOString()).maybeSingle();
  return data as { state: string; context: any; message_id: number | null; user_id: string } | null;
}
async function saveSession(chatId: number, userId: string, state: string, context: any, msgId?: number) {
  await db.from("bot_sessions").upsert({ chat_id: String(chatId), user_id: userId, state, context: context || {},
    message_id: msgId ?? null, updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7200000).toISOString() }, { onConflict: "chat_id" });
}
async function clearSession(chatId: number) { await db.from("bot_sessions").update({ state: "IDLE", context: {} }).eq("chat_id", String(chatId)); }
async function audit(chatId: number, userId: string, action: string, payload?: object) {
  await db.from("bot_audit_log").insert({ chat_id: String(chatId), user_id: userId, action, payload: payload || {} });
}
async function getActiveProject() {
  const { data } = await db.from("projects").select("id, name, code, end_date").eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
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
  const { data } = await db.from("plan_fact").select("plan_value, fact_value, notes, work_type_id").eq("project_id", projectId).eq("date", today);
  const all = data || [];
  const plan = all.reduce((s: number, r: any) => s + Number(r.plan_value || 0), 0);
  const fact = all.reduce((s: number, r: any) => s + Number(r.fact_value || 0), 0);
  return { plan, fact, pct: plan > 0 ? Math.round((fact / plan) * 100) : 0, count: all.length };
}

// ── ЭКРАНЫ: Director ────────────────────────────────────────
async function screenDirectorMenu(chatId: number, user: BotUser, session: any) {
  const project = await getActiveProject();
  const today = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  let text = `👔 <b>${user.display_name}</b> · Директор\n${SEP}\n📅 ${today}\n\n`;
  if (project) {
    const pf = await getTodayPlanFact(project.id); const alerts = await getOpenAlerts(project.id);
    text += `🏗️ <b>${project.name}</b>\n`;
    text += pf.count > 0 ? `${progressBar(pf.pct)} <b>${pf.pct}%</b> сегодня\n` : `📊 Отчётов сегодня ещё нет\n`;
    if (alerts.counts.total > 0) { text += `🔔 Алертов: <b>${alerts.counts.total}</b>`; if (alerts.counts.critical > 0) text += `  🔴 крит: <b>${alerts.counts.critical}</b>`; text += "\n"; }
  }
  const buttons = [[{ text: "📊 Дашборд", callback_data: "d:dash" }, { text: "🔔 Алерты", callback_data: "d:alerts" }],
    [{ text: "📦 Снабжение", callback_data: "d:supply" }, { text: "🏗️ Фасады", callback_data: "d:facades" }],
    [{ text: "🚀 Открыть приложение", url: APP_URL }]];
  const msgId = session?.message_id;
  if (msgId) { await tgEdit(chatId, msgId, text, { inline_keyboard: buttons }); await saveSession(chatId, user.user_id, "IDLE", { project_id: project?.id }, msgId); }
  else { const n = await tgSend(chatId, text, { inline_keyboard: buttons }); await saveSession(chatId, user.user_id, "IDLE", { project_id: project?.id }, n ?? undefined); }
}

async function screenDirectorDashboard(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  const project = projectId ? (await db.from("projects").select("id, name, end_date").eq("id", projectId).maybeSingle()).data : await getActiveProject();
  if (!project) { await tgEdit(chatId, session.message_id, "❌ Нет активных проектов.", { inline_keyboard: [[{ text: "← Назад", callback_data: "d:menu" }]] }); return; }
  const facades = await getFacades(project.id); const alerts = await getOpenAlerts(project.id);
  const today = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  let totalPlan = 0, totalFact = 0;
  for (const f of facades) { const s = await getFacadeStats(f.id); totalPlan += s.totalPlan; totalFact += s.totalFact; }
  const totalPct = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;
  const daysLeft = project.end_date ? Math.ceil((new Date(project.end_date).getTime() - Date.now()) / 86400000) : null;
  let text = `📊 <b>Дашборд</b>\n${SEP}\n🏗️ ${project.name}\n📅 ${today}\n\n${progressBar(totalPct)} <b>${totalPct}%</b>\nМодули: ${totalFact} / ${totalPlan} шт.\n\n`;
  if (daysLeft !== null) text += daysLeft < 0 ? `🔴 Просрочка: <b>${Math.abs(daysLeft)} дн.</b>\n` : `📅 До сдачи: <b>${daysLeft} дн.</b>\n`;
  if (facades.length > 0) { text += `\n<b>По фасадам:</b>\n`; for (const f of facades) { const s = await getFacadeStats(f.id); text += `${f.name}: ${progressBar(s.pct)} ${s.pct}%  (${s.totalFact}/${s.totalPlan})\n`; } }
  if (alerts.counts.total > 0) { text += `\n🔔 Алертов: ${alerts.counts.total}`; if (alerts.counts.critical > 0) text += `  🔴 крит: ${alerts.counts.critical}`; text += "\n"; }
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [[{ text: "🔔 Алерты", callback_data: "d:alerts" }, { text: "📦 Снабжение", callback_data: "d:supply" }], [{ text: "← Меню", callback_data: "d:menu" }]] });
}

async function screenDirectorAlerts(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) { await screenDirectorMenu(chatId, user, session); return; }
  const { list, counts } = await getOpenAlerts(projectId, 8);
  let text = `🔔 <b>Алерты</b>\n${SEP}\n`;
  if (counts.total === 0) { text += "✅ Нет открытых алертов"; }
  else {
    text += `Открытых: <b>${counts.total}</b>`; if (counts.critical > 0) text += `  🔴 крит: <b>${counts.critical}</b>`; text += `\n\n`;
    const pe: Record<string, string> = { critical: "🔴", high: "🟠", normal: "🟡", low: "⚪" };
    for (const a of list) { const age = Math.round((Date.now() - new Date(a.created_at).getTime()) / 3600000); text += `${pe[a.priority] || "⚪"} ${a.title}\n`; if (a.floor_number) text += `   Этаж ${a.floor_number}`; text += `   <i>${age}ч назад</i>\n`; }
    if (counts.total > list.length) text += `\n<i>...ещё ${counts.total - list.length}</i>`;
  }
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [[{ text: "✏️ Создать алерт", callback_data: "d:alert_new" }], [{ text: "← Меню", callback_data: "d:menu" }]] });
}

async function screenDirectorSupply(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) { await screenDirectorMenu(chatId, user, session); return; }
  const deficit = await getDeficitMaterials(projectId);
  let text = `📦 <b>Снабжение</b>\n${SEP}\n`;
  if (deficit.length === 0) { text += "✅ Дефицита нет"; }
  else { text += `⚠️ Дефицит по <b>${deficit.length}</b> позициям:\n\n`;
    for (const m of deficit) { const etaStr = m.eta ? ` · ETA ${new Date(m.eta).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}` : "";
      text += `📌 ${m.name}\n   Нужно: ${m.total_required} ${m.unit} · На объекте: ${m.on_site}${etaStr}\n   ⚠️ Дефицит: <b>${m.deficit} ${m.unit}</b>\n\n`; } }
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [[{ text: "🚀 Снабжение в приложении", url: APP_URL }], [{ text: "← Меню", callback_data: "d:menu" }]] });
}

async function screenDirectorFacades(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) { await screenDirectorMenu(chatId, user, session); return; }
  const facades = await getFacades(projectId);
  let text = `🏗️ <b>Фасады</b>\n${SEP}\n`;
  for (const f of facades) { const s = await getFacadeStats(f.id); text += `<b>${f.name}</b> ${f.code ? `(${f.code})` : ""}\n${progressBar(s.pct)} ${s.pct}%  ${s.totalFact}/${s.totalPlan} мод.\nЭтажей завершено: ${s.doneFloors}/${s.floors.length}\n\n`; }
  const buttons = facades.map((f: any) => [{ text: `📋 ${f.name}`, callback_data: `d:facade:${f.id}` }]);
  buttons.push([{ text: "← Меню", callback_data: "d:menu" }]);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: buttons });
}

async function screenDirectorFacadeDetail(chatId: number, user: BotUser, session: any, facadeId: string) {
  const { data: facade } = await db.from("facades").select("name, code, total_modules, floors_count").eq("id", facadeId).maybeSingle();
  if (!facade) return;
  const stats = await getFacadeStats(facadeId);
  let text = `🏗️ <b>${facade.name}</b>${facade.code ? ` (${facade.code})` : ""}\n${SEP}\n${progressBar(stats.pct)} <b>${stats.pct}%</b>\nМодули: ${stats.totalFact} / ${stats.totalPlan} шт.\n\n`;
  if (stats.floors.length > 0) { text += `<b>По этажам:</b>\n`;
    const sorted = [...stats.floors].sort((a: any, b: any) => b.floor_number - a.floor_number);
    for (const fl of sorted.slice(0, 8)) { const flPct = fl.modules_plan > 0 ? Math.round((fl.modules_fact / fl.modules_plan) * 100) : 0;
      const icon = fl.status === "done" ? "✅" : fl.status === "in_progress" ? "🔄" : "⬜"; text += `${icon} Эт.${fl.floor_number}: ${fl.modules_fact}/${fl.modules_plan} мод. (${flPct}%)\n`; } }
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [[{ text: "← Все фасады", callback_data: "d:facades" }], [{ text: "← Меню", callback_data: "d:menu" }]] });
}

// ── ЭКРАНЫ: PM ──────────────────────────────────────────────
async function screenPMMenu(chatId: number, user: BotUser, session: any) {
  const project = await getActiveProject();
  const today = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  let text = `👷 <b>${user.display_name}</b> · РП\n${SEP}\n📅 ${today}\n\n`;
  if (project) { const pf = await getTodayPlanFact(project.id); const alerts = await getOpenAlerts(project.id);
    text += `🏗️ ${project.name}\n`; if (pf.count > 0) text += `${progressBar(pf.pct)} <b>${pf.pct}%</b> сегодня\n`;
    if (alerts.counts.total > 0) text += `🔔 Алертов: <b>${alerts.counts.total}</b>\n`; }
  const buttons = [[{ text: "📊 Дашборд", callback_data: "pm:dash" }, { text: "🔔 Алерты", callback_data: "pm:alerts" }],
    [{ text: "📋 Мои задачи", callback_data: "pm:tasks" }, { text: "📦 Снабжение", callback_data: "pm:supply" }],
    [{ text: "✏️ Новый алерт", callback_data: "pm:alert_new" }], [{ text: "🚀 Открыть приложение", url: APP_URL }]];
  const msgId = session?.message_id;
  if (msgId) { await tgEdit(chatId, msgId, text, { inline_keyboard: buttons }); await saveSession(chatId, user.user_id, "IDLE", { project_id: project?.id }, msgId); }
  else { const n = await tgSend(chatId, text, { inline_keyboard: buttons }); await saveSession(chatId, user.user_id, "IDLE", { project_id: project?.id }, n ?? undefined); }
}

async function screenPMTasks(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id;
  if (!projectId) { await screenPMMenu(chatId, user, session); return; }
  const tasks = await getMyTasks(user.user_id, projectId);
  let text = `📋 <b>Мои задачи</b>\n${SEP}\n`;
  if (tasks.length === 0) { text += "✅ Нет активных задач"; }
  else { const pe: Record<string, string> = { "Критический": "🔴", "Высокий": "🟠", "Средний": "🟡", "По факту": "⚪" };
    const si: Record<string, string> = { "В работе": "🔄", "Ожидание": "⏳", "Выполнено": "✅" };
    for (const t of tasks) { const d = t.planned_date ? new Date(t.planned_date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "";
      text += `${pe[t.priority] || "⚪"} ${si[t.status] || "⏳"} <b>[${t.code}]</b> ${t.name}\n`; if (d) text += `   📅 ${d}\n`; text += "\n"; } }
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [[{ text: "🚀 Все задачи в приложении", url: APP_URL }], [{ text: "← Меню", callback_data: "pm:menu" }]] });
}

// ── ЭКРАНЫ: Прораб ──────────────────────────────────────────
async function screenForemanMenu(chatId: number, user: BotUser, session: any) {
  const project = await getActiveProject();
  const today = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  let text = `🏗️ <b>${user.display_name}</b> · Прораб\n${SEP}\n📅 ${today}\n\n`;
  if (project) { text += `🏗️ ${project.name}\n`; const pf = await getTodayPlanFact(project.id);
    text += pf.count > 0 ? `${progressBar(pf.pct)} <b>${pf.pct}%</b> сегодня\n` : `⚠️ <b>Отчёт за сегодня не подан</b>\n`; }
  const buttons = [[{ text: "📋 Подать отчёт", callback_data: "f:report_start" }],
    [{ text: "📊 Мой прогресс", callback_data: "f:progress" }, { text: "🔔 Алерты", callback_data: "f:alerts" }],
    [{ text: "📋 Задачи", callback_data: "f:tasks" }], [{ text: "🚀 Открыть приложение", url: APP_URL }]];
  const msgId = session?.message_id;
  if (msgId) { await tgEdit(chatId, msgId, text, { inline_keyboard: buttons }); await saveSession(chatId, user.user_id, "IDLE", { project_id: project?.id }, msgId); }
  else { const n = await tgSend(chatId, text, { inline_keyboard: buttons }); await saveSession(chatId, user.user_id, "IDLE", { project_id: project?.id }, n ?? undefined); }
}

async function screenForemanReportFacade(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id; if (!projectId) { await screenForemanMenu(chatId, user, session); return; }
  const facades = await getFacades(projectId);
  const buttons = facades.map((f: any) => [{ text: `${f.name} (${f.total_modules} мод.)`, callback_data: `f:rep_facade:${f.id}` }]);
  buttons.push([{ text: "✕ Отмена", callback_data: "f:menu" }]);
  await tgEdit(chatId, session.message_id, `📋 <b>Отчёт — выбор фасада</b>\n${SEP}\nВыберите фасад:`, { inline_keyboard: buttons });
  await saveSession(chatId, user.user_id, "REPORT_FACADE", { project_id: projectId }, session.message_id);
}

async function screenForemanReportFloor(chatId: number, user: BotUser, session: any, facadeId: string) {
  const { data: facade } = await db.from("facades").select("name").eq("id", facadeId).maybeSingle();
  const { data: floors } = await db.from("floors").select("id, floor_number, modules_plan, modules_fact, status").eq("facade_id", facadeId).order("floor_number", { ascending: false }).limit(20);
  const rows: any[][] = [];
  for (let i = 0; i < (floors || []).length; i += 4) { rows.push((floors || []).slice(i, i + 4).map((fl: any) => {
    const icon = fl.status === "done" ? "✅" : fl.status === "in_progress" ? "🔄" : "⬜"; return { text: `${icon}${fl.floor_number}`, callback_data: `f:rep_floor:${fl.id}` }; })); }
  rows.push([{ text: "← Назад", callback_data: "f:report_start" }]);
  await tgEdit(chatId, session.message_id, `📋 <b>Отчёт · ${facade?.name}</b>\n${SEP}\nВыберите этаж:\n<i>(✅ = завершён, 🔄 = в работе, ⬜ = не начат)</i>`, { inline_keyboard: rows });
  await saveSession(chatId, user.user_id, "REPORT_FLOOR", { ...session.context, facade_id: facadeId, facade_name: facade?.name }, session.message_id);
}

async function screenForemanReportInput(chatId: number, user: BotUser, session: any, floorId: string) {
  const { data: floor } = await db.from("floors").select("floor_number, modules_plan, modules_fact, brackets_plan, brackets_fact").eq("id", floorId).maybeSingle();
  if (!floor) return;
  const remaining = Math.max(0, (floor.modules_plan || 0) - (floor.modules_fact || 0));
  await tgEdit(chatId, session.message_id,
    `📋 <b>Ввод факта</b>\n${SEP}\nФасад: ${session.context.facade_name}\nЭтаж: <b>${floor.floor_number}</b>\n\nПлан: ${floor.modules_plan} мод.\nФакт до сегодня: ${floor.modules_fact} мод.\nОсталось: <b>${remaining} мод.</b>\n\n✏️ <b>Введите количество модулей за сегодня:</b>`,
    { inline_keyboard: [[5,10,15,20].map(n => ({ text: String(n), callback_data: `f:rep_val:${n}` })), [25,30,40,50].map(n => ({ text: String(n), callback_data: `f:rep_val:${n}` })), [{ text: "✕ Отмена", callback_data: "f:menu" }]] });
  await saveSession(chatId, user.user_id, "REPORT_INPUT", { ...session.context, floor_id: floorId, floor_number: floor.floor_number, modules_plan: floor.modules_plan, modules_fact: floor.modules_fact }, session.message_id);
}

async function screenForemanReportConfirm(chatId: number, user: BotUser, session: any, value: number) {
  const ctx = session.context;
  await tgEdit(chatId, session.message_id, `📋 <b>Подтверждение отчёта</b>\n${SEP}\nФасад: ${ctx.facade_name}\nЭтаж: <b>${ctx.floor_number}</b>\nФакт за сегодня: <b>${value} модулей</b>\n\nСохранить?`,
    { inline_keyboard: [[{ text: "✅ Да, сохранить", callback_data: `f:rep_save:${value}` }, { text: "✏️ Изменить", callback_data: `f:rep_floor:${ctx.facade_id}` }], [{ text: "✕ Отмена", callback_data: "f:menu" }]] });
}

async function saveForemanReport(chatId: number, user: BotUser, session: any, value: number) {
  const ctx = session.context; const today = new Date().toISOString().split("T")[0]; const weekNum = Math.ceil(new Date().getDate() / 7);
  const { error: pfError } = await db.from("plan_fact").insert({ project_id: ctx.project_id, facade_id: ctx.facade_id, floor_id: ctx.floor_id, week_number: weekNum, date: today, plan_value: 0, fact_value: value, reported_by: user.user_id, input_type: "bot" });
  const newFact = (ctx.modules_fact || 0) + value; const newStatus = newFact >= (ctx.modules_plan || 0) ? "done" : "in_progress";
  await db.from("floors").update({ modules_fact: newFact, status: newStatus }).eq("id", ctx.floor_id);
  if (pfError) { await tgEdit(chatId, session.message_id, `❌ Ошибка сохранения: ${pfError.message}`, { inline_keyboard: [[{ text: "← Меню", callback_data: "f:menu" }]] }); return; }
  await audit(chatId, user.user_id, "report:submit", { floor_id: ctx.floor_id, value });
  const pct = ctx.modules_plan > 0 ? Math.round((newFact / ctx.modules_plan) * 100) : 0;
  await tgEdit(chatId, session.message_id, `✅ <b>Отчёт сохранён</b>\n${SEP}\nФасад: ${ctx.facade_name}\nЭтаж ${ctx.floor_number}: +<b>${value}</b> мод.\nИтого: ${newFact}/${ctx.modules_plan || "?"} мод.\n${progressBar(pct)} ${pct}%\n` + (newStatus === "done" ? "\n✅ <b>Этаж завершён!</b>" : ""),
    { inline_keyboard: [[{ text: "📋 Ещё один этаж", callback_data: "f:report_start" }], [{ text: "← Главное меню", callback_data: "f:menu" }]] });
  await clearSession(chatId);
  if (ctx.project_id) { await db.from("bot_event_queue").insert({ event_type: "report.submitted", target_roles: ["pm", "director"], project_id: ctx.project_id, priority: "normal",
    payload: { reporter_name: user.display_name, floor_number: ctx.floor_number, facade_name: ctx.facade_name, value, total_fact: newFact, total_plan: ctx.modules_plan, pct }, scheduled_at: new Date().toISOString() }); }
}

async function screenForemanProgress(chatId: number, user: BotUser, session: any) {
  const projectId = session?.context?.project_id; if (!projectId) { await screenForemanMenu(chatId, user, session); return; }
  const facades = await getFacades(projectId); const today = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  let text = `📊 <b>Прогресс</b>\n${SEP}\n📅 ${today}\n\n`;
  for (const f of facades) { const s = await getFacadeStats(f.id); text += `<b>${f.name}</b>: ${progressBar(s.pct)} ${s.pct}%\n  ${s.totalFact}/${s.totalPlan} мод. · ${s.doneFloors}/${s.floors.length} эт.\n\n`; }
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [[{ text: "← Меню", callback_data: "f:menu" }]] });
}

// ── Алерты ──────────────────────────────────────────────────
async function screenAlertNew(chatId: number, user: BotUser, session: any, role: string) {
  const backCb = isDirector([role]) ? "d:alerts" : "pm:alerts";
  await tgEdit(chatId, session.message_id, `✏️ <b>Новый алерт</b>\n${SEP}\nВыберите тип:`, { inline_keyboard: [
    [{ text: "🔴 Критический", callback_data: `alert_type:critical:${role}` }, { text: "🟠 Высокий", callback_data: `alert_type:high:${role}` }],
    [{ text: "🟡 Обычный", callback_data: `alert_type:normal:${role}` }, { text: "⚪ Низкий", callback_data: `alert_type:low:${role}` }],
    [{ text: "✕ Отмена", callback_data: backCb }]] });
  await saveSession(chatId, user.user_id, "ALERT_PRIORITY", { ...session.context, back: backCb }, session.message_id);
}

async function screenAlertTitle(chatId: number, user: BotUser, session: any, priority: string) {
  const pl: Record<string, string> = { critical: "🔴 Критический", high: "🟠 Высокий", normal: "🟡 Обычный", low: "⚪ Низкий" };
  await tgEdit(chatId, session.message_id, `✏️ <b>Алерт: ${pl[priority] || priority}</b>\n${SEP}\n✉️ Введите заголовок алерта:`,
    { inline_keyboard: [[{ text: "✕ Отмена", callback_data: session.context.back }]] });
  await saveSession(chatId, user.user_id, "ALERT_TITLE", { ...session.context, alert_priority: priority }, session.message_id);
}

async function saveAlert(chatId: number, user: BotUser, session: any, title: string) {
  const ctx = session.context;
  const { error } = await db.from("alerts").insert({ title, priority: ctx.alert_priority || "normal", type: ctx.alert_priority === "critical" ? "danger" : "warning", project_id: ctx.project_id, created_by: user.user_id, is_read: false, is_resolved: false });
  const text = error ? `❌ Ошибка: ${error.message}` : `✅ <b>Алерт создан</b>\n${SEP}\n"${title}"\nПриоритет: ${ctx.alert_priority}`;
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [[{ text: "← Меню", callback_data: ctx.back?.split(":")[0] === "d" ? "d:menu" : "pm:menu" }]] });
  if (!error) { await audit(chatId, user.user_id, "alert:create", { title, priority: ctx.alert_priority });
    await db.from("bot_event_queue").insert({ event_type: "alert.created", target_roles: ["director", "pm"], project_id: ctx.project_id,
      priority: ctx.alert_priority === "critical" ? "critical" : "high", payload: { title, priority: ctx.alert_priority, creator: user.display_name }, scheduled_at: new Date().toISOString() }); }
  await clearSession(chatId);
}

async function screenUnknownUser(chatId: number, firstName: string) {
  await tgSend(chatId, `👋 <b>Добро пожаловать, ${firstName}!</b>\n${SEP}\nЭто внутренний бот STSphera.\n\nВаш Telegram не привязан к аккаунту.\nВойдите в приложение и привяжите Telegram в настройках профиля.`,
    { inline_keyboard: [[{ text: "🚀 Открыть STSphera", url: APP_URL }]] });
}

// ── ДИСПЕТЧЕР ───────────────────────────────────────────────
async function handleUpdate(update: any) {
  if (update.message) {
    const msg = update.message; const chatId = msg.chat.id; const text: string = msg.text || ""; const firstName = msg.from?.first_name || "Пользователь";
    if (msg.voice) { await tgSend(chatId, "🎤 Голосовые отчёты доступны в Mini App (кнопка 🚀 в главном меню)."); return; }
    const user = await getUser(chatId); const session = user ? await getSession(chatId) : null;
    if (text.startsWith("/start") || text.startsWith("/menu")) {
      if (!user) { await screenUnknownUser(chatId, firstName); return; }
      await tgDeleteMsg(chatId, msg.message_id).catch(() => {});
      if (isDirector(user.roles)) return screenDirectorMenu(chatId, user, session);
      if (isPM(user.roles)) return screenPMMenu(chatId, user, session);
      if (isForeman(user.roles)) return screenForemanMenu(chatId, user, session);
      await tgSend(chatId, `👋 ${user.display_name}, ваша роль не настроена. Обратитесь к администратору.`); return;
    }
    if (text.startsWith("/help")) { await tgDeleteMsg(chatId, msg.message_id).catch(() => {}); await tgSend(chatId, `ℹ️ <b>STSphera Bot</b>\n${SEP}\n/start — главное меню\n/menu  — главное меню\n\nИспользуйте кнопки для навигации.`); return; }
    if (user && session && session.state !== "IDLE") {
      await tgDeleteMsg(chatId, msg.message_id).catch(() => {});
      if (session.state === "REPORT_INPUT") { const num = parseFloat(text.replace(",", ".")); if (isNaN(num) || num <= 0 || num > 1000) { await tgEdit(chatId, session.message_id!, `⚠️ Введите число от 1 до 1000.\n\nСколько модулей за сегодня?`); return; } return screenForemanReportConfirm(chatId, user, session, num); }
      if (session.state === "ALERT_TITLE") { const trimmed = text.trim().slice(0, 200); if (trimmed.length < 3) { await tgEdit(chatId, session.message_id!, "⚠️ Заголовок слишком короткий. Введите снова:"); return; } return saveAlert(chatId, user, session, trimmed); }
    }
  }
  if (update.callback_query) {
    const cq = update.callback_query; const chatId = cq.from.id; const data: string = cq.data || "";
    await tgAnswer(cq.id);
    const user = await getUser(chatId); if (!user) { await screenUnknownUser(chatId, cq.from.first_name || ""); return; }
    const session = await getSession(chatId);
    if (!session) { if (isDirector(user.roles)) return screenDirectorMenu(chatId, user, null); if (isPM(user.roles)) return screenPMMenu(chatId, user, null); if (isForeman(user.roles)) return screenForemanMenu(chatId, user, null); return; }
    if (data === "d:menu") return screenDirectorMenu(chatId, user, session);
    if (data === "d:dash") return screenDirectorDashboard(chatId, user, session);
    if (data === "d:alerts") return screenDirectorAlerts(chatId, user, session);
    if (data === "d:supply") return screenDirectorSupply(chatId, user, session);
    if (data === "d:facades") return screenDirectorFacades(chatId, user, session);
    if (data === "d:alert_new") return screenAlertNew(chatId, user, session, "director");
    if (data.startsWith("d:facade:")) return screenDirectorFacadeDetail(chatId, user, session, data.slice(9));
    if (data === "pm:menu") return screenPMMenu(chatId, user, session);
    if (data === "pm:dash") return screenDirectorDashboard(chatId, user, session);
    if (data === "pm:alerts") return screenDirectorAlerts(chatId, user, session);
    if (data === "pm:supply") return screenDirectorSupply(chatId, user, session);
    if (data === "pm:tasks") return screenPMTasks(chatId, user, session);
    if (data === "pm:alert_new") return screenAlertNew(chatId, user, session, "pm");
    if (data === "f:menu") return screenForemanMenu(chatId, user, session);
    if (data === "f:report_start") return screenForemanReportFacade(chatId, user, session);
    if (data === "f:progress") return screenForemanProgress(chatId, user, session);
    if (data === "f:alerts") return screenDirectorAlerts(chatId, user, session);
    if (data === "f:tasks") return screenPMTasks(chatId, user, session);
    if (data.startsWith("f:rep_facade:")) return screenForemanReportFloor(chatId, user, session, data.slice(13));
    if (data.startsWith("f:rep_floor:")) return screenForemanReportInput(chatId, user, session, data.slice(12));
    if (data.startsWith("f:rep_val:")) return screenForemanReportConfirm(chatId, user, session, parseInt(data.slice(10)));
    if (data.startsWith("f:rep_save:")) return saveForemanReport(chatId, user, session, parseInt(data.slice(11)));
    if (data.startsWith("alert_type:")) return screenAlertTitle(chatId, user, session, data.split(":")[1]);
  }
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("OK");
  try { const update = await req.json(); await handleUpdate(update); } catch (err) { console.error("[Bot]", err instanceof Error ? err.message : err); }
  return new Response("OK");
});
