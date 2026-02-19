import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "STSphera_bot";

interface TelegramSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface NotificationPrefs {
  daily_summary: boolean;
  report_reminder: boolean;
  deadline_check: boolean;
  alerts: boolean;
  supply_deficit: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  daily_summary: true,
  report_reminder: true,
  deadline_check: true,
  alerts: true,
  supply_deficit: true,
};

const TelegramSettings = ({ open, onOpenChange }: TelegramSettingsProps) => {
  const { user } = useAuth();
  const [chatId, setChatId] = useState("");
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isLinked, setIsLinked] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setInitialLoading(true);
    supabase
      .from("profiles")
      .select("telegram_chat_id, notification_preferences")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        const cid = data?.telegram_chat_id ?? "";
        setChatId(cid);
        setIsLinked(!!cid);
        if (data?.notification_preferences && typeof data.notification_preferences === "object") {
          setPrefs({ ...DEFAULT_PREFS, ...(data.notification_preferences as Partial<NotificationPrefs>) });
        }
        setInitialLoading(false);
      });
  }, [open, user]);

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        telegram_chat_id: chatId.trim() || null,
        notification_preferences: prefs as any,
      })
      .eq("user_id", user.id);
    setLoading(false);

    if (error) {
      toast.error("Ошибка сохранения");
    } else {
      setIsLinked(!!chatId.trim());
      toast.success("Настройки Telegram сохранены");
      onOpenChange(false);
    }
  };

  const handleUnlink = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({ telegram_chat_id: null })
      .eq("user_id", user.id);
    setLoading(false);
    if (!error) {
      setChatId("");
      setIsLinked(false);
      toast.success("Telegram отвязан");
    }
  };

  const togglePref = (key: keyof NotificationPrefs) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  };

  const PREF_LABELS: Record<keyof NotificationPrefs, { label: string; icon: string }> = {
    daily_summary: { label: "Ежедневная сводка", icon: "📊" },
    report_reminder: { label: "Напоминание об отчёте", icon: "📝" },
    deadline_check: { label: "Дедлайны (48ч)", icon: "⏰" },
    alerts: { label: "Алерты", icon: "🔔" },
    supply_deficit: { label: "Дефицит материалов", icon: "📦" },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            📱 Telegram-уведомления
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Привяжите аккаунт и настройте уведомления
          </DialogDescription>
        </DialogHeader>

        {initialLoading ? (
          <div className="text-xs text-muted-foreground animate-pulse py-4">Загрузка...</div>
        ) : (
          <div className="space-y-4">
            {/* Status */}
            <div className="flex items-center gap-2">
              <Badge variant={isLinked ? "default" : "secondary"} className="text-[10px]">
                {isLinked ? "✅ Подключён" : "⚪ Не подключён"}
              </Badge>
            </div>

            {/* Chat ID */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Telegram Chat ID</label>
              <Input
                placeholder="Например: 123456789"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                className="text-sm font-mono"
              />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Отправьте <span className="font-mono text-primary">/start</span> боту{" "}
                <a
                  href={`https://t.me/${BOT_USERNAME}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-primary underline"
                >
                  @{BOT_USERNAME}
                </a>
                , затем <span className="font-mono text-primary">/myid</span>.
              </p>
            </div>

            {/* Notification Preferences */}
            {isLinked && (
              <div className="space-y-3 pt-2 border-t border-border">
                <label className="text-xs font-medium text-foreground">Уведомления</label>
                {(Object.keys(PREF_LABELS) as (keyof NotificationPrefs)[]).map((key) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs text-foreground">
                      {PREF_LABELS[key].icon} {PREF_LABELS[key].label}
                    </span>
                    <Switch
                      checked={prefs[key]}
                      onCheckedChange={() => togglePref(key)}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={loading} size="sm" className="flex-1">
                {loading ? "Сохранение..." : "Сохранить"}
              </Button>
              {isLinked && (
                <Button onClick={handleUnlink} disabled={loading} size="sm" variant="outline">
                  Отвязать
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TelegramSettings;
