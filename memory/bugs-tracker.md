# Bugs Tracker — STSphera

## 🔴 Critical

### BUG-001: 9/12 Edge Functions без auth
- **Файлы:** sync-1c, google-sheets-sync, telegram-notify, telegram-scheduler, telegram-manage, analyze-document, parse-project-document, bot-notify, bot-scheduler
- **Риск:** Любой может вызвать API, жечь деньги на AI, отправлять уведомления
- **Fix:** Добавить authMiddleware из _shared/authMiddleware.ts
- **Статус:** ❌ Открыт

### BUG-002: bot-notify-worker — неправильные колонки
- **Файл:** supabase/functions/bot-notify-worker/index.ts, строки 264, 340
- **Проблема:** Использует `retry_count` (нет в схеме), нужно `attempts`. Также `sent_at` → `processed_at`
- **Статус:** ❌ Открыт

### BUG-003: Дубли миграций без IF NOT EXISTS
- **Файлы:** 20260216121911_*.sql, 20260216122530_*.sql
- **Проблема:** 10 таблиц создаются дважды, при чистом прогоне — crash
- **Статус:** ❌ Открыт

### BUG-004: Тройные RLS-политики daily_logs/approvals
- **Файлы:** 20260218150000_*, 20260218210000_*, 20260218220803_*
- **Статус:** ❌ Открыт

## 🟠 High

### BUG-005: Inbox прорабов — неправильная роль
- **Файл:** telegram-bot/index.ts, screenForemanMenu
- **Проблема:** Ищет "foreman", роли в системе — foreman1/2/3
- **Статус:** ❌ Открыт

### BUG-006: Дубли функций
- **bot-notify vs bot-notify-worker** — оставить worker (после фикса)
- **telegram-scheduler vs bot-scheduler** — оставить bot-scheduler
- **Статус:** ❌ Открыт

### BUG-007: Сессии TTL 2 часа — мало для стройки
- **Файл:** telegram-bot/index.ts, saveSession
- **Fix:** 7200000 → 28800000
- **Статус:** ❌ Открыт

## 🟡 Medium

### BUG-008: Нет индексов
- bot_sessions.chat_id, profiles.user_id, user_roles.user_id, alerts.project_id
- **Статус:** ❌ Открыт

### BUG-009: Rate limiter не работает
- _shared/rateLimit.ts — in-memory Map в stateless Edge Functions
- **Fix:** Перенести на Redis или Supabase table
- **Статус:** ❌ Открыт

### BUG-010: analyze-document OOM
- btoa(String.fromCharCode(...spread)) на больших файлах
- **Fix:** Использовать чанки по 8192 (как в parse-project-document)
- **Статус:** ❌ Открыт

### BUG-011: validateTelegram не подключён к боту
- **Статус:** ❌ Открыт

### BUG-012: Supabase anon key утёк в git history
- **Fix:** Ротировать в Dashboard → Settings → API
- **Статус:** ❌ Ожидает действия Алексея
