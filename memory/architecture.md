# Architecture — STSphera TMA

## Stack
- Frontend: Vite + React 18 + TypeScript + Tailwind CSS + shadcn-ui
- Backend: Supabase (PostgreSQL + Edge Functions on Deno)
- Bot: Telegram Bot API (webhook → Edge Function)
- AI: Anthropic Claude (analyze-document), Google Gemini (parse-project-document)
- Integrations: 1C (REST), Google Sheets (Service Account)

## Database Tables (17+)
profiles, projects, facades, floors, work_types, plan_fact, crews,
materials, shipments, alerts, documents, sync_config, user_roles,
bot_sessions, bot_inbox, bot_documents, bot_event_queue, bot_audit_log,
approvals, daily_logs, ecosystem_tasks

## Edge Functions (12)
| Function | Auth | Purpose |
|---|---|---|
| telegram-bot | webhook (no auth) | Main bot handler |
| ai-chat | ✅ authMiddleware | AI assistant API |
| bot-notify | ❌ | Send notifications from queue |
| bot-notify-worker | ❌ (BROKEN) | Same as bot-notify (duplicate) |
| bot-scheduler | ❌ | Cron: daily summary, reminders |
| bot-whitelabel | ❌ | Multi-tenant bot config |
| telegram-notify | ❌ | Direct TG notifications |
| telegram-scheduler | ❌ (DUPLICATE) | Same as bot-scheduler |
| telegram-manage | ❌ | Webhook management |
| sync-1c | ❌ | 1C data sync |
| google-sheets-sync | ❌ | Google Sheets sync |
| analyze-document | ❌ | Claude document analysis |
| parse-project-document | ❌ | Gemini document parsing |

## Bot Architecture
- Single file: telegram-bot/index.ts (~900 lines)
- Shared modules exist but underused: botFSM.ts, botScreens.ts, botUtils.ts
- Session: bot_sessions table, TTL 2h (should be 8h)
- FSM states: IDLE, DOC_UPLOAD, DOC_COMMENT, DOC_CONFIRM, PHOTO_*, REPORT_*, ALERT_*, LOG_*
- Role routing: detectPrimaryRole() → role-specific menu

## Frontend Components
- AuthScreen, Dashboard, DirectorDashboard, ProjectList, ProjectCard
- PMDashboard, ForemanDashboard, SupplyDashboard, PTODashboard, InspectorDashboard
- DashboardRouter (lazy loading, role-based routing via detectPrimaryRole)
- Approvals, DailyLogs, GPR, Crew, SupplyDashboard
- AIAssistant, ForemenAI, TelegramChats
- ReportPDF, ProfileSettings, ProjectCalendar
- OfflineBar, InstallPWA, ErrorBoundary
- RiskCards, QuickActions, SyncPanel (MONOLITH components, opus/monolith-components branch)

## Shared Lib
- src/lib/detectPrimaryRole.ts — role priority + isForeman helper

## New Tables (2026-02-20)
- notifications_config — per-user notification settings (DND hours, toggles)
- stage_acceptance — facade stage acceptance workflow (foreman → inspector → PTO)
