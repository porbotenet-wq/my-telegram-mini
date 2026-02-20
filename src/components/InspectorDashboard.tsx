// src/components/InspectorDashboard.tsx
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle, ClipboardCheck, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

interface Props { projectId: string; }

const InspectorDashboard = ({ projectId }: Props) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [openAlerts, setOpenAlerts] = useState<any[]>([]);
  const [stageMatrix, setStageMatrix] = useState<any[]>([]);
  const [inspections, setInspections] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [alertsRes, stagesRes, docsRes] = await Promise.all([
          supabase.from("alerts")
            .select("id, title, priority, created_at")
            .eq("project_id", projectId)
            .eq("is_resolved", false)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase.from("stage_acceptance")
            .select("*")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase.from("bot_documents")
            .select("id, doc_type, comment, created_at")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false })
            .limit(10),
        ]);

        setOpenAlerts(alertsRes.data || []);
        setStageMatrix(stagesRes.data || []);
        setInspections(docsRes.data || []);
      } catch (e) {
        console.error("InspectorDashboard error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    not_started: "bg-muted text-muted-foreground",
    ready: "bg-amber-500/15 text-amber-500",
    inspection: "bg-primary/15 text-primary",
    accepted: "bg-emerald-500/15 text-emerald-500",
    rejected: "bg-destructive/15 text-destructive",
  };
  const statusLabels: Record<string, string> = {
    not_started: "Ожидание",
    ready: "Готов",
    inspection: "Проверка",
    accepted: "Принят",
    rejected: "Отклонён",
  };

  return (
    <div className="p-3 space-y-3 animate-fade-in">
      <div className="px-1 pt-2 pb-1 flex items-center justify-between">
        <div className="text-[16px] font-bold text-foreground">🔍 Технадзор</div>
        <button className="flex items-center gap-1 bg-destructive text-destructive-foreground rounded-lg px-3 py-1.5 text-[11px] font-bold hover:opacity-90 transition-opacity">
          <Plus size={14} />
          Замечание
        </button>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <AlertTriangle size={16} className="mx-auto text-destructive mb-1" />
          <div className="text-[20px] font-bold text-foreground">{openAlerts.length}</div>
          <div className="text-[8px] text-muted-foreground">Открытых замечаний</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <ClipboardCheck size={16} className="mx-auto text-primary mb-1" />
          <div className="text-[20px] font-bold text-foreground">{stageMatrix.filter(s => s.status === "accepted").length}</div>
          <div className="text-[8px] text-muted-foreground">Принято этапов</div>
        </div>
      </div>

      {/* Open alerts */}
      {openAlerts.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Открытые замечания</div>
          <div className="space-y-2">
            {openAlerts.map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-[10px]">
                <div className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${a.priority === "critical" ? "bg-destructive" : "bg-amber-500"}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-foreground">{a.title}</span>
                  <div className="text-muted-foreground">{format(new Date(a.created_at), "dd.MM HH:mm")}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stage acceptance matrix */}
      {stageMatrix.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Приёмка этапов</div>
          <div className="space-y-1.5">
            {stageMatrix.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-[10px]">
                <span className="text-foreground">{s.stage}</span>
                <span className={`text-[8px] font-semibold px-2 py-0.5 rounded-full ${statusColors[s.status] || statusColors.not_started}`}>
                  {statusLabels[s.status] || s.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {openAlerts.length === 0 && stageMatrix.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-[11px]">Нет данных</div>
      )}
    </div>
  );
};

export default InspectorDashboard;
