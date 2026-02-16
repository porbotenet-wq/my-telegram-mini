import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface CrewProps {
  projectId: string;
}

const Crew = ({ projectId }: CrewProps) => {
  const [crews, setCrews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase.from("crews").select("*").eq("project_id", projectId).order("name");
      setCrews(data || []);
      setLoading(false);
    };
    fetchData();
  }, [projectId]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (crews.length === 0) {
    return (
      <div className="animate-fade-in p-2.5 text-center py-8">
        <div className="text-2xl mb-2">👷</div>
        <div className="text-[12px] text-t2 font-semibold">Нет бригад</div>
        <div className="text-[10px] text-t3 mt-1">Добавьте бригады для этого проекта</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in p-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-t3 my-3.5 flex items-center gap-2">
        Активные бригады <span className="flex-1 h-px bg-border" />
      </div>

      {crews.map((b) => (
        <div key={b.id} className="bg-bg1 border border-border rounded-sm p-2.5 mb-1.5 cursor-pointer hover:border-foreground/10 transition-all">
          <div className="flex justify-between items-center mb-1.5">
            <div className="text-xs font-bold">{b.name}</div>
            <div className={`font-mono text-[10px] ${b.is_active ? "text-primary" : "text-t3"}`}>
              {b.is_active ? "Активна" : "Ожидание"}
            </div>
          </div>
          {b.specialization && <div className="text-[9px] text-t3 mb-1.5">{b.specialization}</div>}
          <div className="grid grid-cols-2 gap-1.5 text-center">
            <div>
              <div className="font-mono text-[13px] font-bold text-info">{b.headcount}</div>
              <div className="text-[8px] text-t3">чел</div>
            </div>
            <div>
              <div className="font-mono text-[13px] font-bold text-warning">{b.foreman_name || "—"}</div>
              <div className="text-[8px] text-t3">прораб</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Crew;
