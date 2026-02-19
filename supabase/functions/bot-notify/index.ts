// supabase/functions/bot-notify/index.ts
// ═══════════════════════════════════════════════════════════════
// STSphera Bot — воркер уведомлений под реальную схему
// Запуск: каждую минуту (cron */1 * * * *)
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SB_URL    = Deno.env.get("SUPABASE_URL")!;
const SB_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TG        = `https://api.telegram.org/bot${BOT_TOKEN}`;

const db = createClient(SB_URL, SB_KEY);

const SEP = "─".repeat(29);

// ── DO NOT DISTURB: 23:00 – 07:00 MSK ────────────────────────
function isDoNotDisturb(): boolean {
  const hour = new Date(Date.now() + 3 * 3600000).getUTCHours();
  return hour >= 23 || hour < 7;
}

// ── Telegram send ─────────────────────────────────────────────
async function tgSend(chatId: string, text: string, markup?: object): Promise<boolean> {
  const res = await fetch(`${TG}/sendMessage`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id:    chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(markup ? { reply_markup: markup } : {}),
    }),
  });
  const j = await res.json();
  return j.ok;
}

// ── Форматирование сообщений ──────────────────────────────────
function formatEvent(eventType: string, payload: any): string | null {
  switch (eventType) {

    case "report.submitted": {
      const pct = payload.pct || 0;
      const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
      return (
        `📋 <b>Отчёт подан</b>\n${SEP}\n` +
        `👷 ${payload.reporter_name}\n` +
        `🏗️ Фасад: ${payload.facade_name} · Этаж ${payload.floor_number}\n` +
        `+<b>${payload.value}</b> мод. сегодня\n` +
        `${bar} ${pct}% (${payload.total_fact}/${payload.total_plan})`
      );
    }

    case "alert.created": {
      const priorityLabel: Record<string, string> = {
        critical: "🔴 КРИТИЧЕСКИЙ", high: "🟠 ВЫСОКИЙ",
        normal: "🟡 Обычный", low: "⚪ Низкий",
      };
      return (
        `🔔 <b>Новый алерт</b>\n${SEP}\n` +
        `${priorityLabel[payload.priority] || payload.priority}\n` +
        `"${payload.title}"\n` +
        `Создал: ${payload.creator}`
      );
    }

    case "alert.overdue": {
      let text =
        `⚠️ <b>Алерты без внимания</b>\n${SEP}\n` +
        `Объект: ${payload.project_name}\n` +
        `Открытых >24ч: <b>${payload.count}</b>\n\n`;
      for (const a of (payload.list || []).slice(0, 3)) {
        text += `• [${a.priority}] ${a.title} (${a.age_hours}ч)\n`;
      }
      return text;
    }

    case "supply.deficit": {
      let text =
        `📦 <b>Дефицит материалов</b>\n${SEP}\n` +
        `${payload.project_name}\n\n`;
      for (const m of (payload.items || []).slice(0, 4)) {
        text += `• ${m.name}: <b>-${m.deficit} ${m.unit}</b>\n`;
      }
      return text;
    }

    case "report.missing": {
      return (
        `⏰ <b>Нет отчёта за сегодня</b>\n${SEP}\n` +
        `Объект: ${payload.project_name}\n` +
        `📅 ${payload.date}\n\n` +
        `Не забудьте подать дневной отчёт.`
      );
    }

    case "director.digest": {
      const bar = "█".repeat(Math.round((payload.avg_progress || 0) / 10)) +
                  "░".repeat(10 - Math.round((payload.avg_progress || 0) / 10));
      let text =
        `📊 <b>Утренний дайджест</b>\n${SEP}\n` +
        `${bar} Средний прогресс: <b>${payload.avg_progress}%</b>\n\n`;
      if (payload.open_alerts > 0) {
        text += `🔔 Открытых алертов: <b>${payload.open_alerts}</b>\n`;
        if (payload.critical_alerts > 0) text += `🔴 Критичных: <b>${payload.critical_alerts}</b>\n`;
      }
      if (payload.deficit_count > 0) text += `📦 Дефицит: <b>${payload.deficit_count}</b> позиций\n`;
      return text;
    }

    default:
      return null;
  }
}

// ── Получить chat_id пользователей по ролям ──────────────────
async function getChatIdsByRoles(roles: string[], _projectId?: string): Promise<string[]> {
  if (!roles || roles.length === 0) return [];

  const { data } = await db
    .from("user_roles")
    .select("user_id, role")
    .in("role", roles);

  if (!data?.length) return [];

  const userIds = [...new Set(data.map((r: any) => r.user_id))];

  const { data: profiles } = await db
    .from("profiles")
    .select("telegram_chat_id")
    .in("user_id", userIds)
    .not("telegram_chat_id", "is", null);

  return (profiles || [])
    .map((p: any) => p.telegram_chat_id)
    .filter(Boolean);
}

// ── Обработка одного события ──────────────────────────────────
async function processEvent(event: any): Promise<"sent" | "skipped" | "failed"> {
  const isCritical = event.priority === "critical";

  // DO NOT DISTURB — некритичные переносим
  if (!isCritical && isDoNotDisturb()) {
    const nextMorning = new Date();
    nextMorning.setUTCHours(4, 1, 0, 0); // 07:01 МСК
    if (nextMorning <= new Date()) nextMorning.setDate(nextMorning.getDate() + 1);

    await db.from("bot_event_queue").update({
      scheduled_at: nextMorning.toISOString(),
    }).eq("id", event.id);

    return "skipped";
  }

  const message = formatEvent(event.event_type, event.payload);
  if (!message) return "skipped";

  // Получаем список chat_id для отправки
  let chatIds: string[] = [];

  if (event.target_chat_ids?.length) {
    chatIds = event.target_chat_ids;
  } else if (event.target_roles?.length) {
    chatIds = await getChatIdsByRoles(event.target_roles, event.project_id);
  }

  if (chatIds.length === 0) return "skipped";

  let sent = 0;
  for (const chatId of chatIds) {
    const ok = await tgSend(chatId, message);
    if (ok) sent++;
    await new Promise(r => setTimeout(r, 35)); // rate limit
  }

  return sent > 0 ? "sent" : "failed";
}

// ── Основной цикл ─────────────────────────────────────────────
serve(async () => {
  const now = new Date().toISOString();

  // Берём до 20 событий, готовых к отправке
  const { data: events } = await db
    .from("bot_event_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", now)
    .lt("attempts", 3)
    .order("priority", { ascending: false })
    .order("scheduled_at", { ascending: true })
    .limit(20);

  if (!events?.length) {
    return new Response(JSON.stringify({ processed: 0 }));
  }

  let sent = 0, skipped = 0, failed = 0;

  for (const event of events) {
    // Помечаем в обработке
    await db.from("bot_event_queue")
      .update({ attempts: event.attempts + 1 })
      .eq("id", event.id);

    try {
      const result = await processEvent(event);

      await db.from("bot_event_queue").update({
        status:  result === "sent" ? "sent" : result === "skipped" ? "pending" : "failed",
        sent_at: result === "sent" ? now : null,
      }).eq("id", event.id);

      if (result === "sent")    sent++;
      if (result === "skipped") skipped++;
      if (result === "failed")  failed++;

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown";
      await db.from("bot_event_queue").update({
        status: "failed", last_error: msg,
      }).eq("id", event.id);
      failed++;
    }
  }

  // Чистим старые отправленные (>7 дней)
  await db.from("bot_event_queue")
    .delete()
    .in("status", ["sent", "failed"])
    .lt("created_at", new Date(Date.now() - 7 * 86400000).toISOString());

  return new Response(JSON.stringify({ processed: events.length, sent, skipped, failed }));
});
