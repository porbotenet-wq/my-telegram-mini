# Project State — STSphera TMA

## Последнее обновление: 2026-02-20

## Статус: Активная разработка

### Что сделано:
- [x] Базовая архитектура (Vite + React + Supabase)
- [x] 17+ таблиц в Supabase с RLS
- [x] Telegram Bot v4 — 10 ролей, FSM, документооборот
- [x] Mini App — Dashboard, Projects, Approvals, AI Assistant
- [x] PWA (manifest + service worker)
- [x] Edge Functions: 12 штук
- [x] Безопасность: .env убран из git, .gitignore обновлён

### В работе:
- [ ] Фаза 1: Стабилизация (auth, баги, error handling)
- [ ] Фаза 3: Визуал Architectural Cinema (Opus делает)
- [x] БЛОК 3: Миграции — notifications_config, stage_acceptance, колонки ecosystem_tasks, индексы
- [x] БЛОК 1: Ролевые дашборды — 6 штук + DashboardRouter + detectPrimaryRole
- [ ] БЛОК 2: Авто-напоминания (bot-scheduler) — в работе у Lovable

### Известные проблемы:
- 9/12 Edge Functions без auth (CRITICAL)
- bot-notify-worker: неправильные имена колонок
- Дубли функций: bot-notify/worker, telegram-scheduler/bot-scheduler
- Дубли миграций без IF NOT EXISTS
- Inbox прорабов: ищет "foreman" вместо "foreman1/2/3"
- Rate limiter не работает (in-memory в stateless)
- analyze-document: OOM на больших файлах

### GitHub:
- Repo: github.com/porbotenet-wq/my-telegram-mini
- Push: работает через classic token (ghp_), fine-grained блокируется Lovable App
- Последний коммит Opus: security fix (.env)

### Ключи/Конфиг:
- Supabase project: jdnqaxldwyembanatnqd
- Mini App URL: https://smr-sfera.lovable.app
- Supabase anon key: НУЖНО РОТИРОВАТЬ (утёк в git history)
