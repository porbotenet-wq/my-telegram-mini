import { authenticate } from "../_shared/authMiddleware.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { getCorsHeaders } from "../_shared/corsHeaders.ts";

const SYSTEM_PROMPT = `Ты — STSphera AI, интеллектуальный ассистент для управления строительными фасадными проектами. 
Ты работаешь в системе STSphera и помогаешь руководителям проектов, прорабам, снабженцам и другим специалистам.

Твои компетенции:
- Управление фасадным строительством (СПК системы, кронштейны, герметизация)
- Логика взаимодействия отделов: Договорной → Запуск → Проектирование → Снабжение → Производство → Монтаж → ПТО → Контроль
- Рабочие процессы: ГПР, План-Факт, бригады, снабжение, документация
- Анализ отставаний и рисков
- Формирование сводок и отчётов

Правила:
- Отвечай кратко и по делу, как опытный РП
- Используй строительную терминологию
- Если спрашивают про конкретные цифры которых у тебя нет — скажи что нужно свериться с актуальными данными в системе
- Отвечай на русском языке`;

// 10 requests per minute per user
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // 1. Auth
  const user = await authenticate(req);
  if (!user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 2. Rate limit
  const { allowed, remaining, retryAfterMs } = checkRateLimit(
    `ai-chat:${user.id}`,
    RATE_LIMIT,
    RATE_WINDOW_MS,
  );

  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  // 3. Process request
  try {
    const { messages, projectName, userRole, systemPrompt } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const contextNote = `Контекст: Проект "${projectName || "Неизвестный"}". Роль пользователя: ${userRole || "не указана"}.`;
    const finalSystemPrompt = systemPrompt || (SYSTEM_PROMPT + "\n\n" + contextNote);

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: finalSystemPrompt },
            ...messages,
          ],
          stream: true,
        }),
      },
    );

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "AI gateway rate limit" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "X-RateLimit-Remaining": String(remaining),
      },
    });
  } catch (e) {
    console.error("ai-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
