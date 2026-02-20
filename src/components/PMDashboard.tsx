// src/components/PMDashboard.tsx
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Inbox, AlertTriangle, Clock, CheckCircle, Activity } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

interface Props { projectId: string; }

const PMDashboard = ({ projectId }: Props) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [inboxCount, setInboxCount] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [overdueTasks, setOverdueTasks] = useState(0);
  const [activity, setActivity] = useState<any[]>([]);
  const [gprProgress, setGprProgress] = useState<{ label: string; plan: number; fact: number }[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const today = new Date().toISOString().split("T")[0];

        const [inboxRes, apprRes, tasksRes, auditRes, pfRes] = await Promise.all([
          supabase.from("bot_inbox").select("id", { count: "exact", head: true })
            .eq("project_id", projectId).eq("status", "new"),
          supabase.from("approvals").select("id", { count: "exact", head: true })
            .eq("project_id", projectId).eq("status", "pending"),
          supabase.from("ecosystem_tasks").select("id", { count: "exact", head: true })
            .eq("project_id", projectId).eq("status", "Просрочен"),
          supabase.from("bot_audit_log").select("*")
            .order("created_at", { ascending: false }).limit(10),
          supabase.from("plan_fact").select("work_type_id, plan_value, fact_value")
            .eq("project_id", projectId),
        ]);

        setInboxCount(inboxRes.count || 0);
        setPendingApprovals(apprRes.count || 0);
        setOverdueTasks(tasksRes.count || 0);
        setActivity(auditRes.data || []);

        // Aggregate plan/fact by work_type
        const byType = new Map<string, { plan: number; fact: number }>();
        for (const r of pfRes.data || []) {
          const key = r.work_type_id || "other";
          const cur = byType.get(key) || { plan: 0, fact: 0 };
          cur.plan += Number(r.plan_value || 0);
          cur.fact += Number(r.fact_value || 0);
          byType.set(key, cur);
        }
        setGprProgress(Array.from(byType.entries()).slice(0, 5).map(([k, v]) => ({
          label: k === "other" ? "Прочее" : k.slice(0, 8),
          ...v,
        })));
      } catch (e) {
        console.error("PMDashboard error:", e);
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
        <div className="text-[11px] text-muted-foreground">Загрузка…</div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 animate-fade-in">
      <div className="px-1 pt-2 pb-1">
        <div className="text-[16px] font-bold text-foreground">📋 Панель РП</div>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-3 gap-2">
        <CounterCard icon={<Inbox size={16} />} value={inboxCount} label="Входящие" color="text-primary" />
        <CounterCard icon={<AlertTriangle size={16} />} value={overdueTasks} label="Просрочено" color="text-destructive" />
        <CounterCard icon={<CheckCircle size={16} />} value={pendingApprovals} label="На согласов." color="text-amber-500" />
      </div>

      {/* GPR Progress */}
      {gprProgress.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Прогресс ГПР</div>
          <div className="space-y-2">
            {gprProgress.map((g) => {
              const pct = g.plan > 0 ? Math.round((g.fact / g.plan) * 100) : 0;
              return (
                <div key={g.label}>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-muted-foreground">{g.label}</span>
                    <span className="font-bold text-primary">{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity feed */}
      <div className="bg-card border border-border rounded-xl p-3">
        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          <Activity size={12} className="inline mr-1" />Лента активности
        </div>
        {activity.length === 0 ? (
          <div className="text-[10px] text-muted-foreground py-4 text-center">Нет событий</div>
        ) : (
          <div className="space-y-2">
            {activity.map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-[10px]">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-foreground">{a.action}</span>
                  <div className="text-muted-foreground">{format(new Date(a.created_at), "dd.MM HH:mm")}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const CounterCard = ({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: string }) => (
  <div className="bg-card border border-border rounded-xl p-3 text-center">
    <div className={`mx-auto mb-1 ${color}`}>{icon}</div>
    <div className="text-[20px] font-bold text-foreground">{value}</div>
    <div className="text-[8px] text-muted-foreground">{label}</div>
  </div>
);

export default PMDashboard;
