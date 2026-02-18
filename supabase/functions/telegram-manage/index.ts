import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action } = await req.json();

    if (action === "set_webhook" || action === "set_webhook_to_bot") {
      const target = action === "set_webhook_to_bot" ? "telegram-bot" : "telegram-bot-webhook";
      const webhookUrl = `${SUPABASE_URL}/functions/v1/${target}`;
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "set_menu") {
      // Set bot commands
      const commandsRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commands: [
            { command: "tasks", description: "📋 Мои задачи" },
            { command: "myid", description: "🆔 Мой Chat ID" },
            { command: "help", description: "❓ Справка" },
          ],
        }),
      });
      const cmdData = await commandsRes.json();
      return new Response(JSON.stringify(cmdData), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "get_webhook") {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "get_me") {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
