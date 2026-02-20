# PENSIEVE.md — Stateful Memory System для проекта СФЕРА

## Концепция

Pensieve Paradigm — подход для управления контекстом через структурированную внешнюю память.
Предотвращает потерю контекста при длинных сессиях, переключениях и рестартах.

## Структура памяти

```
memory/
├── project-state.md      # Текущее состояние проекта (обновляется после каждого изменения)
├── architecture.md       # Архитектура: стек, структура, зависимости
├── bugs-tracker.md       # Известные баги и их статус
├── decisions-log.md      # Принятые решения (почему сделали X, а не Y)
├── YYYY-MM-DD.md         # Дневные логи (уже есть)
└── pensieve-index.md     # Индекс всех нот с ID и описанием
```

## Workflow

### При старте сессии:
1. `searchMemory("project state СФЕРА")` → загрузить project-state.md
2. `readNote(architecture)` → понять текущую структуру
3. `readNote(bugs-tracker)` → знать открытые проблемы
4. `readNote(today's log)` → контекст дня

### При работе:
1. Перед каждым действием: `searchMemory(текущая задача)`
2. После каждого изменения: `updateNote(project-state, новое состояние)`
3. При принятии решения: `writeNote(decisions-log, решение + причина)`
4. При нахождении бага: `writeNote(bugs-tracker, описание)`

### При переполнении контекста:
1. Приоритизировать: project-state > architecture > bugs > decisions
2. Удалить устаревшие дневные логи (>7 дней)
3. Сжать decisions-log: оставить только актуальные

## System Prompt для Claude (Lovable / API)

```
You are a stateful coding agent for STSphera — construction ERP Telegram Mini App.
You use Pensieve memory system to maintain context across sessions.

PROJECT CONTEXT:
- Stack: Vite + React + TypeScript + Tailwind + shadcn-ui
- Backend: Supabase Edge Functions (Deno) + PostgreSQL
- Integrations: Telegram Bot, 1C, Google Sheets, Anthropic AI
- Repo: github.com/porbotenet-wq/my-telegram-mini
- Supabase project: jdnqaxldwyembanatnqd
- Mini App: https://smr-sfera.lovable.app

ARCHITECTURE:
- 10 ролей: Director, PM, OPR, KM, KMD, Supply, Production, Foreman(x3), PTO, Inspector
- Bot: webhook-based, FSM sessions, role-based menus
- Frontend: PWA with offline support
- DB: 17+ tables with RLS enabled

KNOWN ISSUES (from audit 2026-02-20):
- 9/12 Edge Functions have no auth middleware
- bot-notify-worker uses wrong column names (retry_count→attempts)
- Duplicate functions: bot-notify/bot-notify-worker, telegram-scheduler/bot-scheduler
- Migration conflicts: duplicate CREATE TABLE, triple RLS policies
- Missing indexes on frequently queried columns
- In-memory rate limiter doesn't work in stateless Edge Functions
- Foreman inbox bug: searches "foreman" instead of "foreman1/2/3"

VISUAL STYLE:
- Direction: High-End / Architectural Cinema
- Palette: Dark concrete, graphite, metal, matte glass, LED accents
- UX: Large tap zones (56px+), absolute contrast, instant status reading
- Context: Used on construction sites — cold, rush, poor lighting

RULES:
1. Before ANY code change: check current state of the file
2. After ANY change: document what changed and why
3. Never break existing functionality — always check dependencies
4. Use строительную терминологию in Russian UI
5. All API calls must have auth middleware
6. All new tables must have RLS policies
7. Test on mobile viewport (390x844)
```

## Промпт для Lovable (копировать в начало сессии)

```
Контекст проекта STSphera — ERP для управления стройкой.
Стек: Vite + React + TS + Tailwind + shadcn-ui + Supabase.
10 ролей, Telegram Bot + Mini App.

Текущие приоритеты:
1. Стабилизация: auth на все Edge Functions, фикс багов
2. Рефакторинг: разнести монолитный бот на модули
3. Визуал: Architectural Cinema стиль
4. Функционал: AI-ассистент, push, 1С интеграция

Правила:
- Не ломай существующий функционал
- Все Edge Functions должны проверять auth
- Новые таблицы — с RLS
- UI: крупные тап-зоны, тёмная тема, контрастность
- Строительная терминология на русском
```
