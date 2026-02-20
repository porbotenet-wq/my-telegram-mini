import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, LogOut, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import ProfileSettings from "@/components/ProfileSettings";

interface Project {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  address: string | null;
  work_type: string;
  status: string;
  client_name: string | null;
  start_date: string | null;
  end_date: string | null;
  cover_image_url: string | null;
  photo_url: string | null;
}

interface ProjectKPI {
  alertsCount: number;
  crewsCount: number;
  progressPct: number;
}

const statusConfig: Record<string, { text: string; led: string; badge: string }> = {
  draft:     { text: "Черновик",  led: "led-blue",  badge: "bg-[hsl(var(--blue-dim))] text-[hsl(var(--blue))]" },
  active:    { text: "Активный",  led: "led-green", badge: "bg-[hsl(var(--green-dim))] text-primary" },
  paused:    { text: "Пауза",    led: "led-amber", badge: "bg-[hsl(var(--amber-dim))] text-[hsl(var(--amber))]" },
  completed: { text: "Завершён", led: "led-blue",  badge: "bg-[hsl(var(--blue-dim))] text-[hsl(var(--blue))]" },
};

const placeholderGradients = [
  "from-[hsl(220,25%,12%)] to-[hsl(220,18%,8%)]",
  "from-[hsl(200,20%,14%)] to-[hsl(220,22%,8%)]",
  "from-[hsl(240,18%,14%)] to-[hsl(220,25%,6%)]",
];

interface ProjectListProps {
  onSelectProject: (id: string, name?: string) => void;
  onCreateNew: () => void;
}

const ProjectList = ({ onSelectProject, onCreateNew }: ProjectListProps) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<Record<string, ProjectKPI>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { displayName, signOut } = useAuth();

  useEffect(() => {
    const fetchProjects = async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, code, city, address, work_type, status, client_name, start_date, end_date, cover_image_url, photo_url")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setProjects(data as Project[]);
        // Load KPIs in background
        loadKPIs(data.map((p: any) => p.id));
      }
      setLoading(false);
    };
    fetchProjects();
  }, []);

  const loadKPIs = async (projectIds: string[]) => {
    const results: Record<string, ProjectKPI> = {};

    await Promise.all(
      projectIds.map(async (pid) => {
        const [alertsRes, crewsRes, pfRes] = await Promise.all([
          supabase.from("alerts").select("id", { count: "exact", head: true }).eq("project_id", pid).eq("is_resolved", false),
          supabase.from("crews").select("id", { count: "exact", head: true }).eq("project_id", pid).eq("is_active", true),
          supabase.from("plan_fact").select("plan_value, fact_value").eq("project_id", pid),
        ]);

        const totalPlan = (pfRes.data || []).reduce((s, r) => s + Number(r.plan_value), 0);
        const totalFact = (pfRes.data || []).reduce((s, r) => s + Number(r.fact_value), 0);
        const progressPct = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;

        results[pid] = {
          alertsCount: alertsRes.count || 0,
          crewsCount: crewsRes.count || 0,
          progressPct,
        };
      })
    );

    setKpis(results);
  };

  const initials = displayName
    ? displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <div className="min-h-screen bg-background animate-fade-in">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[hsl(var(--bg0)/0.88)] backdrop-blur-[20px] border-b border-border px-3.5 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-bg2 flex items-center justify-center text-[10px] font-bold text-t2">
            {initials}
          </div>
          <div>
            <div className="text-[13px] font-bold tracking-tight">🏗️ Объекты</div>
            {displayName && <div className="text-[9px] text-t3 truncate max-w-[120px]">{displayName}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-8 h-8 rounded-xl bg-bg2 flex items-center justify-center text-t2 hover:text-t1 transition-colors"
            title="Профиль"
          >
            <User size={14} />
          </button>
          <button
            onClick={signOut}
            className="w-8 h-8 rounded-xl bg-bg2 flex items-center justify-center text-t2 hover:text-destructive transition-colors"
            title="Выйти"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>

      <ProfileSettings open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Project Cards */}
      <div className="p-3 space-y-3 pb-24">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {projects.map((p, i) => {
              const st = statusConfig[p.status] || statusConfig.draft;
              const kpi = kpis[p.id];
              const heroImg = p.cover_image_url || p.photo_url;
              const grad = placeholderGradients[i % placeholderGradients.length];

              return (
                <button
                  key={p.id}
                  onClick={() => onSelectProject(p.id, p.name)}
                  className={`stagger-item w-full text-left rounded-2xl overflow-hidden border border-border hover:border-primary/20 transition-all active:scale-[0.98] led-top ${st.led}`}
                >
                  {/* Hero Image */}
                  <div className="relative h-[200px] w-full">
                    {heroImg ? (
                      <img
                        src={heroImg}
                        alt={p.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-br ${grad} flex items-center justify-center`}>
                        <span className="text-[48px] opacity-20">🏗️</span>
                      </div>
                    )}

                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--bg0)/0.92)] via-[hsl(var(--bg0)/0.3)] to-transparent" />

                    {/* Content on overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-3.5">
                      <div className="flex items-end justify-between mb-2">
                        <div>
                          <h3 className="text-[16px] font-bold text-[hsl(var(--t1))] leading-tight mb-0.5">{p.name}</h3>
                          {(p.city || p.address) && (
                            <div className="text-[10px] text-t2">📍 {[p.city, p.address].filter(Boolean).join(", ")}</div>
                          )}
                        </div>
                        <span className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded-lg ${st.badge}`}>
                          {st.text}
                        </span>
                      </div>

                      {/* Mini KPI row */}
                      <div className="flex items-center gap-3 mt-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-t3">📊</span>
                          <span className="num text-[11px] font-semibold text-t1">{kpi?.progressPct ?? "—"}%</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-t3">🔔</span>
                          <span className={`num text-[11px] font-semibold ${(kpi?.alertsCount || 0) > 0 ? "text-[hsl(var(--red))]" : "text-t2"}`}>
                            {kpi?.alertsCount ?? "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-t3">👷</span>
                          <span className="num text-[11px] font-semibold text-t2">{kpi?.crewsCount ?? "—"}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-[2px] bg-bg2">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: `${kpi?.progressPct || 0}%` }}
                    />
                  </div>
                </button>
              );
            })}

            {projects.length === 0 && (
              <div className="text-center py-12">
                <div className="text-3xl mb-3">📋</div>
                <div className="text-[13px] text-t2 font-semibold">Нет объектов</div>
                <div className="text-[10px] text-t3 mt-1">Создайте первый объект</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating FAB */}
      <button
        onClick={onCreateNew}
        className="fixed bottom-20 right-4 z-50 w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all"
      >
        <Plus size={24} />
      </button>
    </div>
  );
};

export default ProjectList;
