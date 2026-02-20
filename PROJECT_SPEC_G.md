## G) API CONTRACT (HIGH LEVEL)

**Auth:** Telegram WebApp initData → HMAC-SHA256 валидация → JWT session token.
**Base URL:** `/api/v1`
**Headers:** `Authorization: Bearer {jwt}`, `X-Idempotency-Key: {uuid}` (для POST/PUT)
**Format:** JSON. Pagination: `?page=1&limit=20`. Sorting: `?sort=created_at&order=desc`.

---

### G.1) Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | /auth/telegram | Валидация initData, выдача JWT |
| POST | /auth/refresh | Обновление JWT |
| GET | /auth/me | Текущий пользователь + роль |

**POST /auth/telegram**
```json
// Request
{ "initData": "query_string_from_webapp" }

// Response 200
{
  "token": "jwt...",
  "refreshToken": "...",
  "user": { "id": "uuid", "name": "...", "role": "pm" }
}
```

---

### G.2) Projects

| Method | Endpoint | Description | Roles |
|---|---|---|---|
| GET | /projects | Список проектов (фильтр по роли) | All |
| GET | /projects/:id | Детали проекта | Members |
| POST | /projects | Создать проект | Director+ |
| PUT | /projects/:id | Обновить проект | PM+ |
| GET | /projects/:id/zones | Зоны проекта | Members |
| POST | /projects/:id/zones | Создать зону | PM+ |
| GET | /projects/:id/members | Участники | Members |
| POST | /projects/:id/members | Добавить участника | PM+ |

---

### G.3) Daily Logs

| Method | Endpoint | Description | Roles |
|---|---|---|---|
| GET | /projects/:id/daily-logs | Список отчётов (фильтры: date, zone, status) | PM, ПТО, Director+ |
| POST | /projects/:id/daily-logs | Создать отчёт | Foreman, PM |
| GET | /daily-logs/:id | Детали отчёта | Members |
| PUT | /daily-logs/:id | Обновить (только draft) | Author |
| POST | /daily-logs/:id/submit | Отправить на проверку | Author |

**POST /projects/:id/daily-logs**
```json
// Request
{
  "zone_id": "uuid",
  "date": "2025-01-15",
  "works_description": "Бетонирование плиты 3 этажа",
  "volume": "45 м³",
  "workers_count": 12,
  "issues_description": "Задержка поставки арматуры",
  "weather": "Ясно, -5°C"
}

// Response 201
{
  "id": "uuid",
  "status": "draft",
  "created_at": "2025-01-15T08:30:00Z"
}
```

---

### G.4) Issues

| Method | Endpoint | Description | Roles |
|---|---|---|---|
| GET | /projects/:id/issues | Список замечаний (фильтры: severity, status) | All members |
| POST | /projects/:id/issues | Создать замечание | Foreman, PM, ПТО |
| GET | /issues/:id | Детали | Members |
| PUT | /issues/:id | Обновить | Author, Assigned |
| PUT | /issues/:id/status | Сменить статус | Assigned, PM+ |

---

### G.5) Approvals

| Method | Endpoint | Description | Roles |
|---|---|---|---|
| GET | /approvals | Мои согласования (фильтр: status, type) | All |
| GET | /approvals/:id | Детали | Participants |
| POST | /approvals/:id/decide | Согласовать/отклонить | Assigned approver |

**POST /approvals/:id/decide**
```json
// Request
{
  "decision": "approved",
  "comment": "Принято. Приступайте."
}

// Response 200
{
  "id": "uuid",
  "status": "approved",
  "decided_at": "2025-01-15T10:00:00Z",
  "next_level": null
}
```

---

### G.6) Materials

| Method | Endpoint | Description | Roles |
|---|---|---|---|
| GET | /projects/:id/material-requests | Список заявок | PM, Procurement, Foreman |
| POST | /projects/:id/material-requests | Создать заявку | Foreman, PM |
| PUT | /material-requests/:id/status | Обновить статус | Procurement |

---

### G.7) Workforce

| Method | Endpoint | Description | Roles |
|---|---|---|---|
| GET | /projects/:id/workforce | Присутствие за период | PM, Foreman |
| POST | /projects/:id/workforce/checkin | Отметка присутствия | Foreman |

---

### G.8) Attachments

| Method | Endpoint | Description | Roles |
|---|---|---|---|
| POST | /attachments | Upload файла (multipart) | All |
| GET | /attachments/:id | Download / presigned URL | Members |
| DELETE | /attachments/:id | Удалить (только автор, до submit) | Author |

---

### G.9) Analytics

| Method | Endpoint | Description | Roles |
|---|---|---|---|
| GET | /analytics/dashboard | KPI сводка | PM+ |
| GET | /analytics/projects/:id/progress | Прогресс проекта | PM+ |
| GET | /analytics/projects/:id/workforce | Статистика персонала | PM+ |
| GET | /analytics/projects/:id/issues | Статистика замечаний | PM+ |

---

### G.10) Audit

| Method | Endpoint | Description | Roles |
|---|---|---|---|
| GET | /audit-log | Лог действий (фильтры: entity, actor, date) | CEO, Director |

---

### G.11) Webhook (Bot → Backend)

| Event | Payload | Action |
|---|---|---|
| telegram_update | Telegram Update object | FSM routing |
| webapp_data | WebApp data string | Parse + validate |

**Error format (все endpoints):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Поле works_description обязательно",
    "details": [{ "field": "works_description", "rule": "required" }]
  }
}
```

**HTTP коды:** 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict (idempotency), 429 Too Many Requests, 500 Internal Error.
