// src/components/ForemanDashboard.tsx
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Camera, FileText, CheckCircle2, Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

interface Props { projectId: string; }

const ForemanDashboard = ({ projectId }: Props) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [myFloors, setMyFloors] = useState<any[]>([]);
  const [recentPhotos, setRecentPhotos] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const today = new Date().toISOString().split("T")[0];

        const [logsRes, crewsRes, photosRes] = await Promise.all([
          supabase.from("daily_logs")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId)
            .eq("submitted_by", user.id)
            .eq("date", today),
          supabase.from("crews")
            .select("id, name, facade_id, facades(id, name, floors_count)")
            .eq("project_id", projectId)
            .eq("foreman_user_id", user.id)
            .eq("is_active", true),
          supabase.from("bot_documents")
            .select("id, doc_type, created_at, file_url, comment")
            .eq("sender_id", user.id)
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        setReportSubmitted((logsRes.count || 0) > 0);
        
        // Get floors for assigned facades
        const facadeIds = (crewsRes.data || [])
          .map((c: any) => c.facade_id)
          .filter(Boolean);
        
        if (facadeIds.length > 0) {
          const { data: floorsData } = await supabase
            .from("floors")
            .select("*")
            .in("facade_id", facadeIds)
            .order("floor_number");
          setMyFloors(floorsData || []);
        }

        setRecentPhotos(photosRes.data || []);
      } catch (e) {
        console.error("ForemanDashboard error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId, user]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
        <div className="text-[11px] text-muted-foreground">Загрузка…</div>
      </div>
    );
  }

  const totalPlan = myFloors.reduce((s, f) => s + (f.modules_plan || 0), 0);
  const totalFact = myFloors.reduce((s, f) => s + (f.modules_fact || 0), 0);
  const pct = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;

  return (
    <div className="p-3 space-y-3 animate-fade-in">
      <div className="px-1 pt-2 pb-1">
        <div className="text-[16px] font-bold text-foreground">🏗️ Панель прораба</div>
      </div>

      {/* Report status + CTA */}
      <button
        className={`w-full rounded-xl p-4 text-center transition-all ${
          reportSubmitted
            ? "bg-muted border border-border"
            : "bg-primary text-primary-foreground shadow-lg hover:opacity-90"
        }`}
        style={{ minHeight: 64 }}
        disabled={reportSubmitted}
      >
        {reportSubmitted ? (
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 size={20} className="text-primary" />
            <span className="font-bold text-[14px] text-foreground">Отчёт подан ✓</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <FileText size={20} />
            <span className="font-bold text-[14px]">📋 Подать отчёт</span>
          </div>
        )}
      </button>

      {/* My floors progress */}
      {myFloors.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Мои этажи — {pct}% выполнено
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden mb-3">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {myFloors.slice(0, 12).map((f) => {
              const floorPct = f.modules_plan > 0 ? Math.round((f.modules_fact / f.modules_plan) * 100) : 0;
              const bg = floorPct >= 100 ? "bg-primary/20 text-primary" :
                         floorPct > 0 ? "bg-amber-500/20 text-amber-500" :
                         "bg-muted text-muted-foreground";
              return (
                <div key={f.id} className={`rounded-lg p-1.5 text-center text-[9px] font-bold ${bg}`}>
                  <div>Эт.{f.floor_number}</div>
                  <div className="text-[12px]">{floorPct}%</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent photos */}
      {recentPhotos.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
            <Camera size={12} className="inline mr-1" />Последние фото
          </div>
          <div className="space-y-2">
            {recentPhotos.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-[10px]">
                <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                <span className="text-foreground truncate flex-1">{p.doc_type}: {p.comment || "без комментария"}</span>
                <span className="text-muted-foreground">{format(new Date(p.created_at), "dd.MM")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {myFloors.length === 0 && recentPhotos.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-[11px]">
          Нет привязанных этажей. Обратитесь к РП.
        </div>
      )}
    </div>
  );
};

export default ForemanDashboard;
