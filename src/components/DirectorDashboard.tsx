import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, TrendingUp, AlertTriangle, Users, Building2, ChevronRight } from "lucide-react";

interface DirectorDashboardProps {
  onOpenProject: (id: string) => void;
}

interface ProjectSummary {
  id: string;
  name: string;
  city: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  alertsCount: number;
  crewsCount: number;
  progress: number;
}

const DirectorDashboard = ({ onOpenProject }: DirectorDashboardProps) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const { data: projectsData } = await supabase.from("projects").select("*").order("created_at", { ascending: false });

        if (!projectsData) { setLoading(false); return; }

        const summaries: ProjectSummary[] = await Promise.all(
          projectsData.map(async (p) => {
            try {
              const [alertsRes, crewsRes, pfRes] = await Promise.all([
                supabase.from("alerts").select("id", { count: "exact", head: true }).eq("project_id", p.id).eq("is_resolved", false),
                supabase.from("crews").select("id", { count: "exact", head: true }).eq("project_id", p.id).eq("is_active", true),
                supabase.from("plan_fact").select("plan_value, fact_value").eq("project_id", p.id),
              ]);

              const totalPlan = (pfRes.data || []).reduce((s, r) => s + Number(r.plan_value || 0), 0);
              const totalFact = (pfRes.data || []).reduce((s, r) => s + Number(r.fact_value || 0), 0);

              return {
                id: p.id,
                name: p.name,
                city: p.city,
                status: p.status,
                startDate: p.start_date,
                endDate: p.end_date,
                alertsCount: alertsRes.count || 0,
                crewsCount: crewsRes.count || 0,
                progress: totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0,
              };
            } catch {
              return {
                id: p.id,
                name: p.name,
                city: p.city,
                status: p.status,
                startDate: p.start_date,
                endDate: p.end_date,
                alertsCount: 0,
                crewsCount: 0,
                progress: 0,
              };
            }
          })
        );

        setProjects(summaries);
      } catch (e) {
        console.error("DirectorDashboard load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
        <div className="text-[11px] text-muted-foreground">Загрузка портфеля…</div>
      </div>
    );
  }

  const totalAlerts = projects.reduce((s, p) => s + p.alertsCount, 0);
  const totalCrews = projects.reduce((s, p) => s + p.crewsCount, 0);
  const avgProgress = projects.length > 0 ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length) : 0;

  const statusColors: Record<string, string> = {
    active: "bg-primary/15 text-primary",
    draft: "bg-muted text-muted-foreground",
    completed: "bg-emerald-500/15 text-emerald-500",
    paused: "bg-amber-500/15 text-amber-500",
  };
  const statusLabels: Record<string, string> = {
    active: "Активный",
    draft: "Черновик",
    completed: "Завершён",
    paused: "Пауза",
  };

  return (
    <div className="p-3 space-y-3 animate-fade-in">
      {/* Header */}
      <div className="px-1 pt-2 pb-1">
        <div className="text-[16px] font-bold text-foreground">📊 Портфель проектов</div>
        <div className="text-[10px] text-muted-foreground">{projects.length} проектов</div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <TrendingUp size={16} className="mx-auto text-primary mb-1" />
          <div className="text-[20px] font-bold text-foreground">{avgProgress}%</div>
          <div className="text-[8px] text-muted-foreground">Ср. прогресс</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <AlertTriangle size={16} className="mx-auto text-destructive mb-1" />
          <div className="text-[20px] font-bold text-foreground">{totalAlerts}</div>
          <div className="text-[8px] text-muted-foreground">Алертов</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <Users size={16} className="mx-auto text-primary mb-1" />
          <div className="text-[20px] font-bold text-foreground">{totalCrews}</div>
          <div className="text-[8px] text-muted-foreground">Бригад</div>
        </div>
      </div>

      {/* Project list */}
      <div className="space-y-2">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => onOpenProject(p.id)}
            className="w-full bg-card border border-border rounded-xl p-3 text-left hover:border-primary/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 size={12} className="text-primary flex-shrink-0" />
                  <span className="text-[12px] font-bold text-foreground truncate">{p.name}</span>
                </div>
                {p.city && <div className="text-[9px] text-muted-foreground ml-5">{p.city}</div>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-[8px] font-semibold px-2 py-0.5 rounded-full ${statusColors[p.status] || statusColors.draft}`}>
                  {statusLabels[p.status] || p.status}
                </span>
                <ChevronRight size={14} className="text-muted-foreground" />
              </div>
            </div>
            <div className="flex items-center gap-4 mt-2 ml-5">
              <div className="flex-1">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(p.progress, 100)}%` }}
                  />
                </div>
              </div>
              <span className="text-[10px] font-bold text-primary w-10 text-right">{p.progress}%</span>
              {p.alertsCount > 0 && (
                <span className="text-[9px] text-destructive font-semibold">⚠ {p.alertsCount}</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {projects.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-[11px]">
          Нет проектов
        </div>
      )}
    </div>
  );
};

export default DirectorDashboard;
