# ТЗ Фаза 3 — Визуал MONOLITH v3.0

> Цель: довести все компоненты Mini App до уровня PROMPT-MONOLITH-v3.md.
> Lovable уже применил часть стиля (CSS tokens, LED utilities, TopBar, Dashboard).
> Ниже — конкретные доработки по компонентам.

---

## Блок 1: TabBar → Bottom Navigation (CRITICAL)

Сейчас TabBar — горизонтальный скролл текстовых кнопок, sticky top.
По MONOLITH он должен быть fixed bottom с иконками.

**Задача:**
- Перенести TabBar вниз: `fixed bottom-0 left-0 right-0 z-50`
- Убрать `sticky top-14` — заменить на `fixed bottom-0`
- Показывать максимум 5 основных вкладок с иконками (Lucide):
  - 📊 Дашборд (`LayoutDashboard`)
  - 🏗️ Этажи (`Building2`)
  - 📋 Задачи (`ClipboardList`)
  - 🔔 Алерты (`Bell`)
  - ⚙️ Ещё (`MoreHorizontal`) — открывает drawer с остальными вкладками
- Иконки: 22px, цвет `text-t3` (active: `text-primary`)
- Лейблы: 9px/600, `text-t3` (active: `text-primary`)
- Фон: `bg-[hsl(var(--bg0)/0.92)] backdrop-blur-[20px]`
- Border top: `border-t border-border`
- Safe area: `pb-[max(8px,env(safe-area-inset-bottom))]`
- Min tap target: 56px width
- Badge на Алертах: `w-4 h-4 rounded-full bg-destructive text-[8px] text-white`
- Active indicator: LED-полоска 2px сверху иконки с glow

**В Index.tsx:**
- Убрать `<div className="h-[70px]" />` — заменить на `pb-[72px]` на контейнере
- Контент должен скроллиться под TabBar

---

## Блок 2: Ролевые дашборды → MONOLITH стиль (HIGH)

PMDashboard, ForemanDashboard, InspectorDashboard, PTODashboard используют
стандартные shadcn классы (`bg-card`, `text-muted-foreground`) вместо MONOLITH tokens.

**Задача для ВСЕХ ролевых дашбордов:**
- Заменить `bg-card` → `bg-bg1`
- Заменить `text-muted-foreground` → `text-t2` или `text-t3`
- Заменить `text-foreground` → `text-t1`
- Заменить `bg-muted` → `bg-bg3`
- Все карточки: `rounded-xl border border-border`
- KPI-числа: `num text-2xl font-bold` + цвет статуса
- Лейблы секций: использовать класс `section-label`
- Progress bars: использовать компонент из Dashboard.tsx (с shimmer на конце)
- Добавить `led-top led-{color}` на карточки со статусом
- Все кнопки: `active:scale-[0.97]` для touch feedback
- Заголовки дашбордов ("Панель прораба", "Панель РП") — убрать emoji из текста,
  вместо этого использовать иконку в контейнере `w-8 h-8 rounded-xl bg-[hsl(var(--green-dim))]`

**CounterCard в PMDashboard:**
- Добавить `led-top` с цветом по значению (red если > 0 для просрочено, green если 0)
- Число: `num text-2xl font-bold`
- Лейбл: `text-[9px] uppercase tracking-[0.15em] text-t3`

**ForemanDashboard:**
- Кнопка "Подать отчёт": min-height 64px, `rounded-xl`, если не подан — `bg-primary shadow-[0_0_12px_hsl(var(--green-glow))]`
- Сетка этажей: использовать Facade Cell стиль из MONOLITH (LED-полоска, num шрифт)

---

## Блок 3: Risk Cards — горизонтальный скролл (HIGH)

Сейчас нет компонента Risk Cards. Нужно добавить на Dashboard.

**Задача:**
- Создать компонент `RiskCards` — горизонтальный скролл карточек
- Данные: из таблицы `alerts` где `is_resolved = false`, сортировка по priority
- Каждая карточка:
  - Ширина: 280px, `snap-x snap-mandatory`
  - `bg-bg1 border border-border rounded-xl p-3.5`
  - LED-полоска сверху: `led-top` + цвет по priority (critical=red, high=amber, medium=blue)
  - Badge: `text-[9px] uppercase px-2 py-0.5 rounded-md` + dim-фон + яркий текст
  - Заголовок: `text-[13px] font-bold text-t1`
  - Описание: `text-[11px] text-t2 line-clamp-2`
  - Meta внизу: иконка + текст `text-[10px] text-t3`
- Разместить между KPI grid и Progress section в Dashboard
- Если нет алертов — не показывать секцию

---

## Блок 4: Quick Actions — сетка 2×2 (MEDIUM)

Нет компонента Quick Actions. Нужно добавить на ролевые дашборды.

**Задача:**
- Создать компонент `QuickActions` — сетка 2×2
- Каждая кнопка:
  - `min-h-[64px] bg-bg1 border border-border rounded-xl p-3`
  - Иконка: `w-10 h-10 rounded-[10px]` + dim-фон цвета иконки
  - Title: `text-[12px] font-bold text-t1`
  - Sub: `text-[9px] text-t3`
  - Touch: `active:scale-[0.97] hover:border-[rgba(255,255,255,0.1)]`
- Действия зависят от роли:
  - Foreman: Фото, Отчёт, Алерт, Прогресс
  - PM: Входящие, Согласования, Алерт, ГПР
  - Director: Портфель, KPI, Критичное, Финансы
  - Supply: Статус, Дефицит, Входящие, Отправить

---

## Блок 5: DirectorDashboard — доводка (MEDIUM)

DirectorDashboard уже самый продвинутый, но нужно:
- Проверить что все карточки используют MONOLITH tokens (bg-bg1, text-t1/t2/t3)
- Карточки проектов: добавить `led-top` с цветом по статусу
- Финансы план/факт: progress bar с shimmer
- Статус прорабов: зелёный dot = отчёт подан, красный = нет
- Критические алерты: `led-top led-red` + glow `shadow-[0_0_8px_hsl(var(--red-glow))]`

---

## Блок 6: Entrance Animations (MEDIUM)

**Задача:**
- Все карточки при появлении: `animate-fade-in` (уже есть в CSS)
- Добавить staggered animation для списков:
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
- Применить `stagger-item` к: KPI cards, Risk cards, Quick Action buttons, списки в дашбордах

---

## Блок 7: Drawer "Ещё" для TabBar (MEDIUM)

Когда пользователь нажимает "Ещё" в bottom TabBar:
- Открывается drawer снизу (`animate-slide-up`)
- Фон: `bg-bg0/95 backdrop-blur-[20px]`
- Список всех остальных вкладок в виде grid 3 колонки
- Каждый item: иконка + лейбл, `min-h-[56px]`, `active:scale-[0.97]`
- Закрытие: тап по overlay или свайп вниз

---

## Порядок выполнения

1. **Блок 1** (TabBar → bottom) — CRITICAL, меняет всю навигацию
2. **Блок 2** (ролевые дашборды → MONOLITH tokens) — HIGH
3. **Блок 3** (Risk Cards) — HIGH
4. **Блок 4** (Quick Actions) — MEDIUM
5. **Блок 5** (DirectorDashboard доводка) — MEDIUM
6. **Блок 6** (Entrance Animations) — MEDIUM
7. **Блок 7** (Drawer "Ещё") — MEDIUM

---

## Важно

- НЕ менять логику данных (Supabase queries, auth, routing)
- НЕ менять структуру файлов (DashboardRouter, Index.tsx routing)
- Только визуальные изменения: классы, стили, новые UI-компоненты
- Все цвета — через CSS custom properties (--bg0, --t1, --green и т.д.)
- Тап-зоны: минимум 56px
- Тестировать на viewport 390px (iPhone 14 Pro)
