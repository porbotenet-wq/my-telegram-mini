import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

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
}

const workTypeLabels: Record<string, { text: string; cls: string }> = {
  spk: { text: "СПК", cls: "bg-primary/12 text-primary" },
  nvf: { text: "НВФ", cls: "bg-info/12 text-info" },
  both: { text: "НВФ + СПК", cls: "bg-warning/12 text-warning" },
};

const statusLabels: Record<string, { text: string; cls: string }> = {
  draft: { text: "Черновик", cls: "bg-muted text-t3" },
  active: { text: "Активный", cls: "bg-primary/12 text-primary" },
  paused: { text: "Пауза", cls: "bg-warning/12 text-warning" },
  completed: { text: "Завершён", cls: "bg-info/12 text-info" },
};

interface ProjectListProps {
  onSelectProject: (id: string, name?: string) => void;
  onCreateNew: () => void;
}

const ProjectList = ({ onSelectProject, onCreateNew }: ProjectListProps) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, code, city, address, work_type, status, client_name, start_date, end_date")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setProjects(data);
      }
      setLoading(false);
    };
    fetchProjects();
  }, []);

  return (
    <div className="min-h-screen bg-background animate-fade-in">
      <div className="sticky top-0 z-50 bg-bg0/88 backdrop-blur-[20px] border-b border-border px-3.5 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold tracking-tight">🏗️ Объекты</span>
        </div>
        <button
          onClick={onCreateNew}
          className="px-3 py-1.5 rounded-sm bg-primary text-primary-foreground text-[11px] font-bold hover:brightness-110 transition-all"
        >
          + Новый объект
        </button>
      </div>

      <div className="p-2.5">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {projects.map((p) => {
              const wt = workTypeLabels[p.work_type] || workTypeLabels.spk;
              const st = statusLabels[p.status] || statusLabels.draft;
              return (
                <button
                  key={p.id}
                  onClick={() => onSelectProject(p.id, p.name)}
                  className="w-full text-left bg-bg1 border border-border rounded-lg p-3.5 mb-2 hover:border-primary/25 hover:bg-bg2 transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-[13px] font-bold mb-0.5">{p.name}</div>
                      {p.code && <div className="text-[10px] text-t3 font-mono">{p.code}</div>}
                    </div>
                    <div className="flex gap-1">
                      <span className={`text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded ${wt.cls}`}>{wt.text}</span>
                      <span className={`text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded ${st.cls}`}>{st.text}</span>
                    </div>
                  </div>
                  {(p.city || p.address) && (
                    <div className="text-[10px] text-t2 mb-1">📍 {[p.city, p.address].filter(Boolean).join(", ")}</div>
                  )}
                  {p.client_name && <div className="text-[10px] text-t2 mb-1">🏢 {p.client_name}</div>}
                  {p.start_date && p.end_date && (
                    <div className="text-[9px] text-t3 font-mono">
                      📅 {new Date(p.start_date).toLocaleDateString("ru-RU")} — {new Date(p.end_date).toLocaleDateString("ru-RU")}
                    </div>
                  )}
                </button>
              );
            })}

            {projects.length === 0 && !loading && (
              <div className="text-center py-8">
                <div className="text-2xl mb-2">📋</div>
                <div className="text-[12px] text-t2 font-semibold">Нет объектов</div>
                <div className="text-[10px] text-t3 mt-1">Создайте первый объект</div>
              </div>
            )}
          </>
        )}

        <button
          onClick={onCreateNew}
          className="w-full border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/25 hover:bg-bg1 transition-all"
        >
          <div className="text-2xl mb-2">➕</div>
          <div className="text-[12px] font-semibold text-t2">Создать новый объект</div>
          <div className="text-[10px] text-t3 mt-1">Карточка объекта, виды работ, экосистема задач</div>
        </button>
      </div>
    </div>
  );
};

export default ProjectList;
