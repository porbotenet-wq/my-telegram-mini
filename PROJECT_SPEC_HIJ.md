## H) RELIABILITY & SECURITY

### H.1) Threat Model

| Угроза | Вероятность | Импакт | Митигация |
|---|---|---|---|
| Подделка initData WebApp | Высокая | Критический | HMAC-SHA256 валидация на сервере, проверка hash, auth_date freshness (<5 мин) |
| Replay attack (повтор запросов) | Средняя | Высокий | Idempotency key + дедупликация в Redis (TTL 24h) |
| Privilege escalation (RBAC bypass) | Средняя | Критический | Middleware проверка роли на каждом endpoint, unit-тесты RBAC |
| SQL Injection | Низкая | Критический | Parameterized queries (ORM), input validation (class-validator) |
| XSS в Mini App | Средняя | Высокий | CSP headers, sanitize user input, React auto-escaping |
| DDoS / abuse | Средняя | Высокий | Rate limiting per user (Redis), Cloudflare/nginx throttling |
| Data leak через AuditLog | Низкая | Высокий | RBAC на /audit-log (только CEO/Director), маскировка PII |
| File upload malware | Средняя | Средний | Ограничение типов (image/*, pdf), макс размер 10MB, антивирус scan |
| Session hijacking | Низкая | Критический | JWT short-lived (15 мин), refresh token rotation, secure cookie |
| Insider threat (субподрядчик) | Средняя | Средний | Минимальные права, audit trail, data isolation по проектам |

### H.2) Security Checklist

- [x] HTTPS everywhere (TLS 1.2+)
- [x] WebApp initData HMAC валидация
- [x] JWT с коротким TTL (15 мин) + refresh token
- [x] RBAC middleware на всех endpoints
- [x] Input validation (class-validator, whitelist: true)
- [x] Parameterized queries (ORM)
- [x] Rate limiting: 100 req/min per user, 10 req/min для auth
- [x] CSP, X-Frame-Options, X-Content-Type-Options headers
- [x] File upload: whitelist mime types, size limit
- [x] Secrets в env vars / Vault, не в коде
- [x] npm audit в CI pipeline
- [x] AuditLog immutable (no UPDATE/DELETE grants)
- [x] CORS: только домен Mini App
- [x] Structured logging без PII в plain text

### H.3) Auth/Session Model

```
1. User opens Bot → /start → registers (telegram_id → User)
2. User opens Mini App → WebApp sends initData
3. Backend validates initData (HMAC-SHA256 with bot token)
4. Backend checks auth_date freshness (<300 sec)
5. Backend issues JWT (15 min) + Refresh Token (7 days)
6. Mini App stores JWT in memory (not localStorage)
7. Every API call: Authorization: Bearer {jwt}
8. On 401: auto-refresh via refresh token
9. Refresh token rotation: old token invalidated on use
10. Bot API calls: validated via telegram_id from update object
```

### H.4) Idempotency

```
Client → POST /api/v1/daily-logs
         Header: X-Idempotency-Key: {client-generated-uuid}

Server:
1. Check Redis: key exists?
   → Yes: return cached response (200)
   → No: proceed
2. Execute operation
3. Store response in Redis (TTL 24h)
4. Return response (201)
```

### H.5) Rate Limits

| Endpoint group | Limit | Window |
|---|---|---|
| /auth/* | 10 req | 1 min |
| /api/v1/* (read) | 100 req | 1 min |
| /api/v1/* (write) | 30 req | 1 min |
| /attachments (upload) | 10 req | 1 min |
| Bot webhook | 30 updates | 1 sec (Telegram limit) |

### H.6) Backups & Recovery

- PostgreSQL: pg_dump ежедневно, retention 30 дней
- Point-in-time recovery через WAL archiving
- S3 файлы: versioning enabled, lifecycle 90 дней
- Redis: AOF persistence, но данные восстановимы из PostgreSQL
- RTO: 1 час, RPO: 1 час

---

## I) DELIVERY PLAN

### I.1) MVP (Недели 1–3)

**Scope:**
- Bot: /start, регистрация, выбор проекта, создание дневного отчёта (FSM), просмотр
- Mini App: авторизация, /dashboard (базовый), /reports (таблица), /report/new (форма)
- Backend: Auth, Projects CRUD, DailyLogs CRUD, базовый RBAC (3 роли: admin, pm, foreman)
- DB: User, Project, ProjectMember, Zone, DailyLog, AuditLog
- Infra: Docker Compose, CI (lint+test+build), staging deploy

**Роли в MVP:** CEO (admin), PM, Прораб
**Не входит в MVP:** материалы, субподрядчики, аналитика, геолокация

### I.2) V1 (Недели 4–6)

**Scope:**
- Bot: согласования (approve/reject), замечания, уведомления
- Mini App: /approvals, /issues, /issue/new, фильтры, загрузка фото
- Backend: Approvals workflow (multi-level), Issues CRUD, Attachments (S3), push notifications
- DB: Issue, Approval, Attachment, MaterialRequest
- RBAC: все 7 ролей
- Infra: Sentry, structured logging, health checks

### I.3) V2 (Недели 7–10)

**Scope:**
- Mini App: /analytics (графики, тренды), /workforce, /materials, экспорт в Excel
- Backend: Analytics endpoints, workforce tracking, material requests workflow
- Интеграции: Google Sheets import, webhooks для внешних систем
- Infra: OpenTelemetry traces, Prometheus metrics, alerting, blue/green deploy
- Оптимизация: CQRS read models для дашбордов, Redis caching

### I.4) Риски и митигация

| Риск | Вероятность | Митигация |
|---|---|---|
| Telegram API rate limits | Средняя | Queue (BullMQ), exponential backoff |
| Сложность FSM бота | Высокая | Начать с 3 экранов, итеративно расширять |
| UX не подходит прорабам | Высокая | User testing на MVP, итерации |
| Масштабирование БД | Низкая (на MVP) | Индексы с первого дня, partitioning AuditLog |
| Scope creep | Высокая | Строгий MVP scope, backlog приоритизация |

---

## J) MINIMUM QUESTIONS (БЛОКИРУЮЩИЕ ВОПРОСЫ)

1. **Роли и оргструктура:** Подтверди список ролей. Есть ли дополнительные роли кроме CEO, Director, PM, ПТО, Прораб, Снабжение, Субподрядчик?

2. **Цепочка согласований:** Верна ли цепочка Прораб → PM → Director → CEO? Или есть другие маршруты для разных типов согласований?

3. **Данные из Google Sheets:** Есть ли существующие таблицы, которые нужно импортировать? Если да — пришли структуру (колонки, примеры данных).

4. **Хостинг:** Есть предпочтения по хостингу? (VPS, AWS, DigitalOcean, свой сервер)

5. **Количество пользователей:** Ожидаемое количество пользователей на старте и через 6 месяцев? (влияет на архитектуру)

6. **Язык Mini App:** Только русский, или нужна мультиязычность (en/cz/ru)?

7. **Существующие системы:** Есть ли интеграции с другими системами (1С, ERP, CRM), которые нужно учесть?
