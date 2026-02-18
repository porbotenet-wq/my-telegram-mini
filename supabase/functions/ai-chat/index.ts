import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
