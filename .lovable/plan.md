

# STSphera v3.0 — Холдинг + 1C Синхронизация + White-Label Бот

## Обзор

Три крупных блока:
1. **Holding Migration** — мультикомпанийный режим (таблица `companies`, `company_id` во всех основных таблицах, RLS-изоляция)
2. **sync-1c** — Edge Function для двусторонней синхронизации с 1С
3. **bot-whitelabel** — Edge Function для white-label ботов (один код, N компаний)

---

## Этап 1: Секреты

Для `sync-1c` нужны секреты: `C1_BASE_URL`, `C1_USERNAME`, `C1_PASSWORD`.
Для `bot-whitelabel` нужен: `WEBHOOK_SECRET`.

Запрошу у пользователя эти секреты (или пропустим, если пока нет 1С-сервера).

---

## Этап 2: Database Migration — Holding

SQL-миграция создаст:

- **Таблица `companies`** — юрлица холдинга с полями `bot_token`, `bot_username`, `mini_app_url`, `primary_color`, `holding_id` (рекурсивная структура)
- **`company_id`** добавляется к таблицам: `projects`, `profiles`, `user_roles`, `alerts`, `materials`, `orders`, `plan_fact`, `crews`, `bot_sessions`
- **Колонка `scope`** в `user_roles` (`company` / `holding`)
- **Функции RLS**:
  - `current_company_id()` — ID компании текущего пользователя
  - `is_holding_director()` — проверка холдингового директора
  - `accessible_company_ids()` — массив доступных company_id
- **RLS-политики** с изоляцией по компании для `projects`, `alerts`, `materials`
- **View `holding_portfolio`** — сводка по компаниям холдинга

---

## Этап 3: Database Migration — v3 (1C sync tables)

- **Таблица `sync_log`** — логи синхронизации с 1С
- **Колонки в `materials`**: `updated_from_1c`, `synced_to_1c`
- **Колонки в `plan_fact`**: `ref_1c`, `synced_to_1c`
- **Колонки в `alerts`**: `synced_to_1c`
- **Индексы производительности**: по `company_id+status`, дефициту, нерешённым алертам
- **Функция `cleanup_sync_log()`** — очистка старых записей

---

## Этап 4: Edge Function `sync-1c`

Создать `supabase/functions/sync-1c/index.ts`:
- **1C -> App**: материалы, заказы, план работ
- **App -> 1C**: факт выполнения, алерты (critical/high), статусы заказов
- Логирование в `sync_log`
- REST-клиент для 1C с Basic Auth

---

## Этап 5: Edge Function `bot-whitelabel`

Создать `supabase/functions/bot-whitelabel/index.ts`:
- Один endpoint для всех ботов компаний
- Идентификация компании по `X-Telegram-Bot-Api-Secret-Token` header / `X-Bot-Token` / `?company=CODE`
- Кеш компаний в памяти (5 мин TTL)
- Брендированное меню, dashboard по `company_id`
- Делегация FSM-состояний в `telegram-bot`
- Добавить в `config.toml`: `verify_jwt = false`

---

## Этап 6: Config.toml

Добавить записи:
```text
[functions.sync-1c]
verify_jwt = false

[functions.bot-whitelabel]
verify_jwt = false
```

---

## Этап 7: Обновить TypeScript-типы

Типы обновятся автоматически после миграций.

---

## Технические детали

### Порядок миграций (критично):
1. Сначала `companies` (т.к. остальные таблицы ссылаются на неё)
2. Затем `company_id` в существующих таблицах
3. Затем функции RLS (`current_company_id`, `accessible_company_ids`)
4. Затем политики RLS
5. Затем `sync_log` и колонки синхронизации
6. View `holding_portfolio`

### Существующие RLS-политики:
Текущие политики (`projects_sel`, `alerts_sel` и т.д.) используют `user_project_ids()`. Новые политики с `company_id` будут добавлены **параллельно** (не заменяя), чтобы обеспечить обратную совместимость пока `company_id` не заполнен.

### Известные зависимости:
- Таблица `orders` уже существует — миграция добавит только недостающие колонки (`synced_to_1c`, `updated_from_1c`, `supplier_name`)
- `materials.code_1c` уже существует — пропустим
- `materials.price_per_unit`, `supplier_inn`, `supplier_code_1c` уже существуют — пропустим
- Секреты `C1_BASE_URL`, `C1_USERNAME`, `C1_PASSWORD`, `WEBHOOK_SECRET` — нужно запросить у пользователя

