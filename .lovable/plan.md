

# Telegram Bot v4 -- Full Role-Based Architecture

## Overview

Rewrite the Telegram bot to implement the complete screen architecture from the specification: 10 distinct roles, each with dedicated menus, "Incoming" (inbox) and "Send" screens, FSM document/photo flows, and auto-trigger notifications.

## Current State vs Target

**Current bot (v3)** has 4 role paths: Director, PM, Foreman, Generic. All other roles (supply, production, pto, inspector, project) fall into the generic menu with limited functionality.

**Target bot (v4)** adds dedicated menus for all 10 roles with role-specific actions:
- Director: portfolio, KPI, critical deviations, finance
- PM: inbox/outbox, quick actions, project launch, design docs
- OPR/KM/KMD (project sub-roles): inbox, send documents by type
- Supply: inbox, send reports, purchase status, deficit
- Production: inbox, send reports, load monitoring
- Foreman: inbox, send reports, daily photo, stage photos
- PTO: inbox, send AOSR docs, document registry
- Inspector: inbox, send prescriptions, stage acceptance

## Database Changes

1. **Extend `app_role` enum** -- add `project_opr`, `project_km`, `project_kmd` values (the spec has 3 project sub-roles; current DB has just `project`)
2. **Create `bot_inbox` table** -- stores inter-role messages/documents:
   - `id`, `project_id`, `from_user_id`, `from_role`, `to_roles[]`, `type` (document, request, report, notification), `title`, `description`, `file_url`, `status` (new, read, processed), `created_at`
3. **Create `bot_documents` table** -- tracks sent documents with FSM metadata:
   - `id`, `project_id`, `sender_id`, `doc_type`, `file_url`, `comment`, `recipients`, `status`, `created_at`

## Implementation Plan

### Step 1 -- DB migration
- Add new enum values to `app_role`
- Create `bot_inbox` and `bot_documents` tables with RLS
- Update `roleConfig.ts` to include new sub-roles

### Step 2 -- Refactor role detection in bot
Replace the current simple `isDirector/isPM/isForeman` checks with a comprehensive role resolver:

```text
function detectPrimaryRole(roles: string[]): string
  priority order: director > pm > project_opr > project_km > project_kmd
                  > supply > production > foreman > pto > inspector
```

Each role maps to its dedicated `screen*Menu` function.

### Step 3 -- Add new screen functions

For each role, implement:
- `screen{Role}Menu` -- main hub with dynamic counters (inbox count, tasks, alerts)
- `screen{Role}Inbox` -- list of incoming items from `bot_inbox`
- `screen{Role}Send` -- category picker for outgoing documents/reports

Role-specific additions:
- **Director**: `screenPortfolio`, `screenKPI`, `screenCritical`, `screenFinance`
- **PM**: `screenPMSendLaunch`, `screenPMSendDesign`, `screenPMQuickActions`
- **OPR**: `screenOPRSendSystem`, `screenOPRSendCalc`, `screenOPRSendNodes`, `screenOPRSendFacades`
- **KM**: `screenKMSendDetail`, `screenKMSendSpec`, `screenKMSendVOR`, `screenKMSendTZ`
- **KMD**: `screenKMDSendGeo`, `screenKMDSendBrackets`, `screenKMDSendKMD`, `screenKMDSendGlass`
- **Supply**: `screenSupplyStatus`, `screenSupplyDeficit`, `screenSupplySendShipment`, `screenSupplySendMismatch`, `screenSupplySendTransport`
- **Production**: `screenProdLoad`, `screenProdSendKP`, `screenProdSendAccept`, `screenProdSendWaybill`, `screenProdSendStock`
- **Foreman**: `screenForemanSendTool`, `screenForemanSendDaily`, `screenForemanSendHidden`, `screenForemanSendIssue`, `screenForemanPhotoStage`
- **PTO**: `screenPTORegistry`, `screenPTOSendAOSR` (brackets/frame/glass/schemes)
- **Inspector**: `screenInspAccept`, `screenInspHistory`, `screenInspSendQuality`, `screenInspSendStop`, `screenInspSendPhoto`

### Step 4 -- FSM document upload flow (universal)

Shared FSM chain used by all "send" actions:

```text
SELECT_TYPE -> SELECT_RECIPIENTS -> UPLOAD_FILE -> ADD_COMMENT -> CONFIRM -> SENT
```

States stored in `bot_sessions`. On SENT: insert into `bot_inbox` for recipients + trigger notifications.

### Step 5 -- FSM photo report flow (foreman)

```text
SELECT_FLOOR -> SELECT_FACADE -> UPLOAD_PHOTOS (up to 5) -> ADD_COMMENT -> CONFIRM -> SENT
```

### Step 6 -- Auto-triggers

Add trigger rules to `bot-notify-worker` that fire notifications based on events:
- KMD ready -> notify PM + Production
- Specification issued -> notify Supply + PM  
- Shipment in 24h -> notify Production + PM
- Material mismatch -> notify PM (critical)
- Material deficit -> notify Supply + PM + Director (critical)
- GPR delay > 2 days -> notify PM + Director
- Task overdue -> notify initiator + PM
- Work stop (inspector) -> notify PM + Director + Foreman (critical)
- AOSR signed -> notify PM + Foreman
- Photo report uploaded -> notify PM

### Step 7 -- Callback dispatcher update

Extend the callback routing in `handleUpdate` with new prefixes:
- `opr:*`, `km:*`, `kmd:*` -- project sub-roles
- `sup:*` -- supply
- `prod:*` -- production
- `pto:*` -- PTO
- `insp:*` -- inspector
- `inbox:*` -- universal inbox actions
- `doc:*` -- document upload FSM

### Step 8 -- Update roleConfig.ts

Add `project_opr`, `project_km`, `project_kmd` to the tab permissions map.

## UX Rules (enforced)
- Max 5 buttons per screen (never 4 in one row)
- No double emojis, no CAPS, no trailing dots on buttons
- Every screen includes a Mini App button
- Breadcrumb-style header on each screen
- Status messages auto-remove keyboard after 60 seconds

## File Changes Summary
- `supabase/functions/telegram-bot/index.ts` -- major rewrite (~2000 lines)
- `src/data/roleConfig.ts` -- add new sub-roles
- DB migration -- new enum values + 2 new tables

## Risks and Mitigations
- **File size**: The bot file will be large (~2000+ lines). Could split into a shared module under `_shared/botScreensV4.ts`, but Deno edge functions work best with single-file entry points.
- **Callback data length**: Telegram limits callback_data to 64 bytes. All callback strings stay under this limit using short prefixes.
- **Backward compatibility**: Existing sessions with old states will gracefully fall back to role menus via the session expiry mechanism (2h TTL).

