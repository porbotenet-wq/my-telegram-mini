// src/components/SyncPanel.tsx
// MONOLITH v3.0 — Integration status panel (1С, Google Sheets, Telegram Bot)
// Live-dot indicator + sync status per service
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Package, FileText, Table2, MessageSquare } from "lucide-react";

interface SyncPanelProps {
  projectId: string;
}

interface SyncService {
  id: string;
  name: string;
  Icon: React.ComponentType<any>;
  status: "synced" | "pending" | "error" | "inactive";
  lastSync: string | null;
}

const STATUS_MAP = {
  synced: { label: "Синхр.", cls: "bg-[hsl(var(--green-dim))] text-[hsl(var(--green))]" },
  pending: { label: "Ожидание", cls: "bg-[hsl(var(--amber-dim))] text-[hsl(var(--amber))]" },
  error: { label: "Ошибка", cls: "bg-[hsl(var(--red-dim))] text-[hsl(var(--red))]" },
  inactive: { label: "Не настр.", cls: "bg-bg3 text-t3" },
};

const SyncPanel = ({ projectId }: SyncPanelProps) => {
  const [services, setServices] = useState<SyncService[]>([
    { id: "1c-materials", name: "1С: Материалы", Icon: Package, status: "inactive", lastSync: null },
    { id: "1c-acts", name: "1С: Акты КС-2", Icon: FileText, status: "inactive", lastSync: null },
    { id: "sheets", name: "Google Sheets", Icon: Table2, status: "inactive", lastSync: null },
    { id: "tg-bot", name: "Telegram Bot", Icon: MessageSquare, status: "synced", lastSync: null },
  ]);
  const [now, setNow] = useState("");

  useEffect(() => {
    const n = new Date();
    setNow(n.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) + " UTC");

    // Check sheets sync status
    const checkSheets = async () => {
      const { data } = await supabase
        .from("sheets_sync_log")
        .select("synced_at, status")
        .eq("project_id", projectId)
        .order("synced_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setServices((prev) =>
          prev.map((s) =>
            s.id === "sheets"
              ? { ...s, status: data[0].status === "success" ? "synced" : "error", lastSync: data[0].synced_at }
              : s
          )
        );
      }
    };

    // Check 1C sync
    const check1C = async () => {
      const { data } = await supabase
        .from("sync_1c_log")
        .select("synced_at, status, sync_type")
        .eq("project_id", projectId)
        .order("synced_at", { ascending: false })
        .limit(5);

      if (data && data.length > 0) {
        const materials = data.find((d: any) => d.sync_type === "materials");
        const acts = data.find((d: any) => d.sync_type === "acts");

        setServices((prev) =>
          prev.map((s) => {
            if (s.id === "1c-materials" && materials) {
              return { ...s, status: materials.status === "success" ? "synced" : "error", lastSync: materials.synced_at };
            }
            if (s.id === "1c-acts" && acts) {
              return { ...s, status: acts.status === "success" ? "synced" : "error", lastSync: acts.synced_at };
            }
            return s;
          })
        );
      }
    };

    checkSheets().catch(() => {});
    check1C().catch(() => {});
  }, [projectId]);

  const hasAnySynced = services.some((s) => s.status === "synced");

  return (
    <div className="px-4 mt-5 animate-fade-in">
      <p className="section-label">Обмен данными</p>
      <div className="bg-bg1 border border-border rounded-xl p-3.5">
        {/* Header — live status */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            {hasAnySynced ? (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--green))] shadow-[0_0_6px_hsl(var(--green-glow))] animate-pulse-dot" />
                <span className="text-[11px] font-semibold text-[hsl(var(--green))]">Подключено</span>
              </>
            ) : (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-t3" />
                <span className="text-[11px] font-semibold text-t3">Нет подключений</span>
              </>
            )}
          </div>
          <span className="font-mono text-[9px] text-t3">{now}</span>
        </div>

        {/* Service rows */}
        <div className="space-y-1.5">
          {services.map((s) => {
            const st = STATUS_MAP[s.status];
            return (
              <div
                key={s.id}
                className="flex items-center justify-between bg-bg2 rounded-lg px-2.5 py-2 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <s.Icon className="w-3.5 h-3.5 text-t2" strokeWidth={1.8} />
                  <span className="text-[11px] font-semibold">{s.name}</span>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${st.cls}`}>
                  {st.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SyncPanel;
