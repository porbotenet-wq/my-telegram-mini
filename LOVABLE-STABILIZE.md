# STSphera — Фаза 1: Стабилизация
# Скопировать в Lovable

## Контекст
Продолжаем работу по плану. БЛОК 1-3 выполнены. Теперь — стабилизация: баги, auth, error handling.

---

## 1. Auth: закрыть незащищённые функции

bot-notify-worker, bot-scheduler, bot-whitelabel — вызываются по cron, не из браузера. Добавить проверку SERVICE_ROLE_KEY или секретного заголовка:

```ts
// В начало каждой cron-функции (bot-notify-worker, bot-scheduler, bot-whitelabel):
const CRON_SECRET = Deno.env.get("CRON_SECRET");
if (CRON_SECRET) {
  const provided = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret");
  if (provided !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
}
```

telegram-bot — уже защищён webhook secret. Проверить что TELEGRAM_WEBHOOK_SECRET проверяется в начале handler.

## 2. Баг: inbox прорабов

Файл: supabase/functions/telegram-bot/index.ts, строка ~941

Сейчас:
```ts
const inboxCount = await getInboxCount(project.id, "foreman");
```

Проблема: в bot_inbox.to_roles хранятся конкретные роли "foreman1", "foreman2", "foreman3", а ищется "foreman" — ничего не находит.

Строка ~1588 уже исправлена (массив ["foreman", "foreman1", "foreman2", "foreman3"]), но screenForemanMenu на строке 941 — нет.

Исправить:
```ts
const inboxCount = await getInboxCount(project.id, ["foreman", "foreman1", "foreman2", "foreman3"]);
```

## 3. Rate limiter: перевести на Supabase

Файл: supabase/functions/_shared/rateLimit.ts

Текущий in-memory rate limiter бесполезен — Edge Functions stateless, Map сбрасывается при каждом вызове.

Заменить на Supabase-based:
```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs = 60_000,
): Promise<{ allowed: boolean; remaining: number }> {
  const windowStart = new Date(Date.now() - windowMs).toISOString();
  
  // Считаем запросы за окно
  const { count } = await db
    .from("rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("key", key)
    .gte("created_at", windowStart);
  
  if ((count || 0) >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }
  
  // Записываем новый запрос
  await db.from("rate_limits").insert({ key, created_at: new Date().toISOString() });
  
  return { allowed: true, remaining: maxRequests - (count || 0) - 1 };
}
```

Нужна миграция:
```sql
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_rate_limits_key_time ON rate_limits(key, created_at);

-- Автоочистка старых записей (>1 час)
CREATE OR REPLACE FUNCTION cleanup_rate_limits() RETURNS void AS $$
  DELETE FROM rate_limits WHERE created_at < now() - interval '1 hour';
$$ LANGUAGE sql;
```

## 4. Bot sessions TTL: увеличить до 8 часов

Файл: telegram-bot/index.ts

Найти TTL сессий (сейчас 2 часа) и увеличить до 8 часов. На стройке люди работают сменами, 2 часа — слишком мало, сессия сбрасывается посреди работы.

## 5. Error handling в screen-функциях бота

Все screen-функции (screenDirectorMenu, screenPMMenu, screenForemanMenu и т.д.) не обёрнуты в try/catch. Если Supabase вернёт ошибку — бот молча падает, пользователь видит зависший интерфейс.

Добавить обёртку в handleUpdate:
```ts
try {
  // ... existing routing logic
} catch (err) {
  console.error("Bot error:", err);
  try {
    await tgSend(chatId, "⚠️ Произошла ошибка. Попробуйте /menu");
  } catch {}
}
```

## 6. Миграции: добавить IF NOT EXISTS

Проверить все существующие миграции — если CREATE TABLE без IF NOT EXISTS, добавить. Иначе повторный деплой упадёт.

---

## Порядок
1. Миграция rate_limits
2. Auth для cron-функций
3. Баг inbox прорабов
4. Rate limiter на Supabase
5. TTL сессий 8ч
6. Error handling
7. IF NOT EXISTS в миграциях
