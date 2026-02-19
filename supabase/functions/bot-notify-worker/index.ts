// supabase/functions/bot-notify-worker/index.ts
// ═══════════════════════════════════════════════════════════════
// Воркер очереди уведомлений — запускать cron каждую минуту
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SB_URL    = Deno.env.get("SUPABASE_URL")!;
const SB_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db        = createClient(SB_URL, SB_KEY);
const TG        = `https://api.telegram.org/bot${BOT_TOKEN}`;

const PRIORITY_EMOJI: Record<string, string> = {
  critical: "🔴", high: "🟠", normal: "🟡", low: "⚪",
};

// DO NOT DISTURB: 23:00 – 07:00 (UTC+3 = 20:00 – 04:00 UTC)
function isDND(prefs: Record<string, unknown> | null): boolean {
  if (!prefs) return false;
  const now  = new Date();
  const hour = now.getUTCHours() + 3;
  const h    = ((hour % 24) + 24) % 24;
  const from = parseInt(String(prefs.do_not_disturb_from || "23:00").split(":")[0]);
  const to   = parseInt(String(prefs.do_not_disturb_to   || "07:00").split(":")[0]);
  if (from > to) return h >= from || h < to;
  return h >= from && h < to;
}

// ── Форматирование сообщений по типу события ─────────────────
function formatMessage(eventType: string, payload: Record<string, unknown>): string {
  switch (eventType) {
    case "alert.created":
      return `${PRIORITY_EMOJI[String(payload.priority)] || "⚠️"} <b>Новый алерт</b>\n` +
             `«${payload.title}»\n` +
             `Объект: ${payload.project_name || ""}\n` +
             `Создал: ${payload.created_by || ""}`;

    case "alert.overdue":
      return `🔴 <b>Просроченный алерт</b>\n` +
             `«${payload.title}»\n` +
             `Просрочен на ${payload.days_overdue} дн.\n` +
             `Объект: ${payload.project_name || ""}`;

    case "report.missing":
      return `📋 <b>Ежедневный отчёт</b>\n` +
             `Отчёт за сегодня не отправлен.\n` +
             `Объект: ${payload.project_name || ""}\n` +
             `Отправьте через бот: /report`;

    case "supply.deficit":
      return `📦 <b>Дефицит материалов</b>\n` +
             `${payload.count} позиций в дефиците\n` +
             `Объект: ${payload.project_name || ""}`;

    case "stage.overdue":
      return `⚠️ <b>Просрочка этапа</b>\n` +
             `«${payload.stage_name}»\n` +
             `Дедлайн: ${payload.deadline}\n` +
             `Объект: ${payload.project_name || ""}`;

    case "xp.level_up":
      return `🏆 <b>Новый уровень!</b>\n` +
             `Вы достигли уровня ${payload.level}: ${payload.level_name}\n` +
             `XP: ${payload.total_xp}`;

    case "project.summary":
      return `📊 <b>Еженедельная сводка</b>\n` +
             `${payload.project_name}\n` +
             `Прогресс: ${payload.progress}%\n` +
             `Алертов: ${payload.open_alerts}\n` +
             `До сдачи: ${payload.days_left} дн.`;

    default:
      return `📌 <b>STSphera</b>\n${payload.message || "Новое уведомление"}`;
  }
}

async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  const res = await fetch(`${TG}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const json = await res.json();
  return json.ok;
}

// Разрешаем target_roles / target_users в список chat_id + prefs
interface Target { chat_id: string; prefs: Record<string, unknown> | null }

async function resolveTargets(
  targetRoles: string[],
  targetUsers: string[],
): Promise<Target[]> {
  if (targetUsers.length > 0) {
    const { data } = await db
      .from("profiles")
      .select("telegram_chat_id, notification_preferences")
      .in("telegram_chat_id", targetUsers)
      .not("telegram_chat_id", "is", null);
    return (data || []).map((p: Record<string, unknown>) => ({
      chat_id: String(p.telegram_chat_id),
      prefs:   p.notification_preferences as Record<string, unknown> | null,
    }));
  }

  if (targetRoles.length > 0) {
    const { data } = await db
      .from("user_roles")
      .select("user_id, role, profiles(telegram_chat_id, notification_preferences)")
      .in("role", targetRoles);

    return (data || [])
      .filter((r: Record<string, unknown>) => {
        const prof = r.profiles as Record<string, unknown> | null;
        return prof?.telegram_chat_id;
      })
      .map((r: Record<string, unknown>) => {
        const prof = r.profiles as Record<string, unknown>;
        return {
          chat_id: String(prof.telegram_chat_id),
          prefs:   prof.notification_preferences as Record<string, unknown> | null,
        };
      });
  }

  return [];
}

// ── Main handler ─────────────────────────────────────────────
Deno.serve(async () => {
  const now = new Date().toISOString();

  // Берём до 50 pending событий за раз
  const { data: events, error } = await db
    .from("bot_event_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", now)
    .lt("retry_count", 3)
    .order("priority", { ascending: false })
    .order("scheduled_at", { ascending: true })
    .limit(50);

  if (error || !events?.length) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let sent = 0, failed = 0, skipped = 0;

  for (const event of events) {
    // Mark as in-progress
    await db.from("bot_event_queue")
      .update({ status: "sent" })
      .eq("id", event.id);

    const targets = await resolveTargets(
      event.target_roles || [],
      event.target_users || [],
    );

    if (targets.length === 0) {
      await db.from("bot_event_queue").update({ status: "skipped" }).eq("id", event.id);
      skipped++;
      continue;
    }

    // Enrich payload with project_name
    let payload = event.payload || {};
    if (event.project_id && !payload.project_name) {
      const { data: proj } = await db
        .from("projects")
        .select("name")
        .eq("id", event.project_id)
        .maybeSingle();
      if (proj) payload = { ...payload, project_name: proj.name };
    }

    const message = formatMessage(event.event_type, payload);
    let allSent = true;

    for (const target of targets) {
      // DND check — skip for critical priority
      if (event.priority !== "critical" && isDND(target.prefs)) {
        const tomorrow7 = new Date();
        tomorrow7.setUTCHours(4, 1, 0, 0); // 07:01 MSK = 04:01 UTC
        if (tomorrow7 < new Date()) tomorrow7.setDate(tomorrow7.getDate() + 1);

        await db.from("bot_event_queue").update({
          status:       "pending",
          scheduled_at: tomorrow7.toISOString(),
        }).eq("id", event.id);
        skipped++;
        allSent = false;
        break;
      }

      // Rate limit: ~28 msg/sec
      await new Promise(r => setTimeout(r, 35));

      const ok = await sendTelegramMessage(target.chat_id, message);
      if (!ok) allSent = false;
    }

    if (allSent) {
      await db.from("bot_event_queue").update({
        status:  "sent",
        sent_at: new Date().toISOString(),
      }).eq("id", event.id);
      sent++;
    } else {
      await db.from("bot_event_queue").update({
        status:       "pending",
        retry_count:  (event.retry_count || 0) + 1,
        scheduled_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      }).eq("id", event.id);
      failed++;
    }
  }

  // Cleanup sent/skipped events older than 7 days
  await db.from("bot_event_queue")
    .delete()
    .in("status", ["sent", "skipped"])
    .lt("sent_at", new Date(Date.now() - 7 * 86400000).toISOString());

  // Refresh materialized view
  await db.rpc("refresh_portfolio_stats").then(() => {});

  // Cleanup expired sessions
  await db.rpc("cleanup_expired_bot_sessions").then(() => {});

  return new Response(JSON.stringify({ processed: events.length, sent, failed, skipped }), {
    headers: { "Content-Type": "application/json" },
  });
});
