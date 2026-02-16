import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import PhotoUpload from "@/components/PhotoUpload";

interface AlertsProps {
  projectId: string;
}

type Filter = "all" | "ug" | "wn" | "info";

const priorityMap: Record<string, { border: string; tp: string }> = {
  critical: { border: "border-l-destructive", tp: "ug" },
  high: { border: "border-l-destructive", tp: "ug" },
  normal: { border: "border-l-warning", tp: "wn" },
  medium: { border: "border-l-warning", tp: "wn" },
  low: { border: "border-l-primary", tp: "info" },
  info: { border: "border-l-primary", tp: "info" },
};

const iconMap: Record<string, string> = {
  critical: "🔴",
  high: "🔴",
  normal: "⚠️",
  medium: "⚠️",
  low: "ℹ️",
  info: "ℹ️",
};

const Alerts = ({ projectId }: AlertsProps) => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from("alerts")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(50);
      setAlerts(data || []);
      setLoading(false);
    };
    fetchData();
  }, [projectId]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const filtered = alerts.filter((a) => {
    if (filter === "all") return true;
    const pm = priorityMap[a.priority] || priorityMap.normal;
    return pm.tp === filter;
  });

  const filterBtns: { id: Filter; label: string }[] = [
    { id: "all", label: "Все" },
    { id: "ug", label: "🔴 Критические" },
    { id: "wn", label: "⚠️ Предупреждения" },
    { id: "info", label: "ℹ️ Инфо" },
  ];

  if (alerts.length === 0) {
    return (
      <div className="animate-fade-in p-2.5 text-center py-8">
        <div className="text-2xl mb-2">🔔</div>
        <div className="text-[12px] text-t2 font-semibold">Нет уведомлений</div>
        <div className="text-[10px] text-t3 mt-1">Алерты появятся при событиях на проекте</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in p-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-t3 my-3.5 flex items-center gap-2">
        Уведомления ({alerts.length}) <span className="flex-1 h-px bg-border" />
      </div>

      <div className="flex gap-1 mb-2.5 flex-wrap">
        {filterBtns.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-2 py-1 rounded-sm font-sans text-[10px] font-bold transition-all ${
              filter === f.id ? "bg-primary text-primary-foreground" : "bg-bg1 text-t1 border border-border hover:bg-bg2"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.map((a) => {
        const pm = priorityMap[a.priority] || priorityMap.normal;
        const icon = iconMap[a.priority] || "ℹ️";
        return (
          <div key={a.id} className={`bg-bg1 rounded-sm mb-1.5 border-l-[3px] ${pm.border}`}>
            <div className="flex gap-2 p-2.5">
              <span className="text-base">{icon}</span>
              <div className="flex-1">
                <div className="text-[11px] font-semibold mb-0.5">{a.title}</div>
                {a.description && <div className="text-[10px] text-t2 leading-snug">{a.description}</div>}
                <div className="font-mono text-[9px] text-t3 mt-0.5">
                  {new Date(a.created_at).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                </div>
              </div>
              {a.is_resolved && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/12 text-primary self-start">✅</span>
              )}
            </div>
            <div className="px-2.5 pb-2">
              <PhotoUpload
                photos={(a as any).photo_urls || []}
                onPhotosChange={async (urls) => {
                  await supabase.from("alerts").update({ photo_urls: urls }).eq("id", a.id);
                  setAlerts(prev => prev.map(al => al.id === a.id ? { ...al, photo_urls: urls } : al));
                }}
                folder={`alerts/${a.id}`}
                maxPhotos={3}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Alerts;
