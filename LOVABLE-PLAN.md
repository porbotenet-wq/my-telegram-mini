# STSphera — Lovable Implementation Plan
# Скопировать целиком в Lovable как промпт

## Контекст
ERP для управления стройкой (СПК, алюминий, НВФ). Telegram Mini App.
Stack: Vite + React + TS + Tailwind + shadcn-ui + Supabase.
10 ролей, у каждой свой экран. Визуальный стиль: MONOLITH (тёмный, бетон, LED-акценты).

---

## БЛОК 1: Ролевые дашборды в Mini App

Сейчас Dashboard.tsx один для всех. Нужно: при загрузке определять роль пользователя (из useAuth → roles) и рендерить соответствующий дашборд.

### 1.1 Директор (DirectorDashboard.tsx — доработать)
Уже есть базовый. Добавить:
- KPI по отделам: карточки с метриками (проектный отдел — кол-во замечаний, снабжение — дефицит позиций, монтаж — % выполнения)
- Финансовый блок: бюджет план/факт, отклонение (данные из plan_fact, группировка по category="finance")
- Критические отклонения: топ-3 алерта с priority="critical", кликабельные
- Сводка по прорабам: кто подал отчёт сегодня, кто нет (из daily_logs за today)

### 1.2 РП — Руководитель проекта (PMDashboard.tsx — новый)
- Счётчики вверху: входящие (bot_inbox where to_roles contains "pm"), просроченные задачи, ожидающие согласования
- Лента активности: последние 10 событий (bot_audit_log) — кто что отправил/согласовал
- Быстрые действия: напоминание отделу, эскалация, запрос фотоотчёта (открывают бота через tg://resolve)
- Прогресс по ГПР: план-факт по work_types

### 1.3 Прораб (ForemanDashboard.tsx — новый)
- Статус дня: подан ли отчёт (daily_logs за today, user_id = current)
- Мои этажи: floors привязанные к прорабу, прогресс по каждому
- Кнопка "Подать отчёт" — крупная, 64px высота, зелёная если не подан, серая если подан
- Фотоотчёты: последние 5 фото из bot_documents where sender_id = current
- AI-помощник: уже есть ForemenAI, оставить как есть

### 1.4 Снабжение (SupplyDashboard.tsx — доработать)
Уже есть базовый. Добавить:
- Дефицит-панель: materials where deficit > 0, сортировка по критичности
- Статус закупок: группировка materials по status (заказано/в пути/получено/дефицит)
- Отгрузки: shipments за последние 7 дней, timeline
- Заявки от прорабов: bot_inbox where to_roles contains "supply" and type = "tool_request"

### 1.5 ПТО (PTODashboard.tsx — новый)
- Реестр АОСР: documents where type in ("aosr_brackets", "aosr_frame", "aosr_glass"), статус (черновик/на подписи/подписан)
- Исполнительные схемы: documents where type = "exec_scheme"
- Счётчик: сколько АОСР закрыто / сколько нужно по проекту
- Входящие от прорабов: этапные отчёты, ожидающие проверки

### 1.6 Технадзор (InspectorDashboard.tsx — новый)
- Журнал проверок: bot_documents where sender_role = "inspector", хронология
- Открытые замечания: alerts where created_by_role = "inspector" and is_resolved = false
- Приёмка этапов: facades × stages матрица (кронштейны/каркас/заполнение), статус по каждому
- Кнопка "Новое замечание" — крупная, красная

### Роутинг в Dashboard.tsx:
```tsx
const DashboardRouter = ({ projectId }: { projectId: string }) => {
  const { roles } = useAuth();
  const primary = detectPrimaryRole(roles);
  
  switch (primary) {
    case "director": return <DirectorDashboard projectId={projectId} />;
    case "pm": return <PMDashboard projectId={projectId} />;
    case "foreman1": case "foreman2": case "foreman3": 
      return <ForemanDashboard projectId={projectId} />;
    case "supply": return <SupplyDashboard projectId={projectId} />;
    case "pto": return <PTODashboard projectId={projectId} />;
    case "inspector": return <InspectorDashboard projectId={projectId} />;
    default: return <Dashboard projectId={projectId} />;
  }
};
```

Функцию detectPrimaryRole скопировать из бота (приоритет: director > pm > opr > km > kmd > supply > production > foreman > pto > inspector).

---

## БЛОК 2: Авто-напоминания (bot-scheduler)

Файл: supabase/functions/bot-scheduler/index.ts
Уже есть базовый scheduler. Добавить новые типы событий в bot_event_queue.

### 2.1 Утренняя сводка (08:00 MSK, ежедневно)
Для каждой роли — своя сводка:
- Директор: кол-во проектов, критические алерты, кто не подал отчёт вчера
- РП: входящие за ночь, просроченные задачи, план на сегодня из ГПР
- Прораб: план работ на сегодня (из plan_fact), напоминание подать отчёт
- Снабжение: дефицит, ожидаемые поставки сегодня
- ПТО: АОСР на подписи, запланированные проверки
- Технадзор: открытые замечания, запланированные приёмки

Реализация: в bot-scheduler добавить функцию `morningBriefing()`:
```ts
async function morningBriefing() {
  const users = await db.from("profiles").select("user_id, telegram_chat_id, display_name");
  for (const user of users.data || []) {
    if (!user.telegram_chat_id) continue;
    const roles = await getUserRoles(user.user_id);
    const primary = detectPrimaryRole(roles);
    const text = await buildMorningSummary(user, primary);
    await db.from("bot_event_queue").insert({
      event_type: "morning_briefing",
      target_chat_id: user.telegram_chat_id,
      payload: { text },
      status: "pending",
      scheduled_at: new Date().toISOString(),
    });
  }
}
```

### 2.2 Напоминание об отчёте (17:00 MSK)
Только для прорабов. Проверить daily_logs за сегодня:
- Если отчёт НЕ подан → отправить напоминание
- Если подан → пропустить
```ts
async function reportReminder() {
  const foremen = await db.from("user_roles")
    .select("user_id, profiles(telegram_chat_id, display_name)")
    .in("role", ["foreman1", "foreman2", "foreman3"]);
  
  for (const f of foremen.data || []) {
    const today = new Date().toISOString().split("T")[0];
    const { count } = await db.from("daily_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", f.user_id)
      .gte("created_at", today);
    
    if (count === 0) {
      // Отправить напоминание
      await queueNotification(f.profiles.telegram_chat_id, 
        "⚠️ Отчёт за сегодня не подан!\n\nНажмите /menu → 📋 Подать отчёт");
    }
  }
}
```

### 2.3 Дедлайн задач (проверка каждый час)
Для всех ролей. Проверить ecosystem_tasks:
- deadline через 2 часа → предупреждение
- deadline прошёл → алерт assignee + РП

### 2.4 Просроченные документы (09:00 MSK, ежедневно)
Проверить bot_inbox where status = "pending" and created_at < now() - 24h:
- Отправить получателю: "У вас N непрочитанных документов старше 24ч"
- Отправить РП: "N документов без ответа > 24ч"

### 2.5 Триггер приёмки этапа
Не по расписанию, а по событию. Когда прораб отмечает этап готовым:
- Создать запись в bot_event_queue для технадзора и ПТО
- Текст: "🏗️ Прораб [имя] отметил готовность: [фасад] / [этап]. Требуется приёмка."

---

## БЛОК 3: Структура данных (новые таблицы/колонки)

### 3.1 Таблица notifications_config
```sql
CREATE TABLE IF NOT EXISTS notifications_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  morning_briefing BOOLEAN DEFAULT true,
  report_reminder BOOLEAN DEFAULT true,
  deadline_alerts BOOLEAN DEFAULT true,
  dnd_start TIME DEFAULT '22:00',
  dnd_end TIME DEFAULT '07:00',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE notifications_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own config" ON notifications_config
  FOR ALL USING (auth.uid() = user_id);
```

### 3.2 Таблица stage_acceptance
```sql
CREATE TABLE IF NOT EXISTS stage_acceptance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  facade_id UUID REFERENCES facades(id),
  floor_id UUID REFERENCES floors(id),
  stage TEXT NOT NULL CHECK (stage IN ('brackets', 'frame', 'glass', 'sealant')),
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'ready', 'inspection', 'accepted', 'rejected')),
  foreman_id UUID REFERENCES auth.users(id),
  inspector_id UUID REFERENCES auth.users(id),
  pto_id UUID REFERENCES auth.users(id),
  ready_at TIMESTAMPTZ,
  inspected_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE stage_acceptance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project members can view" ON stage_acceptance
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid())
  );
CREATE POLICY "Foremen can mark ready" ON stage_acceptance
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('foreman1','foreman2','foreman3'))
  );
```

### 3.3 Колонка assigned_role в ecosystem_tasks
```sql
ALTER TABLE ecosystem_tasks ADD COLUMN IF NOT EXISTS assigned_role TEXT;
ALTER TABLE ecosystem_tasks ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ;
ALTER TABLE ecosystem_tasks ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;
```

### 3.4 Индекс для быстрых запросов напоминаний
```sql
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON daily_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ecosystem_tasks_deadline ON ecosystem_tasks(deadline, status) WHERE status != 'Выполнено';
CREATE INDEX IF NOT EXISTS idx_stage_acceptance_project ON stage_acceptance(project_id, status);
```

---

## Порядок реализации

1. **Миграции** (БЛОК 3) — сначала структура данных
2. **Ролевые дашборды** (БЛОК 1) — по одному, начиная с Директора и Прораба
3. **Авто-напоминания** (БЛОК 2) — после того как дашборды работают

Каждый блок — отдельный коммит. Не менять существующие компоненты без необходимости.
