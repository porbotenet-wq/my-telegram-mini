# ТЗ Фаза 4 — Новые модули STSphera (по мотивам Битрикс24)

> Цель: консолидировать всё управление стройкой в одном приложении.
> Берём лучшее из Битрикс24, адаптируем под строительную специфику.

---

## Модуль 1: Профиль сотрудника (CRITICAL)

### Что берём из Битрикс
- Карточка профиля: фото, ФИО, должность, отдел, контакты
- Руководитель (кто над ним)
- Структура компании (дерево)

### Адаптация под STSphera
Профиль привязан к ПРОЕКТУ, не к компании. Один человек может быть на разных объектах в разных ролях.

### Экран "Мой профиль"
- Аватар (из Telegram или загрузка)
- ФИО, должность, телефон, email
- Роль на текущем объекте (Прораб / РП / Снабжение / и т.д.)
- Список объектов, на которых работает (с ролью на каждом)
- Статистика: дней на объекте, отчётов подано, фото загружено
- Кнопка "Редактировать" (ограниченно — ФИО, телефон, фото)

### Экран "Команда объекта"
- Список всех участников текущего проекта
- Группировка по ролям: Руководство → Инженеры → Прорабы → Снабжение → ПТО → Технадзор
- Каждый участник: аватар, ФИО, роль, последняя активность (online dot)
- Тап → профиль сотрудника → можно написать в TG
- Поиск по имени

### БД (новые поля в profiles)
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS position text; -- должность
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_active_at timestamptz;
```

### Визуал MONOLITH
- Аватар: 72px, rounded-2xl, border border-primary/20
- Имя: text-[18px] font-bold text-t1
- Должность: text-[12px] text-t2
- Роль badge: led-{color} по роли (green=прораб, blue=РП, amber=снабжение)
- Статистика: KPI cards 3 колонки, num шрифт
- Команда: список с аватарами, online dot (green pulse), роль badge

---

## Модуль 2: Карточки проектов с hero-image (CRITICAL)

### Концепция
Экран "Мои проекты" должен выглядеть как premium-каталог недвижимости (ЦИАН, Яндекс.Недвижимость, Savills) — но для строительных объектов. Красивые фото, ощущение "покупаешь виллу", а внутри — карточка объекта с дашбордом.

### Экран "Мои проекты" (новый ProjectList)
- Вертикальный скролл карточек, gap-4
- Каждая карточка — ПОЛНОЭКРАННАЯ по ширине:
  — Hero image: фото объекта (рендер здания, фото стройки, или красивый placeholder)
  — Высота: 260px (больше чем раньше — фото должно доминировать)
  — rounded-2xl, overflow-hidden, shadow-lg
  — Gradient overlay: linear-gradient(to top, hsl(var(--bg0)) 0%, hsl(var(--bg0)/0.7) 35%, transparent 60%)
  — На overlay (нижняя часть):
    • Название объекта: text-[20px] font-bold text-white, text-shadow
    • Подстрока: город + тип работ (НВФ, СПК, АР) — text-[12px] text-white/70
    • Сроки: "19.01.2026 — 31.07.2027" — text-[11px] text-white/50
    • Mini KPI row (3 chip'а в ряд):
      — Прогресс: "67%" с иконкой TrendingUp
      — Алерты: "3" с иконкой AlertTriangle (красный если > 0)
      — Бригады: "5" с иконкой Users
      — Каждый chip: bg-black/40 backdrop-blur-sm rounded-lg px-2.5 py-1
    • Progress bar 2px внизу карточки (абсолютный, full width)
  — LED-полоска сверху: 2px по статусу (green=в графике, amber=отставание, red=критично)
  — Заказчик badge: правый верхний угол, bg-black/40 backdrop-blur, text-[9px]
- Тап → проваливаемся в проект (текущий flow)
- Кнопка "+" создать проект — floating, bottom-right, bg-primary, shadow-glow
- Пустое состояние: иллюстрация + "Создайте первый объект"

### Внутри карточки объекта (после тапа)
- Hero image сверху (160px) с gradient overlay
- Название + статус + сроки
- Далее — текущий DashboardRouter (ролевой дашборд)
- TabBar внизу как есть

### Placeholder изображения
- Если нет cover_image_url — генерировать gradient placeholder:
  — bg-gradient-to-br from-bg2 to-bg3 с иконкой Building2 по центру (48px, text-t3/30)
  — Или использовать красивые стоковые фото зданий (захардкодить 4-5 вариантов)

### БД
```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cover_image_url text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS work_types text[]; -- ['НВФ', 'СПК', 'АР']
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_name text; -- заказчик
ALTER TABLE projects ADD COLUMN IF NOT EXISTS date_start date;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS date_end date;
```

### Визуал MONOLITH
- Карточка: w-full, h-[260px], relative, rounded-2xl, overflow-hidden
- Image: object-cover, absolute inset-0, w-full h-full
- Overlay: absolute inset-0, gradient
- Контент: absolute bottom-0 left-0 right-0, p-4
- KPI chips: flex gap-2, bg-black/40 backdrop-blur-sm, rounded-lg
- Числа: num text-[13px] font-bold text-white
- Stagger animation при загрузке
- Touch: active:scale-[0.98] transition-transform

---

## Модуль 3: Чаты задач (HIGH)

### Концепция
Не дублировать Telegram — использовать его. Каждая задача/алерт может иметь привязанный TG-чат (группу).

### Реализация
- В карточке задачи/алерта — кнопка "Обсудить в TG"
- Создаёт TG-группу через бота (или открывает существующую)
- Бот добавляет участников по ролям
- Сообщения из группы логируются в bot_audit_log
- В Mini App — список активных обсуждений с последним сообщением и badge

### Экран "Обсуждения"
- Список чатов, привязанных к текущему проекту
- Каждый: иконка типа (задача/алерт/общий), название, последнее сообщение, время, badge непрочитанных
- Тап → открывает TG-чат (deep link)

### БД
```sql
CREATE TABLE IF NOT EXISTS project_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id),
  chat_type text NOT NULL DEFAULT 'general', -- general, task, alert
  reference_id uuid, -- task_id or alert_id
  telegram_chat_id bigint,
  title text NOT NULL,
  last_message text,
  last_message_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

---

## Модуль 4: Контекстное меню объекта (HIGH)

### Концепция
Меню зависит от объекта И роли. Не одно меню на всех — а персонализированное.

### Реализация
Вместо текущего TabBar "Ещё" (MoreDrawer) — полноценный экран "Меню объекта":

- Шапка: название объекта + фото + прогресс
- Секция "Команда": аватары участников, тап → команда
- Секция "Инструменты" (зависит от роли):
  - Прораб: Фотоотчёт, Дневной отчёт, Мои этажи, Алерты
  - РП: Согласования, ГПР, Бригады, Снабжение, Документы
  - Директор: Портфель, KPI, Финансы, Критичное
  - Снабжение: Заказы, Дефицит, Поставщики, Документы
- Секция "Общее": Календарь, Документы, Настройки, Sheets
- Секция "Обсуждения": активные TG-чаты проекта

### Визуал
- Каждый инструмент: иконка в dim-контейнере + название + описание
- Группировка по секциям с section-label
- Всё в MONOLITH стиле

---

## Порядок реализации

1. **Модуль 2** — Карточки проектов с hero-image (визуальный вау-эффект, точка входа)
2. **Модуль 1** — Профиль сотрудника + команда объекта
3. **Модуль 4** — Контекстное меню объекта
4. **Модуль 3** — Чаты задач (требует доработки бота)

---

## Важно

- Модули 1, 2, 4 — чисто фронтенд + минимальные изменения БД
- Модуль 3 — требует доработки бота (создание TG-групп)
- Все модули в стиле MONOLITH v3.0
- Данные из существующих таблиц где возможно
- Новые таблицы — с RLS
- Тап-зоны 56px+, viewport 390px
