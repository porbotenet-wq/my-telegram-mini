# PROJECT SPEC — Telegram Bot + Mini App для управления строительными проектами

---

## A) EXECUTIVE SUMMARY

1. Строим Telegram Bot + Mini App для оперативного управления строительными проектами.
2. Целевая аудитория: CEO, директора, PM, ПТО, снабжение, прорабы, субподрядчики.
3. Bot = транзакционный интерфейс: ежедневные отчёты, согласования, быстрые действия, уведомления.
4. Mini App = аналитика, дашборды, сложные формы, фильтры, вложения.
5. RBAC на всех уровнях: роль → действия → данные → экраны.
6. Каждое критическое действие пишется в immutable AuditLog.
7. Архитектура: DDD, Event-driven, API-first, Clean Architecture.
8. Стек: NestJS + PostgreSQL + Redis + S3-совместимое хранилище.
9. FSM для управления состояниями бота, editMessage-дисциплина (без спама сообщений).
10. Идемпотентность всех пользовательских действий — безопасные повторы.
11. MVP за 2–3 недели: базовые роли, ежедневный план/факт, согласования.
12. Интеграции: импорт из Google Sheets/Excel, webhooks, файловое хранилище.
13. Observability: Sentry + OpenTelemetry, структурированные логи, метрики.
14. Безопасность: OWASP, валидация WebApp initData, шифрование в транзите.
15. Масштабируемость: горизонтальное масштабирование, Docker, CI/CD, blue/green deploy.

---

## B) ROLE-BASED TEAM DECISIONS

### B.1) Principal Product Architect (DDD / Event-driven / API-first)

**Ключевые решения:**
- Выделены bounded contexts: Projects, DailyOps, Workforce, Materials, Approvals, Audit.
- Ubiquitous language: Проект, Объект, Зона, Задача, Дневной отчёт, Замечание, Согласование.
- Все мутации порождают доменные события (TaskCreated, ReportSubmitted, ApprovalDecided).
- API-first: контракты фиксируются до реализации, версионирование через URL prefix (/v1/).

**Чеклист:**
- [ ] Карта доменов и контекстов утверждена
- [ ] Каталог событий задокументирован
- [ ] Агрегаты определены (Project, DailyLog, Approval)
- [ ] Backward compatibility при изменении API

**Deliverables:** Карта доменов, каталог событий — см. секции ниже.

---

### B.2) Staff Backend Architect (NestJS / PostgreSQL / Redis)

**Ключевые решения:**
- NestJS с модульной структурой по bounded contexts.
- PostgreSQL — основная БД, Redis — кэш + очереди (BullMQ).
- CQRS для тяжёлых read-моделей (дашборды в Mini App).
- Миграции через TypeORM/Prisma, строгая валидация (class-validator).
- Idempotency key в заголовке для всех POST/PUT.
- Structured logging (pino), correlation_id в каждом запросе.

**Чеклист:**
- [ ] ERD утверждён
- [ ] Миграции автоматизированы
- [ ] Rate limiting настроен (per-user, per-endpoint)
- [ ] Retry policy для внешних вызовов (Telegram API)
- [ ] Health check endpoints (/health, /ready)

**Deliverables:** ERD, API endpoints, модули — см. секции E, F, G.

---

### B.3) Telegram Platform Engineer (Bot API + WebApp SDK)

**Ключевые решения:**
- FSM на базе telegraf/grammY scenes для управления состояниями.
- editMessageText/editMessageReplyMarkup — никаких новых сообщений при навигации.
- Callback data schema: `{action}:{entity}:{id}:{page}` (макс 64 байта).
- Deep links для быстрого входа в контекст: `t.me/bot?start=project_123`.
- WebApp initData валидация на сервере (HMAC-SHA256).
- Mini App открывается через web_app кнопку в боте.

**Чеклист:**
- [ ] FSM-диаграмма всех состояний
- [ ] Callback data не превышает 64 байт
- [ ] Все inline keyboards имеют ≤5 кнопок
- [ ] WebApp initData проверяется на каждом запросе
- [ ] Graceful fallback если WebApp недоступен

**Deliverables:** Навигационная карта бота — см. секцию C.

---

### B.4) Senior UX Architect (Enterprise SaaS)

**Ключевые решения:**
- Один экран = одна задача. Максимум 3–5 кнопок.
- Консистентная терминология во всех экранах.
- Empty state: "Нет данных" + CTA. Loading: индикатор. Error: текст + "Повторить".
- Микрокопия: глаголы действия ("Создать отчёт", "Согласовать"), не существительные.
- Bot: быстрые действия, статусы, уведомления. Mini App: таблицы, графики, формы.

**Чеклист:**
- [ ] Каждый экран имеет empty/loading/error состояния
- [ ] CTA-иерархия: primary (1) + secondary (1–2) + navigation
- [ ] Wording review пройден
- [ ] Навигация: ≤3 клика до любого действия

**Deliverables:** Screen map бота и Mini App — см. секции C, D.

---

### B.5) Security & Compliance Engineer

**Ключевые решения:**
- Auth: Telegram user_id + WebApp initData HMAC валидация.
- RBAC: роли хранятся в БД, проверяются middleware на каждом запросе.
- Все входные данные санитизируются (XSS, SQL injection prevention).
- Secrets: переменные окружения, никаких хардкодов. Vault для production.
- AuditLog: immutable таблица, write-only (no UPDATE/DELETE).
- HTTPS everywhere, TLS 1.2+.

**Чеклист:**
- [ ] OWASP Top 10 покрыт
- [ ] Input validation на всех endpoints
- [ ] Rate limiting активен
- [ ] Secrets не в коде
- [ ] AuditLog не допускает модификации
- [ ] Регулярный dependency audit (npm audit)

**Deliverables:** Threat model, auth model — см. секцию H.

---

### B.6) DevOps/SRE Engineer

**Ключевые решения:**
- Docker Compose для dev, Kubernetes/Docker Swarm для prod.
- CI/CD: GitHub Actions (lint → test → build → deploy).
- Blue/Green deploy с автоматическим rollback.
- Observability: Sentry (errors), OpenTelemetry (traces), Prometheus (metrics), Loki (logs).
- Health checks: /health (liveness), /ready (readiness).
- Бэкапы PostgreSQL: ежедневно, retention 30 дней.

**Чеклист:**
- [ ] Dockerfile оптимизирован (multi-stage)
- [ ] CI pipeline проходит <5 мин
- [ ] Alerting настроен (error rate, latency p99, disk)
- [ ] Runbook для типовых инцидентов
- [ ] Rollback проверен

**Deliverables:** Environments, pipeline — см. секцию I.

---

### B.7) Data/Analytics Engineer

**Ключевые решения:**
- Event tracking: все пользовательские действия → analytics events.
- BI-ready views в PostgreSQL для дашбордов.
- KPI: DAU, отчёты/день, время согласования, % просроченных задач.

**Чеклист:**
- [ ] Event schema задокументирована
- [ ] Retention/funnel метрики определены
- [ ] Дашборды спроектированы

**Deliverables:** Event plan, KPIs — ниже.

**Event tracking plan:**
| Event | Properties | Trigger |
|---|---|---|
| bot_start | user_id, role | /start |
| project_selected | project_id | Выбор проекта |
| daily_report_submitted | project_id, zone_id, date | Отправка отчёта |
| approval_decided | approval_id, decision | Согласование |
| issue_created | project_id, severity | Создание замечания |
| miniapp_opened | user_id, page | Открытие Mini App |
| filter_applied | page, filters | Применение фильтра |

**KPIs:**
- DAU / WAU / MAU
- Отчётов в день (план vs факт)
- Среднее время согласования (часы)
- % просроченных задач
- Количество замечаний по проекту/зоне

**Дашборды:**
1. Операционный (ежедневная сводка)
2. Проектный (прогресс, отклонения)
3. Кадровый (присутствие, выработка)
4. Снабжение (заявки, остатки)
5. Руководительский (KPI, тренды)

---

## C) UX: BOT SCREEN MAP

### C.1) HOME — Главный экран
**Purpose:** Точка входа после /start. Навигация по основным разделам.
**Message:**
```
🏗️ Добро пожаловать, {name}!
Роль: {role}

Выберите действие:
```
**Buttons:**
1. 📋 Мои проекты → PROJECT_LIST
2. 📝 Дневной отчёт → DAILY_REPORT_SELECT
3. ✅ Согласования ({count}) → APPROVALS_LIST
4. ⚠️ Замечания → ISSUES_LIST
5. ⚙️ Настройки → SETTINGS

---

### C.2) PROJECT_LIST — Список проектов
**Purpose:** Выбор активного проекта.
**Message:**
```
📋 Ваши проекты:
```
**Buttons:** (динамические, макс 5 + пагинация)
1. {project_name_1} → PROJECT_DETAIL:{id}
2. {project_name_2} → PROJECT_DETAIL:{id}
3. {project_name_3} → PROJECT_DETAIL:{id}
4. ◀️ Назад → HOME
5. ▶️ Далее → PROJECT_LIST:page:{n}

---

### C.3) PROJECT_DETAIL — Карточка проекта
**Purpose:** Сводка по проекту, быстрые действия.
**Message:**
```
📋 {project_name}
📍 {address}
📅 {start_date} — {end_date}
📊 Прогресс: {percent}%
👷 Рабочих сегодня: {workers_count}
```
**Buttons:**
1. 📝 Создать отчёт → DAILY_REPORT_ZONE:{project_id}
2. ⚠️ Замечания ({count}) → ISSUES_LIST:{project_id}
3. 📊 Аналитика → MINIAPP:dashboard:{project_id}
4. 👷 Персонал → MINIAPP:workforce:{project_id}
5. ◀️ Назад → PROJECT_LIST

---

### C.4) DAILY_REPORT_SELECT — Выбор проекта для отчёта
**Purpose:** Если у пользователя >1 проекта — выбор. Иначе — сразу в DAILY_REPORT_ZONE.
**Message:**
```
📝 Дневной отчёт
Выберите проект:
```
**Buttons:** (динамические)
1. {project_name_1} → DAILY_REPORT_ZONE:{id}
2. {project_name_2} → DAILY_REPORT_ZONE:{id}
3. ◀️ Назад → HOME

---

### C.5) DAILY_REPORT_ZONE — Выбор зоны
**Purpose:** Выбор зоны/участка для отчёта.
**Message:**
```
📝 Отчёт: {project_name}
📅 {today_date}

Выберите зону:
```
**Buttons:**
1. {zone_1} → DAILY_REPORT_ENTRY:{project_id}:{zone_id}
2. {zone_2} → DAILY_REPORT_ENTRY:{project_id}:{zone_id}
3. {zone_3} → DAILY_REPORT_ENTRY:{project_id}:{zone_id}
4. ➕ Все зоны → MINIAPP:report_form:{project_id}
5. ◀️ Назад → PROJECT_DETAIL:{project_id}

---

### C.6) DAILY_REPORT_ENTRY — Ввод данных отчёта
**Purpose:** Пошаговый ввод: работы, объём, рабочие, проблемы.
**FSM Steps:**
- Step 1: "Какие работы выполнены?" → текстовый ввод
- Step 2: "Объём выполненных работ?" → текстовый ввод
- Step 3: "Количество рабочих?" → текстовый ввод
- Step 4: "Проблемы/замечания?" → текст или "Нет"
- Step 5: "Фото?" → фото или "Пропустить"

**Message (Step 5 — подтверждение):**
```
📝 Отчёт: {project_name} / {zone_name}
📅 {date}

🔨 Работы: {works}
📏 Объём: {volume}
👷 Рабочих: {workers}
⚠️ Проблемы: {issues}
📷 Фото: {photo_count} шт.

Всё верно?
```
**Buttons:**
1. ✅ Отправить → DAILY_REPORT_CONFIRM
2. ✏️ Редактировать → DAILY_REPORT_ENTRY (step 1)
3. ❌ Отменить → PROJECT_DETAIL:{project_id}

---

### C.7) APPROVALS_LIST — Список согласований
**Purpose:** Входящие запросы на согласование.
**Message:**
```
✅ Согласования ({count} ожидают):
```
**Buttons:** (динамические)
1. {approval_title_1} ⏳ → APPROVAL_DETAIL:{id}
2. {approval_title_2} ⏳ → APPROVAL_DETAIL:{id}
3. {approval_title_3} ⏳ → APPROVAL_DETAIL:{id}
4. ◀️ Назад → HOME

---

### C.8) APPROVAL_DETAIL — Детали согласования
**Purpose:** Просмотр и принятие решения.
**Message:**
```
✅ Согласование #{id}
📋 {type}: {title}
👤 От: {requester}
📅 {date}

{description}
```
**Buttons:**
1. ✅ Согласовать → APPROVAL_CONFIRM:approve:{id}
2. ❌ Отклонить → APPROVAL_REJECT_REASON:{id}
3. 💬 Комментарий → APPROVAL_COMMENT:{id}
4. ◀️ Назад → APPROVALS_LIST

---

### C.9) ISSUES_LIST — Список замечаний
**Purpose:** Просмотр и создание замечаний.
**Message:**
```
⚠️ Замечания {project_name}:
🔴 Критичных: {critical}
🟡 Средних: {medium}
🟢 Низких: {low}
```
**Buttons:**
1. 🔴 Критичные → ISSUES_FILTERED:critical
2. 📋 Все замечания → MINIAPP:issues:{project_id}
3. ➕ Создать замечание → ISSUE_CREATE:{project_id}
4. ◀️ Назад → HOME

---

### C.10) SETTINGS — Настройки
**Purpose:** Управление профилем и уведомлениями.
**Message:**
```
⚙️ Настройки

👤 {name} | {role}
🔔 Уведомления: {on/off}
🌐 Язык: {lang}
```
**Buttons:**
1. 🔔 Уведомления → SETTINGS_NOTIFICATIONS
2. 🌐 Язык → SETTINGS_LANGUAGE
3. 📊 Открыть Mini App → MINIAPP:settings
4. ◀️ Назад → HOME

---

## D) UX: MINI APP INFORMATION ARCHITECTURE

### D.1) Страницы и виджеты

| Страница | Виджеты | Роли | Описание |
|---|---|---|---|
| /dashboard | KPI-карточки, графики прогресса, лента событий | CEO, Director, PM | Сводка по всем проектам |
| /project/:id | Прогресс-бар, зоны, задачи, календарь | PM, ПТО, Прораб | Детали проекта |
| /reports | Таблица отчётов, фильтры, экспорт | PM, ПТО, Director | Все дневные отчёты |
| /report/new | Мульти-степ форма, загрузка фото | Прораб, PM | Создание отчёта (сложная форма) |
| /approvals | Список, фильтры по статусу/типу | CEO, Director, PM | Все согласования |
| /issues | Таблица, фильтры, карта замечаний | Все роли | Замечания и дефекты |
| /issue/new | Форма, фото, геолокация, приоритет | Прораб, PM, ПТО | Создание замечания |
| /workforce | Таблица присутствия, графики | PM, Прораб, HR | Учёт персонала |
| /materials | Заявки, остатки, поставки | Снабжение, PM | Управление материалами |
| /material/request | Форма заявки на материалы | Прораб, Снабжение | Создание заявки |
| /analytics | Графики, тренды, воронки | CEO, Director | Аналитика и BI |
| /settings | Профиль, уведомления, язык | Все роли | Настройки пользователя |

### D.2) Состояния экранов

**Empty state:**
- Иконка + текст "Нет данных" + CTA-кнопка ("Создать первый отчёт")
- Пример: /reports при отсутствии отчётов → "📝 Отчётов пока нет. Создайте первый!"

**Loading state:**
- Skeleton-экраны (shimmer) для таблиц и карточек
- Спиннер для действий (отправка формы)

**Error state:**
- Текст ошибки + кнопка "Повторить"
- При 403: "У вас нет доступа к этому разделу"
- При 500: "Что-то пошло не так. Попробуйте позже"

### D.3) Ключевые пользовательские пути (User Journeys)

**Journey 1: Прораб сдаёт дневной отчёт**
1. Открывает Mini App → /report/new
2. Выбирает проект → зону → дату
3. Заполняет: работы, объём, рабочие, проблемы
4. Прикрепляет фото (до 10 шт.)
5. Отправляет → уведомление PM

**Journey 2: PM согласовывает заявку**
1. Push-уведомление в боте → "Новая заявка на согласование"
2. Нажимает кнопку → APPROVAL_DETAIL в боте
3. Или открывает Mini App → /approvals → фильтр "Ожидают"
4. Просматривает детали → Согласовать / Отклонить с комментарием

**Journey 3: CEO смотрит сводку**
1. Открывает Mini App → /dashboard
2. Видит KPI: прогресс по проектам, отклонения, просрочки
3. Кликает на проект → /project/:id → детальный прогресс
4. Переходит в /analytics → тренды за период

**Journey 4: Прораб создаёт замечание**
1. Бот → ➕ Создать замечание → или Mini App → /issue/new
2. Выбирает проект, зону, приоритет
3. Описание + фото + геолокация
4. Отправляет → уведомление ответственному

**Journey 5: Снабженец обрабатывает заявку на материалы**
1. Уведомление в боте → новая заявка
2. Открывает Mini App → /materials → фильтр "Новые заявки"
3. Просматривает → подтверждает наличие / заказывает
4. Обновляет статус → уведомление прорабу

---

## E) RBAC MATRIX

| Роль | Проекты | Отчёты | Согласования | Замечания | Материалы | Персонал | Аналитика | Настройки |
|---|---|---|---|---|---|---|---|---|
| **CEO** | Просмотр всех | Просмотр всех | Финальное согласование | Просмотр всех | Просмотр всех | Просмотр всех | Полный доступ | Управление ролями |
| **Director** | Просмотр всех | Просмотр всех | Согласование L2 | Просмотр всех | Просмотр всех | Просмотр своих | Полный доступ | Управление проектами |
| **PM** | CRUD своих | CRUD своих | Согласование L1 | CRUD своих | Просмотр своих | CRUD своих | Свои проекты | Свой профиль |
| **ПТО** | Просмотр своих | Просмотр + проверка | — | CRUD своих | Просмотр | Просмотр | Свои проекты | Свой профиль |
| **Прораб** | Просмотр своих | Создание своих | Запрос согласования | Создание | Запрос заявки | Отметка присутствия | — | Свой профиль |
| **Снабжение** | Просмотр своих | — | Согласование материалов | Просмотр | CRUD | — | Материалы | Свой профиль |
| **Субподрядчик** | Просмотр назначенных | Создание своих | — | Просмотр своих | — | — | — | Свой профиль |

**Примечания:**
- "Своих" = привязанных к проектам пользователя
- CRUD = Create, Read, Update, Delete
- Цепочка согласований: Прораб → PM (L1) → Director (L2) → CEO (финал)
- Субподрядчик — минимальные права, только свои данные

---

## F) DATA MODEL (TEXT ERD)

### F.1) User
```
User
├── id: UUID (PK)
├── telegram_id: BIGINT (UNIQUE, NOT NULL)
├── name: VARCHAR(255)
├── phone: VARCHAR(20)
├── role: ENUM(ceo, director, pm, pto, foreman, procurement, subcontractor)
├── is_active: BOOLEAN (DEFAULT true)
├── language: VARCHAR(5) (DEFAULT 'ru')
├── notification_settings: JSONB
├── created_at: TIMESTAMPTZ
├── updated_at: TIMESTAMPTZ
INDEX: telegram_id, role
```

### F.2) Project
```
Project
├── id: UUID (PK)
├── name: VARCHAR(255) NOT NULL
├── code: VARCHAR(50) UNIQUE
├── address: TEXT
├── status: ENUM(planning, active, paused, completed, archived)
├── start_date: DATE
├── end_date: DATE
├── progress_percent: DECIMAL(5,2) DEFAULT 0
├── created_by: UUID (FK → User)
├── created_at: TIMESTAMPTZ
├── updated_at: TIMESTAMPTZ
INDEX: status, code
```

### F.3) ProjectMember
```
ProjectMember
├── id: UUID (PK)
├── project_id: UUID (FK → Project) NOT NULL
├── user_id: UUID (FK → User) NOT NULL
├── role_in_project: ENUM(pm, pto, foreman, procurement, subcontractor)
├── assigned_at: TIMESTAMPTZ
UNIQUE: (project_id, user_id)
INDEX: project_id, user_id
```

### F.4) Zone
```
Zone
├── id: UUID (PK)
├── project_id: UUID (FK → Project) NOT NULL
├── name: VARCHAR(255) NOT NULL
├── description: TEXT
├── sort_order: INT DEFAULT 0
├── is_active: BOOLEAN DEFAULT true
├── created_at: TIMESTAMPTZ
INDEX: project_id
UNIQUE: (project_id, name)
```

### F.5) Task
```
Task
├── id: UUID (PK)
├── project_id: UUID (FK → Project) NOT NULL
├── zone_id: UUID (FK → Zone)
├── title: VARCHAR(500) NOT NULL
├── description: TEXT
├── status: ENUM(planned, in_progress, completed, blocked, cancelled)
├── priority: ENUM(low, medium, high, critical)
├── assigned_to: UUID (FK → User)
├── planned_start: DATE
├── planned_end: DATE
├── actual_start: DATE
├── actual_end: DATE
├── progress_percent: DECIMAL(5,2) DEFAULT 0
├── created_by: UUID (FK → User)
├── created_at: TIMESTAMPTZ
├── updated_at: TIMESTAMPTZ
INDEX: project_id, zone_id, status, assigned_to
```

### F.6) DailyLog
```
DailyLog
├── id: UUID (PK)
├── project_id: UUID (FK → Project) NOT NULL
├── zone_id: UUID (FK → Zone) NOT NULL
├── date: DATE NOT NULL
├── works_description: TEXT NOT NULL
├── volume: TEXT
├── workers_count: INT
├── issues_description: TEXT
├── weather: VARCHAR(100)
├── status: ENUM(draft, submitted, reviewed, approved)
├── submitted_by: UUID (FK → User) NOT NULL
├── reviewed_by: UUID (FK → User)
├── created_at: TIMESTAMPTZ
├── updated_at: TIMESTAMPTZ
UNIQUE: (project_id, zone_id, date, submitted_by)
INDEX: project_id, date, status
```

### F.7) Attachment
```
Attachment
├── id: UUID (PK)
├── entity_type: ENUM(daily_log, issue, material_request, approval)
├── entity_id: UUID NOT NULL
├── file_url: TEXT NOT NULL
├── file_name: VARCHAR(255)
├── file_size: INT
├── mime_type: VARCHAR(100)
├── uploaded_by: UUID (FK → User)
├── created_at: TIMESTAMPTZ
INDEX: (entity_type, entity_id)
```

### F.8) Issue
```
Issue
├── id: UUID (PK)
├── project_id: UUID (FK → Project) NOT NULL
├── zone_id: UUID (FK → Zone)
├── title: VARCHAR(500) NOT NULL
├── description: TEXT
├── severity: ENUM(low, medium, high, critical)
├── status: ENUM(open, in_progress, resolved, closed)
├── assigned_to: UUID (FK → User)
├── reported_by: UUID (FK → User) NOT NULL
├── due_date: DATE
├── resolved_at: TIMESTAMPTZ
├── latitude: DECIMAL(10,7)
├── longitude: DECIMAL(10,7)
├── created_at: TIMESTAMPTZ
├── updated_at: TIMESTAMPTZ
INDEX: project_id, severity, status, assigned_to
```

### F.9) Approval
```
Approval
├── id: UUID (PK)
├── type: ENUM(daily_log, material_request, task_completion, budget)
├── entity_id: UUID NOT NULL
├── project_id: UUID (FK → Project) NOT NULL
├── requested_by: UUID (FK → User) NOT NULL
├── assigned_to: UUID (FK → User) NOT NULL
├── level: INT NOT NULL (1=PM, 2=Director, 3=CEO)
├── status: ENUM(pending, approved, rejected)
├── decision_comment: TEXT
├── decided_at: TIMESTAMPTZ
├── idempotency_key: VARCHAR(255) UNIQUE
├── created_at: TIMESTAMPTZ
INDEX: assigned_to, status, project_id, type
```

### F.10) MaterialRequest
```
MaterialRequest
├── id: UUID (PK)
├── project_id: UUID (FK → Project) NOT NULL
├── requested_by: UUID (FK → User) NOT NULL
├── material_name: VARCHAR(500) NOT NULL
├── quantity: DECIMAL(12,2) NOT NULL
├── unit: VARCHAR(50) NOT NULL
├── urgency: ENUM(low, normal, urgent)
├── status: ENUM(draft, pending, approved, ordered, delivered, cancelled)
├── notes: TEXT
├── needed_by: DATE
├── created_at: TIMESTAMPTZ
├── updated_at: TIMESTAMPTZ
INDEX: project_id, status, urgency
```

### F.11) Contractor
```
Contractor
├── id: UUID (PK)
├── name: VARCHAR(255) NOT NULL
├── contact_person: VARCHAR(255)
├── phone: VARCHAR(20)
├── email: VARCHAR(255)
├── specialization: VARCHAR(255)
├── is_active: BOOLEAN DEFAULT true
├── created_at: TIMESTAMPTZ
INDEX: is_active
```

### F.12) AuditLog (IMMUTABLE)
```
AuditLog
├── id: UUID (PK)
├── correlation_id: UUID NOT NULL
├── actor_id: UUID (FK → User)
├── actor_role: VARCHAR(50)
├── action: VARCHAR(100) NOT NULL
├── entity_type: VARCHAR(100) NOT NULL
├── entity_id: UUID NOT NULL
├── old_values: JSONB
├── new_values: JSONB
├── ip_address: VARCHAR(45)
├── user_agent: TEXT
├── created_at: TIMESTAMPTZ NOT NULL DEFAULT NOW()

-- NO UPDATE/DELETE permissions on this table
-- Partitioned by created_at (monthly)
INDEX: entity_type + entity_id, actor_id, created_at, correlation_id
```

### F.13) Связи (Relationships)
```
User 1──N ProjectMember N──1 Project
Project 1──N Zone
Project 1──N Task
Zone 1──N Task
Zone 1──N DailyLog
User 1──N DailyLog (submitted_by)
User 1──N Issue (reported_by)
Project 1──N Issue
Project 1──N Approval
Project 1──N MaterialRequest
Attachment N──1 (DailyLog | Issue | MaterialRequest | Approval) [polymorphic]
AuditLog — standalone, references by entity_type + entity_id
```

> Секции G, H, I, J — см. файлы PROJECT_SPEC_G.md и PROJECT_SPEC_HIJ.md
