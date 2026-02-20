# ТЗ для Lovable — Фаза 1: Стабилизация

> Проект: STSphera TMA (ООО «СФЕРА»)
> Дата: 2026-02-21
> Приоритет: CRITICAL → HIGH → MEDIUM (строго по порядку)

---

## БЛОК 1: Auth на Edge Functions (CRITICAL)

### Задача
9 из 12 Edge Functions не имеют авторизации. Любой может вызвать их напрямую — это дыра в безопасности и потенциальный расход бюджета (AI-вызовы, уведомления).

### Что сделать
В каждой из перечисленных функций добавить проверку авторизации **первой строкой** обработчика, используя существующий `_shared/authMiddleware.ts` (уже работает в `ai-chat`).

### Паттерн (уже реализован в ai-chat):
```typescript
import { authMiddleware } from "../_shared/authMiddleware.ts";

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authResult = await authMiddleware(req);
  if (authResult.error) {
    return new Response(
      JSON.stringify({ error: authResult.error }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const user = authResult.user;

  // ... остальная логика функции
});
```

### Список функций для добавления auth:

| # | Функция | Файл |
|---|---------|------|
| 1 | sync-1c | `supabase/functions/sync-1c/index.ts` |
| 2 | google-sheets-sync | `supabase/functions/google-sheets-sync/index.ts` |
| 3 | telegram-notify | `supabase/functions/telegram-notify/index.ts` |
| 4 | bot-scheduler | `supabase/functions/bot-scheduler/index.ts` |
| 5 | telegram-manage | `supabase/functions/telegram-manage/index.ts` |
| 6 | analyze-document | `supabase/functions/analyze-document/index.ts` |
| 7 | parse-project-document | `supabase/functions/parse-project-document/index.ts` |
| 8 | bot-whitelabel | `supabase/functions/bot-whitelabel/index.ts` |
| 9 | bot-notify | `supabase/functions/bot-notify/index.ts` |

### Исключения:
- `telegram-bot` — вебхук от Telegram, auth не нужен (но нужна валидация подписи — см. BUG-011)
- `ai-chat` — уже имеет auth ✅
- `bot-notify-worker` — дубликат, будет удалён (см. Блок 3)
- `telegram-scheduler` — дубликат, будет удалён (см. Блок 3)

### Важно:
- Не менять логику самих функций, только добавить auth-обёртку
- CORS preflight (`OPTIONS`) должен проходить БЕЗ auth
- Ответ при отсутствии auth: `401 { "error": "Unauthorized" }`

---

## БЛОК 2: Фикс bot-notify-worker (CRITICAL)

### Задача
Функция `bot-notify-worker` использует несуществующие колонки.

### Файл: `supabase/functions/bot-notify-worker/index.ts`

### Исправления:
1. **Строка ~264, ~340:** Заменить `retry_count` → `attempts`
2. **Строка ~264, ~340:** Заменить `sent_at` → `processed_at`

### Проверка:
Убедиться, что имена колонок соответствуют схеме таблицы `bot_event_queue`:
- `attempts` (integer) — количество попыток
- `processed_at` (timestamptz) — время обработки

---

## БЛОК 3: Удаление дублей функций (HIGH)

### Задача
Есть 2 пары дублирующихся Edge Functions. Оставить одну из каждой пары.

### Действия:
1. **Удалить `bot-notify`** — оставить `bot-notify-worker` (после фикса из Блока 2)
2. **Удалить `telegram-scheduler`** — оставить `bot-scheduler`

### Как удалить:
- Удалить директорию функции: `supabase/functions/bot-notify/`
- Удалить директорию функции: `supabase/functions/telegram-scheduler/`
- Проверить, что нигде в коде нет вызовов удалённых функций (поиск по `bot-notify` и `telegram-scheduler` в `supabase.functions.invoke()`)

---

## БЛОК 4: Фикс дублей миграций (CRITICAL)

### Задача
10 таблиц создаются дважды в разных миграциях без `IF NOT EXISTS`. При чистом прогоне миграций — crash.

### Файлы:
- `supabase/migrations/20260216121911_*.sql`
- `supabase/migrations/20260216122530_*.sql`

### Исправление:
Во ВСЕХ `CREATE TABLE` в этих файлах добавить `IF NOT EXISTS`:
```sql
-- Было:
CREATE TABLE some_table (...);

-- Стало:
CREATE TABLE IF NOT EXISTS some_table (...);
```

То же самое для `CREATE INDEX`, `CREATE POLICY`, `CREATE TYPE` — везде добавить `IF NOT EXISTS`.

---

## БЛОК 5: Фикс тройных RLS-политик (HIGH)

### Задача
Таблицы `daily_logs` и `approvals` имеют тройные RLS-политики (одна и та же политика создаётся в 3 миграциях).

### Файлы:
- `supabase/migrations/20260218150000_*.sql`
- `supabase/migrations/20260218210000_*.sql`
- `supabase/migrations/20260218220803_*.sql`

### Исправление:
Оставить политики только в ПОСЛЕДНЕЙ миграции (`20260218220803_*`). В двух предыдущих — удалить дублирующиеся `CREATE POLICY` для `daily_logs` и `approvals`.

Альтернатива: добавить `DROP POLICY IF EXISTS ... ON ...;` перед каждым `CREATE POLICY`.

---

## БЛОК 6: Фикс Inbox прорабов (HIGH)

### Задача
Экран Inbox прорабов ищет роль `"foreman"`, но в системе роли называются `foreman1`, `foreman2`, `foreman3`.

### Файл: `supabase/functions/telegram-bot/index.ts`, функция `screenForemanMenu`

### Исправление:
Заменить точное сравнение:
```typescript
// Было:
role === "foreman"

// Стало:
role.startsWith("foreman")
```

Или использовать хелпер `isForeman()` из `src/lib/detectPrimaryRole.ts`, если он доступен в контексте бота.

---

## БЛОК 7: Увеличение TTL сессий (HIGH)

### Задача
TTL сессий бота — 2 часа. На стройке это мало: прораб начал заполнять отчёт утром, отвлёкся на 3 часа, вернулся — сессия сброшена.

### Файл: `supabase/functions/telegram-bot/index.ts`, функция `saveSession`

### Исправление:
```typescript
// Было:
const SESSION_TTL = 7200000; // 2 часа

// Стало:
const SESSION_TTL = 28800000; // 8 часов
```

---

## БЛОК 8: Добавление индексов (MEDIUM)

### Задача
Отсутствуют индексы на часто используемых колонках. При росте данных — деградация производительности.

### Создать новую миграцию:
```sql
CREATE INDEX IF NOT EXISTS idx_bot_sessions_chat_id ON bot_sessions(chat_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_project_id ON alerts(project_id);
```

---

## Порядок выполнения

1. ✅ Блок 4 — Фикс миграций (чтобы не крашилось)
2. ✅ Блок 5 — Фикс RLS-политик
3. ✅ Блок 1 — Auth на все Edge Functions
4. ✅ Блок 2 — Фикс bot-notify-worker
5. ✅ Блок 3 — Удаление дублей
6. ✅ Блок 6 — Фикс Inbox прорабов
7. ✅ Блок 7 — TTL сессий
8. ✅ Блок 8 — Индексы

---

## Чего НЕ делать
- Не менять визуал (это Фаза 3, делает Opus)
- Не рефакторить бот (это Фаза 2)
- Не добавлять новый функционал
- Не трогать компоненты из ветки `opus/monolith-components`

---

## После выполнения
Сообщить Opus (через Telegram) что сделано — я обновлю bugs-tracker и project-state.
