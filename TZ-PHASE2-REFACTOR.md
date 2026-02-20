# ТЗ для Lovable — Фаза 2: Полный рефакторинг Telegram Bot

> Проект: STSphera TMA (ООО «СФЕРА»)
> Дата: 2026-02-21
> Тип: Рефакторинг архитектуры бота
> Текущее состояние: монолит 1640 строк в одном файле

---

## ЦЕЛЬ

Разнести монолитный `telegram-bot/index.ts` (1640 строк) на модульную архитектуру.
Сохранить 100% текущего функционала. Исправить все найденные баги и заглушки.

---

## ЦЕЛЕВАЯ СТРУКТУРА ФАЙЛОВ

```
supabase/functions/telegram-bot/
├── index.ts                    # Точка входа: webhook → dispatcher (≤80 строк)
├── dispatcher.ts               # Роутинг callback/text → handler (≤150 строк)
├── lib/
│   ├── tg.ts                   # TG API: tgSend, tgEdit, tgAnswer, tgDeleteMsg
│   ├── db.ts                   # Supabase client + все data fetchers
│   ├── session.ts              # getSession, saveSession, clearSession
│   ├── roles.ts                # ROLE_PRIORITY, ROLE_LABELS, ROLE_PREFIXES, detectPrimaryRole, isForeman, isManager, rp, roleLabel
│   ├── ui.ts                   # progressBar, sendOrEdit, todayStr, иконки
│   └── audit.ts                # audit()
├── screens/
│   ├── shared.ts               # screenDashboard, screenAlerts, screenSupply, screenFacades, screenFacadeDetail, screenApprovals, screenTasks, screenDailyLogs, screenSettings, screenProjectsList, screenInbox, screenInboxDetail, screenProgress
│   ├── director.ts             # screenDirectorMenu, screenPortfolio, screenKPI, screenCritical, screenFinance
│   ├── pm.ts                   # screenPMMenu, screenPMSend, screenPMSendLaunch, screenPMSendDesign, screenPMSendSupply, screenPMSendProd, screenPMQuick
│   ├── opr.ts                  # screenOPRMenu, screenOPRSend
│   ├── km.ts                   # screenKMMenu, screenKMSend
│   ├── kmd.ts                  # screenKMDMenu, screenKMDSend
│   ├── supply.ts               # screenSupplyMenu, screenSupplySend, screenSupplyStatus, screenSupplyDeficit
│   ├── production.ts           # screenProductionMenu, screenProductionSend, screenProductionLoad
│   ├── foreman.ts              # screenForemanMenu, screenForemanSend, screenForemanPhoto, screenForemanProgress, screenForemanReport*
│   ├── pto.ts                  # screenPTOMenu, screenPTOSend, screenPTORegistry
│   ├── inspector.ts            # screenInspectorMenu, screenInspectorSend, screenInspectorAccept, screenInspectorHistory
│   └── generic.ts              # screenGenericMenu
├── fsm/
│   ├── document.ts             # DOC_FSM_MAP + startDocFSM, handleDocFile, handleDocComment, handleDocConfirm
│   ├── photo.ts                # startPhotoFSM, screenPhotoFloor, screenPhotoUpload, handlePhotoFile, screenPhotoComment, handlePhotoComment, handlePhotoConfirm
│   ├── report.ts               # screenForemanReportFacade, screenForemanReportFloor, screenForemanReportInput, screenForemanReportConfirm, saveForemanReport
│   ├── alert.ts                # screenAlertNew, screenAlertTitle, saveAlert
│   └── daily-log.ts            # screenLogZone, screenLogWorks, screenLogWorkers, saveLogEntry
└── unknown.ts                  # screenUnknownUser
```

**Удалить мёртвый код:**
- `_shared/botFSM.ts` — не используется ботом, несовместимая схема сессий
- `_shared/botScreens.ts` — не используется ботом, дублирует функционал

**Оставить:**
- `_shared/botUtils.ts` — используется другими функциями (не ботом)
- `_shared/authMiddleware.ts` — используется ai-chat и будет добавлен в другие
- `_shared/rateLimit.ts` — пока оставить
- `_shared/validateTelegram.ts` — подключить к боту (см. Блок 7)

---

## БЛОК 1: Точка входа — `index.ts`

Минимальный файл. Только webhook → dispatcher.

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleUpdate } from "./dispatcher.ts";

serve(async (req) => {
  if (req.method !== "POST") return new Response("OK");
  try {
    const update = await req.json();
    await handleUpdate(update);
  } catch (err) {
    console.error("[Bot] ERROR:", err instanceof Error ? err.stack : String(err));
  }
  return new Response("OK");
});
```

---

## БЛОК 2: Библиотеки (`lib/`)

### `lib/tg.ts`
Вынести из index.ts:
- `tgSend`, `tgEdit`, `tgAnswer`, `tgDeleteMsg`
- Константы: `BOT_TOKEN`, `TG`

### `lib/db.ts`
Вынести:
- Supabase client (`db`)
- Все data fetchers: `getUser`, `getProjects`, `getProject`, `getFacades`, `getFacadeStats`, `getOpenAlerts`, `getDeficitMaterials`, `getMyTasks`, `getTodayPlanFact`, `getPendingApprovals`, `getDailyLogs`, `getInboxCount`, `getInboxItems`
- Типы: `BotUser`

### `lib/session.ts`
Вынести:
- `getSession`, `saveSession`, `clearSession`
- **ИСПРАВИТЬ TTL:** `7200000` → `28800000` (8 часов) — BUG-007

### `lib/roles.ts`
Вынести:
- `ROLE_PRIORITY`, `ROLE_LABELS`, `ROLE_PREFIXES`
- `detectPrimaryRole`, `isForeman`, `isManager`, `rp`, `roleLabel`

### `lib/ui.ts`
Вынести:
- `progressBar`, `sendOrEdit`, `todayStr`
- Иконки: `pe`, `typeIcons`, `typeLabels`
- `SEP`, `APP_URL`

### `lib/audit.ts`
Вынести:
- `audit()`

---

## БЛОК 3: Shared экраны (`screens/shared.ts`)

Вынести без изменений:
- `screenDashboard`
- `screenAlerts`
- `screenSupply`
- `screenFacades`, `screenFacadeDetail`
- `screenApprovals`, `handleApproval`
- `screenTasks`
- `screenDailyLogs`
- `screenSettings`, `toggleNotification`
- `screenProjectsList`, `selectProject`
- `screenInbox`, `screenInboxDetail`, `handleInboxDone`
- `screenProgress`

Каждая функция импортирует из `lib/`.

---

## БЛОК 4: Ролевые экраны (`screens/*.ts`)

Каждый файл — один экспорт на роль. Вынести текущие функции + исправить проблемы:

### `screens/director.ts`
Вынести: `screenDirectorMenu`, `screenPortfolio`, `screenKPI`, `screenCritical`, `screenFinance`

**Добавить:**
- Кнопку "📥 Входящие" в меню директора (callback: `d:inbox`)
- Зарегистрировать `d:inbox` в dispatcher → `screenInbox(chatId, user, session, "director", "d")`

### `screens/pm.ts`
Вынести: `screenPMMenu`, `screenPMSend`, `screenPMSendLaunch`, `screenPMSendDesign`, `screenPMQuick`

**Исправить:**
- `pm:s:supply` — создать `screenPMSendSupply` с подкатегориями отправки для снабжения:
```typescript
async function screenPMSendSupply(chatId, user, session) {
  await tgEdit(chatId, session.message_id, `📦 <b>Снабжение · Документы</b>\n${SEP}`, { inline_keyboard: [
    [{ text: "📊 Запрос статуса закупки", callback_data: "pm:doc:sup_status" }],
    [{ text: "📦 Заявка на материалы", callback_data: "pm:doc:mat_req" }],
    [{ text: "⚠️ Эскалация дефицита", callback_data: "pm:doc:deficit_esc" }],
    [{ text: "◀️ Назад", callback_data: "pm:send" }],
  ] });
}
```
- `pm:s:prod` — создать `screenPMSendProd` с подкатегориями:
```typescript
async function screenPMSendProd(chatId, user, session) {
  await tgEdit(chatId, session.message_id, `🏭 <b>Производство · Документы</b>\n${SEP}`, { inline_keyboard: [
    [{ text: "📋 Запрос КП", callback_data: "pm:doc:kp_req" }],
    [{ text: "📦 Запрос готовности партии", callback_data: "pm:doc:batch_req" }],
    [{ text: "🚚 Согласование отгрузки", callback_data: "pm:doc:ship_approve" }],
    [{ text: "◀️ Назад", callback_data: "pm:send" }],
  ] });
}
```
- Добавить в DOC_FSM_MAP новые типы:
```typescript
"pm:doc:sup_status": { label: "Запрос статуса закупки", recipients: ["supply"] },
"pm:doc:mat_req": { label: "Заявка на материалы", recipients: ["supply"] },
"pm:doc:deficit_esc": { label: "Эскалация дефицита", recipients: ["supply", "director"] },
"pm:doc:kp_req": { label: "Запрос КП", recipients: ["production"] },
"pm:doc:batch_req": { label: "Запрос готовности партии", recipients: ["production"] },
"pm:doc:ship_approve": { label: "Согласование отгрузки", recipients: ["production", "supply"] },
```

### `screens/supply.ts`
**Исправить заглушки:**
- `screenSupplyStatus` — реальный экран:
```typescript
async function screenSupplyStatus(chatId, user, session) {
  const projectId = session?.context?.project_id;
  if (!projectId) return screenSupplyMenu(chatId, user, session);
  const { data: shipments } = await db.from("shipments")
    .select("id, material_name, status, eta, quantity")
    .eq("project_id", projectId)
    .order("eta", { ascending: true }).limit(8);
  let text = `📊 <b>Статус закупок</b>\n${SEP}\n`;
  if (!shipments?.length) { text += "Нет активных закупок"; }
  else {
    const si = { ordered: "📦", shipped: "🚚", delivered: "✅", delayed: "🔴" };
    for (const s of shipments) {
      text += `${si[s.status] || "📦"} ${s.material_name}\n`;
      text += `   ${s.quantity} шт.`;
      if (s.eta) text += ` · ETA ${new Date(s.eta).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`;
      text += "\n\n";
    }
  }
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "🚀 В приложении", web_app: { url: APP_URL } }],
    [{ text: "◀️ Меню", callback_data: "sup:menu" }],
  ] });
}
```
- `screenSupplyDeficit` — отдельный экран дефицита (не дублировать screenSupply):
```typescript
async function screenSupplyDeficit(chatId, user, session) {
  const projectId = session?.context?.project_id;
  if (!projectId) return screenSupplyMenu(chatId, user, session);
  const deficit = await getDeficitMaterials(projectId, 10);
  let text = `🔴 <b>Дефицит материалов</b>\n${SEP}\n`;
  if (deficit.length === 0) { text += "✅ Дефицита нет"; }
  else {
    text += `⚠️ ${deficit.length} позиций:\n\n`;
    for (const m of deficit) {
      text += `📌 <b>${m.name}</b>\n`;
      text += `   Нужно: ${m.total_required} ${m.unit}\n`;
      text += `   На объекте: ${m.on_site} ${m.unit}\n`;
      text += `   ⚠️ Дефицит: <b>${m.deficit} ${m.unit}</b>\n`;
      if (m.eta) text += `   ETA: ${new Date(m.eta).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}\n`;
      text += "\n";
    }
  }
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "📤 Заявка на закупку", callback_data: "sup:doc:status" }],
    [{ text: "◀️ Меню", callback_data: "sup:menu" }],
  ] });
}
```

### `screens/production.ts`
**Исправить заглушку:**
- `screenProductionLoad` — реальный экран загрузки:
```typescript
async function screenProductionLoad(chatId, user, session) {
  const projectId = session?.context?.project_id;
  if (!projectId) return screenProductionMenu(chatId, user, session);
  const facades = await getFacades(projectId);
  let text = `📊 <b>Загрузка производства</b>\n${SEP}\n`;
  let totalPlan = 0, totalFact = 0;
  for (const f of facades) {
    const s = await getFacadeStats(f.id);
    totalPlan += s.totalPlan; totalFact += s.totalFact;
    const remaining = s.totalPlan - s.totalFact;
    text += `🏗️ <b>${f.name}</b>\n`;
    text += `   ${progressBar(s.pct)} ${s.pct}%\n`;
    text += `   Готово: ${s.totalFact} · Осталось: <b>${remaining}</b>\n\n`;
  }
  const totalPct = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;
  text += `${SEP}\nИтого: ${progressBar(totalPct)} <b>${totalPct}%</b>`;
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "◀️ Меню", callback_data: "prod:menu" }],
  ] });
}
```

### `screens/foreman.ts`
Самый большой файл. Вынести все foreman-экраны.

**Исправить BUG-005:**
В `screenForemanMenu` заменить:
```typescript
// Было:
const inboxCount = await getInboxCount(project.id, "foreman");

// Стало:
const primaryRole = detectPrimaryRole(user.roles);
const inboxCount = await getInboxCount(project.id, primaryRole);
```

И в dispatcher для `f:inbox`:
```typescript
// Было:
if (data === "f:inbox") return screenInbox(chatId, user, session, "foreman", "f");

// Стало:
if (data === "f:inbox") {
  const foremanRole = detectPrimaryRole(user.roles); // foreman1, foreman2, or foreman3
  return screenInbox(chatId, user, session, foremanRole, "f");
}
```

### `screens/inspector.ts`
**Исправить заглушку `screenInspectorAccept`:**
```typescript
async function screenInspectorAccept(chatId, user, session) {
  const projectId = session?.context?.project_id;
  if (!projectId) return screenInspectorMenu(chatId, user, session);
  // Показать этапы, ожидающие приёмки
  const { data: pending } = await db.from("stage_acceptance")
    .select("id, facade_name, floor_number, stage, status, submitted_at, submitted_by")
    .eq("project_id", projectId)
    .eq("status", "pending_inspector")
    .order("submitted_at", { ascending: false }).limit(5);
  let text = `✅ <b>Приёмка этапов</b>\n${SEP}\n`;
  if (!pending?.length) { text += "Нет этапов, ожидающих приёмки"; }
  else {
    for (const p of pending) {
      text += `🏗️ ${p.facade_name} · Эт.${p.floor_number}\n`;
      text += `   Этап: <b>${p.stage}</b>\n`;
      text += `   📅 ${new Date(p.submitted_at).toLocaleDateString("ru-RU")}\n\n`;
    }
  }
  const buttons = (pending || []).slice(0, 3).map((p: any) => [
    { text: `✅ ${p.facade_name} эт.${p.floor_number}`, callback_data: `insp:acc:${p.id}` },
    { text: `❌`, callback_data: `insp:rej:${p.id}` },
  ]);
  buttons.push([{ text: "◀️ Меню", callback_data: "insp:menu" }]);
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: buttons });
}
```

### `screens/pto.ts`
**Улучшить `screenPTORegistry`:**
```typescript
async function screenPTORegistry(chatId, user, session) {
  const projectId = session?.context?.project_id;
  if (!projectId) return screenPTOMenu(chatId, user, session);
  const { data: docs } = await db.from("bot_documents")
    .select("doc_type, comment, created_at, status")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false }).limit(10);
  const { count } = await db.from("documents")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId);
  let text = `📊 <b>Реестр документов</b>\n${SEP}\n`;
  text += `Всего: <b>${count || 0}</b>\n\n`;
  if (docs?.length) {
    text += `<b>Последние:</b>\n`;
    for (const d of docs) {
      const date = new Date(d.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      const si = d.status === "sent" ? "📤" : d.status === "approved" ? "✅" : "📝";
      text += `${si} ${d.doc_type} · ${date}\n`;
    }
  }
  await tgEdit(chatId, session.message_id, text, { inline_keyboard: [
    [{ text: "🚀 Полный реестр", web_app: { url: APP_URL } }],
    [{ text: "◀️ Меню", callback_data: "pto:menu" }],
  ] });
}
```

---

## БЛОК 5: FSM-потоки (`fsm/`)

Вынести без изменений логики:

### `fsm/document.ts`
- `DOC_FSM_MAP` (30+ типов + новые из Блока 4)
- `startDocFSM`, `handleDocFile`, `handleDocComment`, `handleDocConfirm`

### `fsm/photo.ts`
- `PHOTO_TYPES`
- `startPhotoFSM`, `screenPhotoFloor`, `screenPhotoUpload`, `handlePhotoFile`, `screenPhotoComment`, `handlePhotoComment`, `handlePhotoConfirm`

### `fsm/report.ts`
- `screenForemanReportFacade`, `screenForemanReportFloor`, `screenForemanReportInput`, `screenForemanReportConfirm`, `saveForemanReport`

### `fsm/alert.ts`
- `screenAlertNew`, `screenAlertTitle`, `saveAlert`

### `fsm/daily-log.ts`
- `screenLogZone`, `screenLogWorks`, `screenLogWorkers`, `saveLogEntry`

---

## БЛОК 6: Dispatcher (`dispatcher.ts`)

Центральный роутер. Заменяет гигантский `handleUpdate()`.

Структура:
```typescript
import { routeToMenu } from "./screens/router.ts";
import { DOC_FSM_MAP } from "./fsm/document.ts";
// ... остальные импорты

export async function handleUpdate(update: any) {
  // 1. File uploads → FSM
  if (update.message?.document || update.message?.photo) {
    return handleFileUpload(update);
  }

  // 2. Text messages → commands + FSM text input
  if (update.message) {
    return handleTextMessage(update);
  }

  // 3. Callback queries → screen routing
  if (update.callback_query) {
    return handleCallback(update);
  }
}

async function handleCallback(update: any) {
  const cq = update.callback_query;
  const data = cq.data || "";
  // ...

  // Doc FSM (universal)
  if (DOC_FSM_MAP[data]) { ... }

  // Route by prefix
  const [prefix] = data.split(":");
  switch (prefix) {
    case "d": return handleDirectorCallback(data, chatId, user, session);
    case "pm": return handlePMCallback(data, chatId, user, session);
    case "opr": return handleOPRCallback(data, chatId, user, session);
    // ... и т.д.
  }
}
```

Каждая роль получает свой `handle*Callback` в своём файле screens/*.ts.

---

## БЛОК 7: Подключить validateTelegram (BUG-011)

В `index.ts` добавить валидацию webhook:
```typescript
import { validateTelegram } from "../_shared/validateTelegram.ts";

serve(async (req) => {
  if (req.method !== "POST") return new Response("OK");
  
  // Опционально: валидация секретного токена
  const secret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secret && secret !== Deno.env.get("TELEGRAM_WEBHOOK_SECRET")) {
    return new Response("Forbidden", { status: 403 });
  }
  
  // ... handleUpdate
});
```

---

## БЛОК 8: Удаление мёртвого кода

Удалить:
- `_shared/botFSM.ts` — не используется, несовместимая схема (`telegram_id` vs `chat_id`)
- `_shared/botScreens.ts` — не используется, дублирует функционал

---

## ПОРЯДОК ВЫПОЛНЕНИЯ

1. Создать `lib/` — вынести утилиты (tg, db, session, roles, ui, audit)
2. Создать `screens/shared.ts` — вынести shared экраны
3. Создать `screens/*.ts` — вынести ролевые экраны + исправить заглушки
4. Создать `fsm/*.ts` — вынести FSM-потоки
5. Создать `dispatcher.ts` — центральный роутер
6. Переписать `index.ts` — минимальная точка входа
7. Подключить validateTelegram
8. Удалить мёртвый код
9. Протестировать каждую роль: /start → меню → все кнопки

---

## КОНТРОЛЬНЫЙ ЧЕКЛИСТ

После рефакторинга проверить:

- [ ] /start показывает правильное меню для каждой из 10 ролей
- [ ] Входящие работают для всех ролей (включая foreman1/2/3)
- [ ] Отправка документов работает (30 типов через DOC_FSM_MAP)
- [ ] Фотоотчёт прораба: выбор типа → фасад → этаж → загрузка → комментарий → отправка
- [ ] Отчёт прораба: фасад → этаж → ввод факта → сохранение
- [ ] Создание алерта: приоритет → заголовок → сохранение
- [ ] Дневной журнал: зона → работы → рабочие → сохранение
- [ ] Согласования: просмотр → одобрить/отклонить
- [ ] Настройки: просмотр → toggle уведомлений
- [ ] Смена проекта работает из любого меню
- [ ] pm:s:supply показывает подкатегории отправки (не дефицит)
- [ ] pm:s:prod показывает подкатегории отправки (не дашборд)
- [ ] sup:status показывает реальный статус закупок
- [ ] sup:deficit показывает детальный дефицит
- [ ] prod:load показывает загрузку производства
- [ ] insp:accept показывает этапы для приёмки
- [ ] TTL сессий = 8 часов

---

## ЧЕГО НЕ ДЕЛАТЬ

- Не менять визуал (Фаза 3, Opus)
- Не добавлять новый функционал (Фаза 4)
- Не менять структуру БД
- Не трогать другие Edge Functions
- Не менять callback_data формат (сломает активные сессии)
