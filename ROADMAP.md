# ROADMAP — STSphera: от текущего состояния к production-grade

---

## ФАЗА 0: БЕЗОПАСНОСТЬ (3–5 дней)
> Без этого — нельзя в продакшн.

### 0.1 Supabase RLS Policies
- Включить RLS на ВСЕХ таблицах (projects, alerts, crews, floors, facades, materials, plan_fact, work_types, documents, document_folders, calendar_events, profiles)
- Политики:
  - `projects`: SELECT — только участники (через project_members или profiles)
  - `alerts`, `floors`, `plan_fact`, etc.: SELECT/INSERT/UPDATE — только если user является участником project_id
  - `profiles`: SELECT own, UPDATE own
  - `documents`: через folder → project → membership
- Тест: попытка доступа к чужому проекту через Supabase client должна вернуть пустой результат

### 0.2 Telegram WebApp initData валидация
- В каждой Edge Function (telegram-bot-webhook, ai-chat, etc.):
  ```ts
  import { validate } from "@twa-dev/sdk"; // или ручная HMAC-SHA256
  // Проверить: hash, auth_date < 300 сек, user.id
  ```
- Создать middleware `validateTelegramUser(req)` → возвращает telegram_id или 401
- Mini App: передавать initData в каждом запросе к Edge Functions

### 0.3 Убрать PIN-логин
- LoginScreen.tsx → удалить или перенести за `if (import.meta.env.DEV)`
- Оставить только AuthScreen.tsx (Supabase Auth)
- Добавить Telegram OAuth как основной метод входа для Mini App

### 0.4 Rate Limiting
- Edge Function ai-chat: Redis/in-memory лимит 10 req/min per user
- Или Supabase Edge Function rate limiting через KV/headers

### 0.5 Secrets Audit
- Проверить что VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY — это anon key
- Все service_role ключи — только в Edge Functions env, не в клиенте
- OpenAI/Telegram bot token — только в Edge Functions secrets

---

## ФАЗА 1: АРХИТЕКТУРНЫЙ РЕФАКТОРИНГ (1–2 недели)
> Фундамент для масштабирования.

### 1.1 Типизация
- `npx supabase gen types typescript --project-id <id> > src/integrations/supabase/database.types.ts`
- Заменить все `any` на сгенерированные типы
- Создать domain types: `src/types/project.ts`, `src/types/dailyLog.ts`, etc.

### 1.2 Data Layer (хуки)
Вынести data fetching из компонентов:
```
src/hooks/
  useProjects.ts      — список проектов, CRUD
  useProject.ts       — один проект + summary
  useAlerts.ts        — алерты проекта
  useCrews.ts         — бригады
  useFloors.ts        — этажи/фасады
  usePlanFact.ts      — план-факт
  useWorkTypes.ts     — виды работ (ГПР)
  useDocuments.ts     — документы + папки
  useCalendar.ts      — события календаря
  useMaterials.ts     — материалы
```
- Каждый хук использует `@tanstack/react-query` (useQuery/useMutation)
- Оптимистичные обновления для write-операций
- Invalidation стратегия: по project_id

### 1.3 Разбивка компонентов
- `CreateProjectWizard.tsx` (500+ строк) → разбить на:
  - `CreateProjectWizard/index.tsx` (оркестратор)
  - `CreateProjectWizard/StepObject.tsx`
  - `CreateProjectWizard/StepClient.tsx`
  - `CreateProjectWizard/StepContacts.tsx`
  - `CreateProjectWizard/StepWorkType.tsx`
  - `CreateProjectWizard/StepWorks.tsx`
  - `CreateProjectWizard/StepGPR.tsx`
- `ProjectCalendar.tsx` → разбить на CalendarHeader, MonthView, WeekView, EventCard, EventForm
- `AIAssistant.tsx` → разбить на ChatPanel, MessageBubble, QuickActions

### 1.4 Error Boundaries
```tsx
// src/components/ErrorBoundary.tsx
// Обернуть каждый таб в ErrorBoundary с fallback UI
```

### 1.5 Lazy Loading
```tsx
const Dashboard = lazy(() => import("@/components/Dashboard"));
const Documents = lazy(() => import("@/components/Documents"));
const ProjectCalendar = lazy(() => import("@/components/ProjectCalendar"));
const GamificationPanel = lazy(() => import("@/components/GamificationPanel"));
// Recharts загружается только когда нужен
```

### 1.6 Убрать дублирование Auth
- Удалить LoginScreen.tsx (PIN-based)
- AuthScreen.tsx — единственная точка входа
- Добавить Telegram Login Widget для Mini App контекста

---

## ФАЗА 2: TELEGRAM BOT УЛУЧШЕНИЯ (1–2 недели)
> Bot = транзакционный интерфейс.

### 2.1 FSM для бота
- Внедрить grammY или telegraf scenes в Edge Function
- Или: stateless FSM через callback_data parsing
- Callback schema: `{action}:{entity}:{id}` (макс 64 байт)

### 2.2 Основные flow бота
- `/start` → регистрация/привязка к Supabase user
- Главное меню → inline keyboard (Проекты, Отчёт, Согласования, Алерты)
- Создание дневного отчёта через бот (пошаговый FSM)
- Согласования: approve/reject прямо в боте
- editMessageText дисциплина — не спамить новыми сообщениями

### 2.3 Уведомления
- telegram-notify: структурированные шаблоны
- Типы: новый алерт, согласование ожидает, дедлайн через 24ч, отчёт не сдан
- Расписание: telegram-scheduler → ежедневная сводка в 09:00

### 2.4 Deep Links
- `t.me/STSpheraBot?start=project_{id}` → сразу в контекст проекта
- `t.me/STSpheraBot?start=report_{project_id}` → создание отчёта
- Mini App кнопка в боте для сложных действий

---

## ФАЗА 3: ФУНКЦИОНАЛ V1 (2–3 недели)
> Закрытие основных бизнес-потребностей.

### 3.1 Согласования (Approvals)
- Таблица `approvals` в Supabase
- Типы: дневной отчёт, заявка на материалы, акт выполненных работ
- Multi-level: Прораб → PM → Director
- UI в Mini App: список, фильтры, детали, approve/reject с комментарием
- Bot: inline кнопки для быстрого согласования

### 3.2 Материалы и снабжение
- Расширить существующий Supply/SupplyDashboard
- Заявки на материалы с workflow (создание → согласование → заказ → доставка)
- Уведомления при дефиците
- Связь с план-фактом

### 3.3 Дневные отчёты (Daily Logs)
- Отдельная таблица `daily_logs` (не путать с plan_fact)
- Привязка к проекту + зоне + дате
- Поля: работы, объём, рабочие, проблемы, фото, погода
- Статусы: draft → submitted → reviewed → approved
- Автоматический алерт если отчёт не сдан до 18:00

### 3.4 AuditLog
- Таблица `audit_log`: immutable, no UPDATE/DELETE
- Trigger на ключевых таблицах (projects, approvals, daily_logs)
- Поля: correlation_id, actor_id, action, entity_type, entity_id, old_values, new_values
- UI: доступ только CEO/Director в Mini App

### 3.5 Улучшение Dashboard
- KPI из реальных данных (не только модули/кронштейны)
- Прогресс по видам работ из ГПР
- Тренды (неделя к неделе)
- Алерты на дашборде

---

## ФАЗА 4: АНАЛИТИКА И ИНТЕГРАЦИИ (2–3 недели)

### 4.1 Аналитика
- BI-ready views в PostgreSQL
- Дашборд директора: портфель проектов, сравнение, тренды
- Экспорт в Excel/PDF

### 4.2 Google Sheets синхронизация
- Доработать существующую google-sheets-sync Edge Function
- Двусторонняя синхронизация: импорт данных из Sheets, экспорт отчётов

### 4.3 1С интеграция (если нужно)
- Webhook endpoint для приёма данных из 1С
- Маппинг: контрагенты, договоры, оплаты → calendar_events, materials

---

## ФАЗА 5: PRODUCTION & OBSERVABILITY (параллельно)

### 5.1 CI/CD
- GitHub Actions: lint → type-check → test → build → deploy
- Preview deployments для PR
- Supabase migrations в CI

### 5.2 Мониторинг
- Sentry для frontend ошибок
- Supabase Dashboard для мониторинга БД
- Edge Function logs → structured logging

### 5.3 Тесты
- Unit: хуки (useProjects, useAlerts)
- Integration: auth flow, создание проекта
- E2E: Playwright для критических путей

### 5.4 Бэкапы
- Supabase автоматические бэкапы (Pro plan)
- Экспорт данных: pg_dump скрипт

---

## TIMELINE

| Фаза | Срок | Зависимости |
|---|---|---|
| Фаза 0: Безопасность | Дни 1–5 | — |
| Фаза 1: Рефакторинг | Дни 6–19 | Фаза 0 |
| Фаза 2: Telegram Bot | Дни 10–24 | Фаза 0 |
| Фаза 3: Функционал V1 | Дни 15–35 | Фаза 1 |
| Фаза 4: Аналитика | Дни 30–50 | Фаза 3 |
| Фаза 5: Production | Параллельно | — |

Фазы 1 и 2 можно вести параллельно. Фаза 5 идёт фоном с первого дня.

---

## ВОПРОСЫ К АЛЕКСЕЮ

1. Lovable.dev — продолжаем использовать для генерации, или переходим на ручную разработку?
2. Supabase plan — Free или Pro? (влияет на RLS, бэкапы, Edge Functions лимиты)
3. Какие роли реально используются сейчас? (из 10 в LoginScreen — все нужны?)
4. 1С интеграция — актуально или на потом?
5. Сколько пользователей ожидается на старте?
