

# Фаза 1+2: Стабилизация и рефакторинг Telegram-бота

## Обзор

8 задач в двух фазах: защита от подделок и спама, фикс багов, увеличение TTL, обработка ошибок, модуляризация, сохранение файлов в Storage, проверка RLS.

---

## Фаза 1 — Стабилизация

### 1. Подключить validateTelegram в webhook

**Проблема:** Сейчас бот принимает любые POST-запросы без проверки подлинности.

**Решение:**
- В `serve()` (строка 1628) добавить проверку заголовка `x-telegram-bot-api-secret-token`
- Если секрет не совпадает, возвращать 401
- Секрет `TELEGRAM_WEBHOOK_SECRET` нужно будет задать и зарегистрировать через `setWebhook` API с параметром `secret_token`
- Также использовать `validateInitDataAsync` из `_shared/validateTelegram.ts` для Mini App авторизации (если потребуется)

### 2. Подключить rateLimit

**Проблема:** Нет защиты от спама — один пользователь может отправлять неограниченное количество запросов.

**Решение:**
- Импортировать `checkRateLimit` из `_shared/rateLimit.ts` в начало `handleUpdate`
- Ограничение: 30 запросов / 60 секунд на `chatId`
- При превышении — отправлять `tgAnswer` с текстом "Слишком много запросов" и выходить

### 3. Фикс бага inbox для прорабов

**Проблема:** На строке 1584 inbox вызывается с ролью `"foreman"`, но в БД роли хранятся как `foreman1`, `foreman2`, `foreman3`. Функции `getInboxCount`/`getInboxItems` ищут `contains("to_roles", ["foreman"])` — совпадений нет.

**Решение:**
- Изменить `screenInbox` на строке 1584: передавать массив ролей `["foreman", "foreman1", "foreman2", "foreman3"]`
- Обновить `getInboxCount` и `getInboxItems` для поддержки нескольких ролей (использовать `.or()` фильтр)
- Аналогично обновить `DOC_FSM_MAP` recipients — документы, адресованные `foreman1`, должны попадать во входящие любому прорабу

### 4. Увеличить TTL сессий до 8 часов

**Проблема:** Текущий TTL = 2 часа (строка 90: `7200000` мс). На стройке рабочий день длиннее.

**Решение:**
- Заменить `7200000` на `28800000` (8 часов) в `saveSession`
- Обновить `cleanup_expired_bot_sessions` — функция уже работает корректно (чистит по `expires_at`)

### 5. Try/catch на все screen-функции

**Проблема:** Если любая screen-функция падает (ошибка БД, null-reference), пользователь видит "зависший" бот без ответа.

**Решение:**
- Обернуть `handleUpdate` в try/catch с fallback-сообщением: "Произошла ошибка. Попробуйте /start"
- Добавить обёртку `safeFn` для всех вызовов screen-функций в диспетчере
- Логировать ошибку в `bot_audit_log` с `result: "error"`

---

## Фаза 2 — Рефакторинг

### 6. Разнести index.ts на модули

**Текущее состояние:** 1640 строк в одном файле.

**Ограничение Deno Edge Functions:** Нельзя использовать подпапки для одной функции, но можно импортировать из `_shared/`.

**План разнесения:**
- `_shared/botUtils.ts` — уже существует (tg API). Перенести туда `tgSend/tgEdit/tgAnswer/tgDeleteMsg` из index.ts (заменить дубликаты)
- `_shared/botFSM.ts` — уже существует но устарел. Перенести туда `getSession/saveSession/clearSession` + типы `BotState`
- `_shared/botScreens.ts` — уже существует но не используется v4. Перенести общие экраны: `screenProjectsList`, `screenDashboard`, `screenAlerts`, `screenSettings`, `screenTasks` и т.д.
- `_shared/botRoleScreens.ts` — **новый файл**. Все ролевые меню и send-экраны (Director, PM, OPR, KM, KMD, Supply, Production, Foreman, PTO, Inspector)
- `_shared/botDocFSM.ts` — **новый файл**. Document FSM + Photo FSM + `DOC_FSM_MAP`
- `index.ts` — остаётся только диспетчер `handleUpdate` + `serve()` (~200 строк)

### 7. Сохранение файлов в Supabase Storage

**Проблема:** Сейчас бот сохраняет временные ссылки Telegram (`https://api.telegram.org/file/bot.../...`). Эти ссылки протухают через ~1 час.

**Решение:**
- В `handleDocFile` и `handlePhotoFile` после получения `file_url` от TG:
  1. Скачать файл через `fetch(fileUrl)`
  2. Загрузить в bucket `project-documents` (уже существует, приватный) или `photo-reports` (для фото, публичный)
  3. Сохранить постоянный URL из Storage в `bot_documents`/`bot_inbox`
- Путь файла: `{project_id}/{doc_type}/{date}_{filename}`

### 8. Проверка RLS-политик

**Текущее состояние по таблицам бота:**
- `bot_sessions` — RLS OK (service_only для записи, auth для чтения)
- `bot_documents` — RLS OK (service_only для записи, project-based для чтения)
- `bot_inbox` — RLS OK (service_only для записи, project-based для чтения)
- `bot_event_queue` — RLS OK (service_only)
- `bot_audit_log` — RLS OK (service_only + pm/director чтение)

Все таблицы бота используют `service_role_key` для записи, что корректно. Клиентский доступ ограничен чтением по проекту. **Дополнительных миграций не требуется.**

---

## Технические детали

### Файлы, которые будут изменены:
1. `supabase/functions/telegram-bot/index.ts` — основной рефакторинг (сокращение с 1640 до ~200 строк)
2. `supabase/functions/_shared/botUtils.ts` — обновление (удалить старые хелперы, добавить v4)
3. `supabase/functions/_shared/botFSM.ts` — полная перезапись под v4 сессии
4. `supabase/functions/_shared/botScreens.ts` — полная перезапись (общие экраны v4)
5. `supabase/functions/_shared/botRoleScreens.ts` — новый файл (ролевые экраны)
6. `supabase/functions/_shared/botDocFSM.ts` — новый файл (FSM документов и фото)

### Порядок выполнения:
1. Сначала Фаза 1 (пункты 1-5) — быстрые фиксы в текущем index.ts
2. Затем Фаза 2 (пункты 6-8) — рефакторинг с разнесением по модулям
3. Деплой и проверка

### Новый секрет:
- `TELEGRAM_WEBHOOK_SECRET` — случайная строка для верификации webhook (пункт 1)

