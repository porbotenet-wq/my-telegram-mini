import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface FloorsProps {
  projectId: string;
}

const cellStyle: Record<string, string> = {
  done: "bg-primary/12 text-primary border-primary/25",
  in_progress: "bg-warning/12 text-warning border-warning/30",
  pending: "bg-foreground/[0.02] text-t3 border-transparent",
  blocked: "bg-destructive/12 text-destructive border-transparent",
};

const Floors = ({ projectId }: FloorsProps) => {
  const [facades, setFacades] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const { data: facData } = await supabase.from("facades").select("*").eq("project_id", projectId).order("name");
      setFacades(facData || []);

      if (facData && facData.length > 0) {
        const facadeIds = facData.map(f => f.id);
        const { data: flData } = await supabase.from("floors").select("*").in("facade_id", facadeIds).order("floor_number", { ascending: false });
        setFloors(flData || []);
      }
      setLoading(false);
    };
    fetchData();
  }, [projectId]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (facades.length === 0) {
    return (
      <div className="animate-fade-in p-2.5 text-center py-8">
        <div className="text-2xl mb-2">🏗️</div>
        <div className="text-[12px] text-t2 font-semibold">Нет фасадов</div>
        <div className="text-[10px] text-t3 mt-1">Добавьте фасады и этажи для этого проекта</div>
      </div>
    );
  }

  // Build floor matrix
  const floorNumbers = [...new Set(floors.map(f => f.floor_number))].sort((a, b) => b - a);
  const selectedFloorNum = selectedFloor ?? (floorNumbers[0] || 1);

  const getFloorForFacade = (floorNum: number, facadeId: string) => {
    return floors.find(f => f.floor_number === floorNum && f.facade_id === facadeId);
  };

  const selectedFloorDetails = floors.filter(f => f.floor_number === selectedFloorNum);

  return (
    <div className="animate-fade-in p-2.5">
      <div className="bg-bg2 border border-border rounded-lg p-3.5 mb-2.5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-t3">Матрица по этажам</span>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-primary/12 text-primary">{facades.length} фасадов</span>
        </div>

        <div className="flex gap-2.5 mb-2.5 flex-wrap">
          {[
            { color: "bg-primary", label: "Готово" },
            { color: "bg-warning", label: "В работе" },
            { color: "bg-foreground/[0.06]", label: "Не начат" },
            { color: "bg-destructive", label: "Проблема" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1 text-[9px] text-t2">
              <div className={`w-[7px] h-[7px] rounded-sm ${l.color}`} />
              {l.label}
            </div>
          ))}
        </div>

        {/* Header */}
        <div className={`grid gap-0.5 text-[8px] font-mono font-semibold text-t3 mb-1`} style={{ gridTemplateColumns: `28px repeat(${facades.length}, 1fr)` }}>
          <div />
          {facades.map(f => (
            <div key={f.id} className="text-center">{f.code || f.name.slice(0, 3)}</div>
          ))}
        </div>

        {/* Grid */}
        {floorNumbers.map((floorNum) => (
          <div key={floorNum} className="mb-0.5" style={{ display: "grid", gridTemplateColumns: `28px repeat(${facades.length}, 1fr)`, gap: "2px" }}>
            <div className="font-mono font-semibold text-t3 text-[8px] flex items-center justify-center">{floorNum}</div>
            {facades.map(facade => {
              const fl = getFloorForFacade(floorNum, facade.id);
              const status = fl?.status || "pending";
              const pct = fl && fl.modules_plan > 0 ? Math.round((fl.modules_fact / fl.modules_plan) * 100) : 0;
              const style = cellStyle[status] || cellStyle.pending;
              return (
                <button
                  key={facade.id}
                  onClick={() => setSelectedFloor(floorNum)}
                  className={`h-6 rounded-sm flex items-center justify-center font-mono text-[8px] font-semibold cursor-pointer transition-all duration-200 border hover:scale-105 ${style}`}
                >
                  {pct > 0 ? `${pct}%` : "—"}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Floor detail */}
      <div className="bg-bg2 border border-border rounded-lg p-3.5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-t3">Детализация этажа</span>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-warning/12 text-warning">Этаж {selectedFloorNum}</span>
        </div>
        {selectedFloorDetails.length === 0 ? (
          <div className="text-[10px] text-t3 text-center py-4">Нет данных для этажа {selectedFloorNum}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr>
                  {["Фасад", "Модули П", "Модули Ф", "Кронш. П", "Кронш. Ф", "%"].map((h) => (
                    <th key={h} className="text-left text-[8px] font-bold uppercase tracking-wide text-t3 p-1.5 border-b border-border">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedFloorDetails.map((fl) => {
                  const facade = facades.find(f => f.id === fl.facade_id);
                  const pct = fl.modules_plan > 0 ? Math.round((fl.modules_fact / fl.modules_plan) * 100) : 0;
                  const c = pct >= 100 ? "text-primary" : pct > 0 ? "text-warning" : "text-t3";
                  return (
                    <tr key={fl.id}>
                      <td className="p-2 border-b border-border font-semibold text-t1">{facade?.name || "—"}</td>
                      <td className="p-2 border-b border-border font-mono text-center">{fl.modules_plan}</td>
                      <td className={`p-2 border-b border-border font-mono text-center font-semibold ${c}`}>{fl.modules_fact}</td>
                      <td className="p-2 border-b border-border font-mono text-center">{fl.brackets_plan}</td>
                      <td className={`p-2 border-b border-border font-mono text-center font-semibold ${c}`}>{fl.brackets_fact}</td>
                      <td className={`p-2 border-b border-border font-mono text-center font-bold ${c}`}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Floors;
