

# Фаза 2: Рефакторинг Telegram Bot

Разбиение монолита `telegram-bot/index.ts` (1694 строки) на модульную архитектуру с исправлением заглушек.

---

## Целевая структура

```text
supabase/functions/telegram-bot/
  index.ts              -- Точка входа (~60 строк)
  dispatcher.ts         -- Роутинг callback/text -> handler
  lib/
    tg.ts               -- TG API: tgSend, tgEdit, tgAnswer, tgDeleteMsg
    db.ts               -- Supabase client + 13 data fetchers + BotUser
    session.ts           -- getSession, saveSession, clearSession (TTL 8h)
    roles.ts            -- ROLE_PRIORITY, ROLE_LABELS, ROLE_PREFIXES, detectPrimaryRole, isForeman, isManager, rp, roleLabel
    ui.ts               -- progressBar, sendOrEdit, todayStr, SEP, APP_URL, pe, typeIcons, typeLabels
    audit.ts            -- audit()
  screens/
    shared.ts           -- 16 shared screens
    director.ts         -- Директор (+ inbox)
    pm.ts               -- PM (+ supply/prod send screens)
    opr.ts              -- ОПР
    km.ts               -- КМ
    kmd.ts              -- КМД
    supply.ts           -- Снабжение (+ реальные status/deficit)
    production.ts       -- Производство (+ реальная загрузка)
    foreman.ts          -- Прораб
    pto.ts              -- ПТО (+ реестр с bot_documents)
    inspector.ts        -- Технадзор (+ реальная приемка)
    generic.ts          -- Fallback
  fsm/
    document.ts         -- DOC_FSM_MAP (30+ типов + 6 новых) + startDocFSM, handleDocFile, handleDocComment, handleDocConfirm
    photo.ts            -- PHOTO_TYPES + полный photo FSM
    report.ts           -- Foreman report flow
    alert.ts            -- Alert creation FSM
    daily-log.ts        -- Daily log creation FSM
  unknown.ts            -- screenUnknownUser
```

---

## Порядок выполнения

### Шаг 1: lib/ -- Утилиты (6 файлов)

Извлечение функций из index.ts без изменения логики:

- **lib/tg.ts** -- `tgSend`, `tgEdit`, `tgAnswer`, `tgDeleteMsg` + константы `BOT_TOKEN`, `TG`
- **lib/db.ts** -- Supabase client (`db`) + `BotUser` interface + все 13 data fetchers: `getUser`, `getProjects`, `getProject`, `getFacades`, `getFacadeStats`, `getOpenAlerts`, `getDeficitMaterials`, `getMyTasks`, `getTodayPlanFact`, `getPendingApprovals`, `getDailyLogs`, `getInboxCount`, `getInboxItems`
- **lib/session.ts** -- `getSession`, `saveSession`, `clearSession`. TTL уже 28800000 (8 часов), подтверждено.
- **lib/roles.ts** -- `ROLE_PRIORITY`, `ROLE_LABELS`, `ROLE_PREFIXES`, `detectPrimaryRole`, `isForeman`, `isManager`, `rp`, `roleLabel`
- **lib/ui.ts** -- `progressBar`, `sendOrEdit`, `todayStr`, `SEP`, `APP_URL`, `pe`, `typeIcons`, `typeLabels`
- **lib/audit.ts** -- `audit()`

### Шаг 2: screens/shared.ts -- 16 shared screens

Перенос без изменений:
`screenProjectsList`, `selectProject`, `screenAlerts`, `screenSupply`, `screenDashboard`, `screenFacades`, `screenFacadeDetail`, `screenApprovals`, `handleApproval`, `screenTasks`, `screenSettings`, `toggleNotification`, `screenDailyLogs`, `screenInbox`, `screenInboxDetail`, `handleInboxDone`, `screenProgress`

Каждая функция импортирует из `../lib/`.

### Шаг 3: Ролевые экраны (11 файлов) + Исправления заглушек

Перенос ролевых меню + исправления:

- **screens/director.ts** -- `screenDirectorMenu` (добавить кнопку "Входящие"), `screenPortfolio`, `screenKPI`, `screenCritical`, `screenFinance` + обработка `d:inbox -> screenInbox`
- **screens/pm.ts** -- `screenPMMenu`, `screenPMSend`, `screenPMSendLaunch`, `screenPMSendDesign`, `screenPMQuick` + **НОВЫЕ**: `screenPMSendSupply` (запрос статуса, заявка на материалы, эскалация дефицита) и `screenPMSendProd` (запрос КП, готовность партии, согласование отгрузки) + 6 новых записей в DOC_FSM_MAP
- **screens/supply.ts** -- `screenSupplyMenu`, `screenSupplySend` + **ИСПРАВИТЬ** `screenSupplyStatus` (реальный экран из `shipments`: статусы ordered/shipped/delivered/delayed + ETA) и `screenSupplyDeficit` (детальный список: название, нужно, на объекте, дефицит, ETA, кнопка "Заявка")
- **screens/production.ts** -- `screenProductionMenu`, `screenProductionSend` + **ИСПРАВИТЬ** `screenProductionLoad` (реальный прогресс по фасадам с progress-bar, готово/осталось, итого)
- **screens/inspector.ts** -- `screenInspectorMenu`, `screenInspectorSend`, `screenInspectorHistory` + **ИСПРАВИТЬ** `screenInspectorAccept` (реальный экран из `stage_acceptance` со status=pending_inspector, кнопки accept/reject)
- **screens/pto.ts** -- `screenPTOMenu`, `screenPTOSend` + **УЛУЧШИТЬ** `screenPTORegistry` (показать последние документы из `bot_documents` + общий счетчик)
- **screens/opr.ts** -- `screenOPRMenu`, `screenOPRSend`
- **screens/km.ts** -- `screenKMMenu`, `screenKMSend`
- **screens/kmd.ts** -- `screenKMDMenu`, `screenKMDSend`
- **screens/foreman.ts** -- `screenForemanMenu`, `screenForemanSend`, `screenForemanPhoto`, `screenForemanProgress`
- **screens/generic.ts** -- `screenGenericMenu`

### Шаг 4: FSM-потоки (5 файлов)

Перенос без изменений логики:

- **fsm/document.ts** -- `DOC_FSM_MAP` (включая 6 новых типов для PM) + `startDocFSM`, `handleDocFile`, `handleDocComment`, `handleDocConfirm`
- **fsm/photo.ts** -- `PHOTO_TYPES` + `startPhotoFSM`, `screenPhotoFloor`, `screenPhotoUpload`, `handlePhotoFile`, `screenPhotoComment`, `handlePhotoComment`, `handlePhotoConfirm`
- **fsm/report.ts** -- `screenForemanReportFacade`, `screenForemanReportFloor`, `screenForemanReportInput`, `screenForemanReportConfirm`, `saveForemanReport`
- **fsm/alert.ts** -- `screenAlertNew`, `screenAlertTitle`, `saveAlert`
- **fsm/daily-log.ts** -- `screenLogZone`, `screenLogWorks`, `screenLogWorkers`, `saveLogEntry`

### Шаг 5: dispatcher.ts -- Центральный роутер

Функция `handleUpdate(update)` с маршрутизацией:
1. File uploads -> FSM (DOC_UPLOAD / PHOTO_UPLOAD)
2. Text -> commands (/start, /help, /projects, /settings) + FSM text input
3. Callbacks -> роутинг по префиксу: `d:`, `pm:`, `opr:`, `km:`, `kmd:`, `sup:`, `prod:`, `f:`, `pto:`, `insp:`, `g:`, `c:`, `proj:`, `appr:`, `at:`, `log:`, `inbox:`, `doc:`

Также включает `routeToMenu()`.

BUG-005 fix: `f:inbox` использует `detectPrimaryRole(user.roles)` вместо хардкода "foreman".

### Шаг 6: index.ts -- Точка входа (<=80 строк)

Минимальный entrypoint: webhook secret check, rate limiting, вызов `handleUpdate`, error handling + audit logging.

### Шаг 7: unknown.ts

Отдельный файл для `screenUnknownUser`.

### Шаг 8: Удаление мертвого кода

- Удалить `supabase/functions/_shared/botFSM.ts` (не используется, подтверждено)
- Удалить `supabase/functions/_shared/botScreens.ts` (не используется, подтверждено)

### Шаг 9: Деплой и проверка

- Deploy `telegram-bot`
- Delete `bot-notify` и `telegram-scheduler` (если еще существуют)

---

## Детали исправлений заглушек

### Директор: добавить кнопку "Входящие"
В `screenDirectorMenu` добавляется строка с кнопкой `d:inbox`. В dispatcher добавляется маршрут `d:inbox -> screenInbox(chatId, user, session, "director", "d")`.

### PM: screenPMSendSupply (новый)
Экран с 3 кнопками документооборота для снабжения:
- Запрос статуса закупки -> supply
- Заявка на материалы -> supply
- Эскалация дефицита -> supply, director

### PM: screenPMSendProd (новый)
Экран с 3 кнопками для производства:
- Запрос КП -> production
- Запрос готовности партии -> production
- Согласование отгрузки -> production, supply

6 новых записей в DOC_FSM_MAP для этих документов.

### Supply: screenSupplyStatus (реальный)
Запрос из таблицы `orders` (JOIN с `materials`), отображение статусов: ordered, shipped, delivered, delayed. Показ ETA.

### Supply: screenSupplyDeficit (реальный)
Детальный список из `materials` WHERE `deficit > 0`: название, total_required, on_site, deficit, ETA. Кнопка "Заявка на закупку" (ведет на doc FSM).

### Production: screenProductionLoad (реальный)
Запрос фасадов проекта, для каждого -- progress bar с готово/осталось модулей. Итого внизу.

### Inspector: screenInspectorAccept (реальный)
Запрос из `stage_acceptance` WHERE `status = 'pending_inspector'` или аналог. Кнопки accept/reject для каждого этапа. При нажатии -- обновление статуса.

### PTO: screenPTORegistry (улучшенный)
Показ последних 5 документов из `bot_documents` для проекта + общий счетчик из `documents`.

---

## Ограничения

- Не меняется формат callback_data (совместимость с существующими сессиями)
- Не меняется структура БД
- Не добавляется новый функционал за пределами ТЗ
- Не меняется визуал фронтенда

