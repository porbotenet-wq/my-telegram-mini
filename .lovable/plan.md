

## Plan: Workflow (Processes), Role-Based Access, AI Assistant

This plan adds three major features from the HTML prototype to the React app.

---

### Part 1: Workflow / Processes Tab

A new tab "Processes" showing the department interaction logic from the STSphera workflow.

**What it does:**
- Displays all workflow stages (Contract, Project Launch, Design, Supply, Production, Installation, PTO, Control)
- Filter by stage with color-coded chips
- Each workflow item shows: stage, sub-step, from/to departments, action, deadline, documents, triggers
- Cards styled like the HTML prototype with stage colors

**Implementation:**
- Create `src/data/workflowData.ts` with all 30+ workflow steps from the HTML prototype (the WORKFLOW array)
- Create `src/components/Workflow.tsx` -- a filterable card-based view of all workflow steps grouped by stage
- Add "Processes" tab to `TabBar.tsx` and render it in `Index.tsx`

---

### Part 2: Role-Based Tab Visibility

Users already have roles stored in `user_roles`. The app will use these roles to show/hide tabs.

**What it does:**
- Each role sees only relevant tabs (matching the HTML prototype's ROLES config)
- Director/PM see all tabs
- Foremen see: Dashboard, Floors, Plan-Fact, Crew, Alerts
- Design sees: Dashboard, GPR, Processes, Alerts
- Supply sees: Dashboard, Supply, GPR, Processes, Alerts
- PTO sees: Dashboard, Floors, GPR, Processes, Alerts
- Inspector (TN) sees: Dashboard, Floors, Plan-Fact, Alerts

**Implementation:**
- Create `src/data/roleConfig.ts` mapping each role to allowed tab IDs
- Update `TabBar.tsx` to accept `userRoles` prop and filter visible tabs
- Pass roles from `useAuth()` through `Index.tsx` to `TabBar`
- Default to showing all tabs if user has no role assigned (backward compatible)

---

### Part 3: AI Assistant (STSphera AI)

A floating chat button that opens a full-screen AI chat panel, contextual to the current project.

**What it does:**
- Floating button (bottom-right) with robot icon
- Full-screen chat panel with project context bar
- Quick-action buttons: "Project status", "Delays", "Today's tasks", "Materials", "Summary", "Risks"
- AI responses powered by Lovable AI Gateway (Gemini model, no API key needed)
- Conversation stored in `ai_chat_messages` table (already exists)
- Context includes: project name, user role, current tab

**Implementation:**
- Create `src/components/AIAssistant.tsx` with:
  - Floating action button
  - Full-screen chat panel (header, messages area, quick actions, input)
  - Message sending via edge function
- Create `supabase/functions/ai-chat/index.ts` edge function:
  - Receives message + conversation history + project context
  - Calls Lovable AI Gateway with system prompt about construction project management
  - Returns AI response
- Integrate into `Index.tsx` -- render the FAB on the project screen
- Store messages in `ai_chat_messages` table with project context

---

### Technical Details

**New files:**
1. `src/data/workflowData.ts` -- 30+ workflow step definitions with stage colors
2. `src/data/roleConfig.ts` -- role-to-tabs mapping
3. `src/components/Workflow.tsx` -- workflow/processes tab component
4. `src/components/AIAssistant.tsx` -- floating AI chat component
5. `supabase/functions/ai-chat/index.ts` -- AI chat edge function

**Modified files:**
1. `src/components/TabBar.tsx` -- add "Processes" tab, add role-based filtering
2. `src/pages/Index.tsx` -- add Workflow import/render, add AIAssistant, pass roles to TabBar

**Database changes:**
- Add `project_id` column to `ai_chat_messages` table (currently missing, needed for project context)
- Add `conversation_id` column to `ai_chat_messages` for grouping conversations

**Edge function (ai-chat):**
- Uses Lovable AI Gateway (`https://jdnqaxldwyembanatnqd.supabase.co/functions/v1/ai-chat`)
- System prompt includes construction domain knowledge, STSphera workflow logic
- Sends project data context (name, progress, alerts count) with each request

**No additional API keys needed** -- uses the existing LOVABLE_API_KEY secret for AI Gateway access.

