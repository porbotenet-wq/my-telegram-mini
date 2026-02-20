# Decisions Log — STSphera

## 2026-02-20

### DEC-001: .env убран из git
- **Что:** Удалён .env из tracking, добавлен в .gitignore, создан .env.example
- **Почему:** Supabase ключи были в публичном репо
- **Кто:** Opus (коммит через ghp_ токен)

### DEC-002: Classic token вместо fine-grained
- **Что:** GitHub push работает только через classic token (ghp_)
- **Почему:** Lovable GitHub App блокирует push через fine-grained PAT
- **Решение:** Использовать classic token для push

### DEC-003: План работ — 4 фазы
- **Фаза 1:** Стабилизация (auth, баги, error handling) — Алексей в Lovable
- **Фаза 2:** Рефакторинг бота — Алексей в Lovable
- **Фаза 3:** Визуал Architectural Cinema — Opus
- **Фаза 4:** Функционал (AI, push, 1С, Sheets) — вместе

### DEC-004: Pensieve Paradigm
- **Что:** Внедрена система управления памятью для проекта
- **Почему:** Предотвращение потери контекста между сессиями
- **Структура:** project-state, architecture, bugs-tracker, decisions-log
