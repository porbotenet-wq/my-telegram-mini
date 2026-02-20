

# Фаза 3: Визуал MONOLITH v3.0

Полная визуальная доводка всех компонентов Mini App до дизайн-системы MONOLITH v3.0 (Concrete and Light).

---

## Порядок выполнения

### Блок 1: TabBar -- Bottom Navigation (CRITICAL)

**Файл: `src/components/TabBar.tsx`** -- полная переработка:
- Убрать горизонтальный скролл текстовых кнопок
- Сделать `fixed bottom-0 left-0 right-0 z-50`
- 5 основных вкладок с Lucide-иконками (22px):
  - LayoutDashboard -- "Дашборд" (id: "dash")
  - Building2 -- "Этажи" (id: "floors")
  - ClipboardList -- "Задачи" (id: "logs")
  - Bell -- "Алерты" (id: "alerts") + badge с кол-вом
  - MoreHorizontal -- "Ещё" -- открывает drawer
- Иконки: `text-t3`, active: `text-primary`
- Лейблы: `text-[9px] font-semibold`, `text-t3` / active: `text-primary`
- Фон: `bg-[hsl(var(--bg0)/0.92)] backdrop-blur-[20px]`
- `border-t border-border`
- `pb-[max(8px,env(safe-area-inset-bottom))]`
- Min tap target: 56px width
- Active LED: 2px полоска сверху иконки с `shadow-[0_0_6px_hsl(var(--green-glow))]`
- Принимает новый prop `alertsCount?: number` для badge

**Файл: `src/pages/Index.tsx`**:
- Убрать `<div className="h-[70px]" />` (строка 246)
- Добавить `pb-[72px]` на контейнер контента (строка 225)
- Передавать `alertsCount` в TabBar (fetch из alerts table)
- Обработка "Ещё" -- state `moreDrawerOpen`

### Блок 7: Drawer "Ещё" (MEDIUM) -- реализуется вместе с Блоком 1

**Новый файл: `src/components/MoreDrawer.tsx`**:
- Vaul drawer (уже установлен) снизу
- `bg-bg0/95 backdrop-blur-[20px]`
- Grid 3 колонки всех остальных вкладок (card, pf, crew, sup, gpr, wflow, appr, sheets, docs, cal, settings + extras)
- Каждый item: Lucide иконка + лейбл, `min-h-[56px]`, `active:scale-[0.97]`
- Закрытие: overlay tap или свайп

---

### Блок 2: Ролевые дашборды -- MONOLITH tokens (HIGH)

Замены во всех 4 файлах (`PMDashboard.tsx`, `ForemanDashboard.tsx`, `InspectorDashboard.tsx`, `PTODashboard.tsx`):

Общие замены:
- `bg-card` -- `bg-bg1`
- `text-muted-foreground` -- `text-t2` или `text-t3`
- `text-foreground` -- `text-t1`
- `bg-muted` -- `bg-bg3`
- KPI числа: добавить `num` класс + `text-2xl font-bold`
- Секции: заменить вручную написанные лейблы на `section-label`
- Progress bars: использовать ProgressBar из Dashboard (shimmer на конце)
- Добавить `led-top led-{color}` на карточки со статусом
- Кнопки: `active:scale-[0.97]`
- Заголовки: убрать emoji, заменить на иконку в контейнере `w-8 h-8 rounded-xl bg-[hsl(var(--green-dim))]`

**PMDashboard.tsx**:
- CounterCard: добавить `led-top` (red если value > 0 для "Просрочено", green если 0)
- Числа: `num text-2xl font-bold`
- Лейблы: `text-[9px] uppercase tracking-[0.15em] text-t3`

**ForemanDashboard.tsx**:
- Кнопка "Подать отчёт": если не подан -- `bg-primary shadow-[0_0_12px_hsl(var(--green-glow))]`
- Этажная сетка: LED-полоска + num шрифт
- Progress bar: shimmer variant

**InspectorDashboard.tsx**:
- Карточки статусов: `led-top` по цвету статуса
- Все tokens замена

**PTODashboard.tsx**:
- KPI карточки: `led-top led-green` / `led-amber`
- Все tokens замена

---

### Блок 3: Risk Cards -- горизонтальный скролл (HIGH)

**Новый файл: `src/components/RiskCards.tsx`**:
- Принимает `projectId: string`
- Загружает `alerts` WHERE `is_resolved = false`, ORDER BY `priority`
- Горизонтальный скролл: `overflow-x-auto snap-x snap-mandatory scrollbar-none`
- Каждая карточка 280px:
  - `bg-bg1 border border-border rounded-xl p-3.5`
  - `led-top` + цвет по priority (critical=`led-red`, high=`led-amber`, medium=`led-blue`)
  - Badge: `text-[9px] uppercase px-2 py-0.5 rounded-md` + dim-фон
  - Заголовок: `text-[13px] font-bold text-t1`
  - Описание: `text-[11px] text-t2 line-clamp-2`
  - Meta: иконка + `text-[10px] text-t3`
- Если нет алертов -- не рендерить

**Файл: `src/components/Dashboard.tsx`**:
- Импортировать `RiskCards`
- Разместить между KPI grid и Progress section

---

### Блок 4: Quick Actions -- сетка 2x2 (MEDIUM)

**Новый файл: `src/components/QuickActions.tsx`**:
- Принимает `role: string`, `onAction: (tab: string) => void`
- Grid 2x2 с кнопками, зависящими от роли:
  - Foreman: Фото (Camera), Отчёт (FileText), Алерт (AlertTriangle), Прогресс (TrendingUp)
  - PM: Входящие (Inbox), Согласования (CheckCircle), Алерт (AlertTriangle), ГПР (BarChart3)
  - Director: Портфель (Building2), KPI (TrendingUp), Критичное (AlertTriangle), Финансы (DollarSign)
  - Supply: Статус (Package), Дефицит (AlertTriangle), Входящие (Inbox), Отправить (Send)
- Каждая кнопка:
  - `min-h-[64px] bg-bg1 border border-border rounded-xl p-3`
  - Иконка в контейнере `w-10 h-10 rounded-[10px]` + dim-фон
  - Title: `text-[12px] font-bold text-t1`
  - Sub: `text-[9px] text-t3`
  - `active:scale-[0.97] hover:border-[rgba(255,255,255,0.1)]`

**Интеграция**: добавить в каждый ролевой дашборд после KPI блока

---

### Блок 5: DirectorDashboard -- доводка (MEDIUM)

**Файл: `src/components/DirectorDashboard.tsx`**:
- Замена `bg-card` -- `bg-bg1`, `text-foreground` -- `text-t1`, `text-muted-foreground` -- `text-t2`/`text-t3`
- KPI числа: добавить `num`
- Карточки проектов: добавить `led-top` с цветом по статусу (active=green, paused=amber, draft=blue)
- Финансы: ProgressBar с shimmer
- Прорабы: зелёный/красный dot (`w-2 h-2 rounded-full`)
- Критические алерты: `led-top led-red` + `shadow-[0_0_8px_hsl(var(--red-glow))]`
- Заголовок: убрать emoji, добавить Lucide иконку в dim-контейнере
- Секции: `section-label`

---

### Блок 6: Entrance Animations (MEDIUM)

**Файл: `src/index.css`**:
- Добавить stagger keyframes и классы:
```css
@keyframes stagger-in {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
.stagger-item { animation: stagger-in 0.25s ease forwards; opacity: 0; }
.stagger-item:nth-child(1) { animation-delay: 0ms; }
.stagger-item:nth-child(2) { animation-delay: 50ms; }
.stagger-item:nth-child(3) { animation-delay: 100ms; }
.stagger-item:nth-child(4) { animation-delay: 150ms; }
.stagger-item:nth-child(5) { animation-delay: 200ms; }
.stagger-item:nth-child(6) { animation-delay: 250ms; }
```

**Применить `stagger-item`**:
- KPI cards в Dashboard, PMDashboard, DirectorDashboard, PTODashboard
- Risk Cards
- Quick Action buttons
- Списки в дашбордах

---

## Итого файлов

| Действие | Файл |
|---|---|
| Переписать | `src/components/TabBar.tsx` |
| Создать | `src/components/MoreDrawer.tsx` |
| Создать | `src/components/RiskCards.tsx` |
| Создать | `src/components/QuickActions.tsx` |
| Редактировать | `src/pages/Index.tsx` |
| Редактировать | `src/components/Dashboard.tsx` |
| Редактировать | `src/components/PMDashboard.tsx` |
| Редактировать | `src/components/ForemanDashboard.tsx` |
| Редактировать | `src/components/InspectorDashboard.tsx` |
| Редактировать | `src/components/PTODashboard.tsx` |
| Редактировать | `src/components/DirectorDashboard.tsx` |
| Редактировать | `src/index.css` |

## Ограничения

- Никаких изменений в логике данных (Supabase queries, auth, routing)
- Не менять структуру маршрутизации в DashboardRouter и Index.tsx
- Только визуальные изменения
- Все цвета через CSS custom properties
- Минимальный тап-таргет: 56px

