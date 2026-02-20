
# Фаза 1 (расширенная): Стабилизация + Фиксы аудита

## Обзор

Объединяем оригинальный план (8 задач) с результатами аудита (10 находок). Итого 12 задач в двух фазах.

---

## Фаза 1 — Стабилизация и фиксы аудита

### 1. Webhook-секрет для telegram-bot

Добавить в `serve()` (строка 1628) проверку заголовка `x-telegram-bot-api-secret-token` против env `TELEGRAM_WEBHOOK_SECRET`. Если не совпадает — 401. Это защитит webhook от поддельных запросов.

Потребуется секрет `TELEGRAM_WEBHOOK_SECRET`.

### 2. Auth middleware во ВСЕ незащищённые Edge Functions

Импортировать `authenticate` из `_shared/authMiddleware.ts` и добавить проверку в начало:
- `sync-1c/index.ts`
- `google-sheets-sync/index.ts`
- `telegram-notify/index.ts`
- `telegram-manage/index.ts`
- `analyze-document/index.ts`
- `parse-project-document/index.ts`

Без валидного JWT или Telegram initData — возвращать 401.

### 3. Замена CORS `*` на конкретный домен

Во всех Edge Functions заменить:
```
"Access-Control-Allow-Origin": "*"
```
на:
```
"Access-Control-Allow-Origin": "https://smr-sfera.lovable.app"
```
А также добавить preview-домен через проверку Origin:
```
const ALLOWED_ORIGINS = [
  "https://smr-sfera.lovable.app",
  "https://id-preview--fe942628-85b8-4407-a858-132ee496d745.lovable.app"
];
```

Затронутые файлы: `sync-1c`, `google-sheets-sync`, `telegram-notify`, `telegram-manage`, `analyze-document`, `parse-project-document`, `ai-chat`.

### 4. Rate limiting (в telegram-bot)

Импортировать `checkRateLimit` из `_shared/rateLimit.ts` в `handleUpdate`. Ограничение: 30 запросов / 60 секунд на chatId. При превышении — отправить "Слишком много запросов" и выйти.

**Важно:** in-memory Map сбрасывается при cold start. Это допустимо для Telegram-бота (защита от flood в рамках одного warm instance). Для API-функций проблема менее критична, т.к. они уже защищены auth middleware.

### 5. Фикс inbox для прорабов

**Проблема:** строка 1584 передаёт `"foreman"` в `screenInbox`, но реальные роли — `foreman1/2/3`. Функции `getInboxCount` (стр. 156) и `getInboxItems` (стр. 161) используют `.contains("to_roles", [toRole])` — для массива ролей не работает.

**Решение:**
- Изменить `getInboxCount` и `getInboxItems` для приёма массива ролей вместо одной строки
- Использовать `.or()` фильтр: `to_roles.cs.{foreman},...cs.{foreman1},...cs.{foreman2},...cs.{foreman3}`
- На строке 1584: `screenInbox(chatId, user, session, ["foreman","foreman1","foreman2","foreman3"], "f")`
- В `DOC_FSM_MAP` (стр. 1377-1384): заменить recipients `"foreman1"` на `["foreman1","foreman2","foreman3"]` для PTO/Inspector документов, чтобы попадали во входящие любому прорабу

### 6. Увеличить TTL сессий до 8 часов

Строка 90: заменить `7200000` на `28800000` (8 часов).

### 7. Try/catch + safeFn на все screen-функции

- Обернуть `handleUpdate` (стр. 1390) в глобальный try/catch с fallback-сообщением: "Произошла ошибка. Попробуйте /start"
- Добавить обёртку `safeFn` для всех вызовов screen-функций
- Логировать ошибки в `bot_audit_log` с `result: "error"`

### 8. Фикс bot-notify-worker: колонки БД

**Проблема:** `retry_count` не существует в `bot_event_queue` — колонка называется `attempts`. Также `sent_at` не существует — используется `processed_at`.

**Изменения в bot-notify-worker/index.ts:**
- Строка 264: `.lt("retry_count", 3)` → `.lt("attempts", 3)`
- Строка 334: `sent_at: new Date().toISOString()` → `processed_at: new Date().toISOString()`
- Строка 340: `retry_count: (event.retry_count || 0) + 1` → `attempts: (event.attempts || 0) + 1`
- Строка 351: `.lt("sent_at", ...)` → `.lt("processed_at", ...)`

**Примечание:** в схеме `bot_event_queue` колонка `sent_at` действительно существует (видна в описании таблицы), но `retry_count` — нет, есть только `attempts`. Проверим и исправим оба варианта по реальной схеме.

### 9. Удалить дубль: bot-notify

`bot-notify` и `bot-notify-worker` делают одно и то же (обработка очереди уведомлений). `bot-notify-worker` более полная версия (поддерживает v4 events, DND per-user, resolveTargets).

**Действие:** Удалить `supabase/functions/bot-notify/index.ts` и запись `[functions.bot-notify]` из `config.toml`. Удалить деплой через инструмент.

### 10. Удалить дубль: telegram-scheduler

`telegram-scheduler` и `bot-scheduler` обе делают daily_summary / report_reminder, но `bot-scheduler` — более полная v4 версия с MSK-тайммингами и plan/fact отчётами.

**Действие:** Удалить `supabase/functions/telegram-scheduler/index.ts` и запись `[functions.telegram-scheduler]` из `config.toml`. Удалить деплой через инструмент.

### 11. Добавить индексы на ключевые колонки

Создать миграцию с индексами:
```sql
CREATE INDEX IF NOT EXISTS idx_bot_sessions_chat_id ON bot_sessions(chat_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_project_id ON alerts(project_id);
CREATE INDEX IF NOT EXISTS idx_bot_event_queue_status ON bot_event_queue(status, scheduled_at);
```

### 12. Фикс OOM в analyze-document

Заменить `btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))` на chunk-based encoding (как уже сделано в `parse-project-document`):
```typescript
const uint8 = new Uint8Array(arrayBuffer);
let base64Content = "";
const chunkSize = 8192;
for (let i = 0; i < uint8.length; i += chunkSize) {
  base64Content += String.fromCharCode(...uint8.slice(i, i + chunkSize));
}
base64Content = btoa(base64Content);
```

---

## Фаза 2 — Рефакторинг (без изменений)

### 13. Разнести index.ts на модули

Как в оригинальном плане:
- `_shared/botUtils.ts` — обновить (tgSend/tgEdit/tgAnswer/tgDeleteMsg)
- `_shared/botFSM.ts` — перезапись (v4 сессии)
- `_shared/botScreens.ts` — перезапись (общие v4 экраны)
- `_shared/botRoleScreens.ts` — новый (ролевые меню)
- `_shared/botDocFSM.ts` — новый (Document/Photo FSM)
- `index.ts` — только диспетчер (~200 строк)

### 14. Сохранение файлов в Supabase Storage

В `handleDocFile` и `handlePhotoFile` — скачать файл через fetch, загрузить в bucket (`project-documents` или `photo-reports`), сохранить постоянный URL.

### 15. RLS — OK, дополнительных миграций не требуется

---

## Технические детали

### Файлы, которые будут изменены (Фаза 1):
1. `supabase/functions/telegram-bot/index.ts` — webhook secret, rate limit, inbox fix, TTL, try/catch
2. `supabase/functions/bot-notify-worker/index.ts` — фикс колонок
3. `supabase/functions/sync-1c/index.ts` — auth + CORS
4. `supabase/functions/google-sheets-sync/index.ts` — auth + CORS
5. `supabase/functions/telegram-notify/index.ts` — auth + CORS
6. `supabase/functions/telegram-manage/index.ts` — auth + CORS
7. `supabase/functions/analyze-document/index.ts` — auth + CORS + OOM fix
8. `supabase/functions/parse-project-document/index.ts` — auth + CORS

### Файлы, которые будут удалены:
- `supabase/functions/bot-notify/index.ts`
- `supabase/functions/telegram-scheduler/index.ts`

### Новая миграция:
- Индексы на `bot_sessions.chat_id`, `profiles.user_id`, `user_roles.user_id`, `alerts.project_id`, `bot_event_queue(status, scheduled_at)`

### Новый секрет:
- `TELEGRAM_WEBHOOK_SECRET`

### Порядок выполнения:
1. Добавить секрет `TELEGRAM_WEBHOOK_SECRET`
2. Создать миграцию с индексами
3. Фиксы Фазы 1 (задачи 1-12)
4. Удалить `bot-notify` и `telegram-scheduler`
5. Деплой всех функций
6. Фаза 2 (задачи 13-15) — отдельным этапом
