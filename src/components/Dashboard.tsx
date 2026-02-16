import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Area, AreaChart,
} from "recharts";

interface DashboardProps {
  projectId: string;
}

const colorMap: Record<string, string> = {
  primary: "text-primary",
  warning: "text-warning",
  info: "text-info",
  destructive: "text-destructive",
};

const barColorMap: Record<string, string> = {
  primary: "from-primary to-[#00ff99]",
  warning: "from-warning to-[#ffd700]",
  info: "from-info to-[#7bed9f]",
  destructive: "from-destructive to-[#ff6b81]",
};

const Dashboard = ({ projectId }: DashboardProps) => {
  const [facades, setFacades] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFacade, setActiveFacade] = useState(0);

  useEffect(() => {
    const fetchAll = async () => {
      const [facRes, flRes, matRes] = await Promise.all([
        supabase.from("facades").select("*").eq("project_id", projectId),
        supabase.from("floors").select("*"),
        supabase.from("materials").select("*").eq("project_id", projectId),
      ]);
      setFacades(facRes.data || []);
      setFloors(flRes.data || []);
      setMaterials(matRes.data || []);
      setLoading(false);
    };
    fetchAll();
  }, [projectId]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const totalModulesPlan = floors.reduce((s, f) => s + (f.modules_plan || 0), 0);
  const totalModulesFact = floors.reduce((s, f) => s + (f.modules_fact || 0), 0);
  const totalBracketsPlan = floors.reduce((s, f) => s + (f.brackets_plan || 0), 0);
  const totalBracketsFact = floors.reduce((s, f) => s + (f.brackets_fact || 0), 0);
  const totalSealantPlan = floors.reduce((s, f) => s + Number(f.sealant_plan || 0), 0);
  const totalSealantFact = floors.reduce((s, f) => s + Number(f.sealant_fact || 0), 0);

  const kpis = [
    { label: "Модули СПК", value: String(totalModulesFact), sub: `из ${totalModulesPlan} шт`, color: "primary" },
    { label: "Кронштейны", value: String(totalBracketsFact), sub: `из ${totalBracketsPlan} компл`, color: "warning" },
    { label: "Герметизация", value: String(Math.round(totalSealantFact)), sub: `из ${Math.round(totalSealantPlan)} м.п.`, color: "info" },
    { label: "Материалы", value: String(materials.filter(m => m.status === "deficit" || m.deficit > 0).length), sub: "дефицит", color: "destructive" },
  ];

  const progress = [
    { label: "Модули СПК", pct: totalModulesPlan > 0 ? Math.round((totalModulesFact / totalModulesPlan) * 100) : 0, color: "primary" },
    { label: "Кронштейны", pct: totalBracketsPlan > 0 ? Math.round((totalBracketsFact / totalBracketsPlan) * 100) : 0, color: "warning" },
    { label: "Герметизация", pct: totalSealantPlan > 0 ? Math.round((totalSealantFact / totalSealantPlan) * 100) : 0, color: "info" },
  ];

  const facadeData = facades.map(f => ({
    name: f.name,
    val: f.total_modules || 0,
  }));

  const hasData = totalModulesPlan > 0 || facades.length > 0 || materials.length > 0;

  return (
    <div className="animate-fade-in p-2.5">
      {!hasData && (
        <div className="text-center py-8 mb-4 bg-bg1 border border-border rounded-lg">
          <div className="text-2xl mb-2">📊</div>
          <div className="text-[12px] text-t2 font-semibold">Нет данных</div>
          <div className="text-[10px] text-t3 mt-1">Добавьте фасады, этажи и материалы для отображения дашборда</div>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2.5">
        {kpis.map((k) => (
          <div key={k.label} className="bg-bg2 border border-border rounded-lg p-3 relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-[3px] h-full rounded-r ${k.color === "primary" ? "bg-primary" : k.color === "warning" ? "bg-warning" : k.color === "info" ? "bg-info" : "bg-destructive"}`} />
            <div className="text-[9px] font-semibold text-t2 uppercase tracking-wide mb-1">{k.label}</div>
            <div className={`font-mono text-[22px] font-bold leading-none mb-0.5 ${colorMap[k.color]}`}>{k.value}</div>
            <div className="font-mono text-[9px] text-t3">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Progress */}
      <div className="bg-bg2 border border-border rounded-lg p-3.5 mb-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-t3">Общий прогресс</span>
        {progress.map((p) => (
          <div key={p.label} className="mb-2.5 last:mb-0 mt-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] font-semibold">{p.label}</span>
              <span className={`font-mono text-[11px] font-semibold ${colorMap[p.color]}`}>{p.pct}%</span>
            </div>
            <div className="h-[5px] bg-foreground/5 rounded-sm overflow-hidden">
              <div className={`h-full rounded-sm bg-gradient-to-r ${barColorMap[p.color]} transition-all duration-1000`} style={{ width: `${p.pct}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Facades */}
      {facadeData.length > 0 && (
        <>
          <div className="text-[10px] font-bold uppercase tracking-wider text-t3 my-3.5 flex items-center gap-2">
            Фасады <span className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-4 gap-1.5 mb-2.5">
            {facadeData.map((f, i) => (
              <button key={f.name} onClick={() => setActiveFacade(i)}
                className={`bg-bg1 border rounded-sm p-2 text-center cursor-pointer transition-all duration-200 ${
                  activeFacade === i ? "border-primary/25 bg-primary/12" : "border-border hover:border-primary/25"
                }`}>
                <div className="text-[9px] font-bold mb-0.5">{f.name}</div>
                <div className="font-mono text-[15px] font-bold text-primary leading-none">{f.val}</div>
                <div className="text-[8px] text-t3 mt-0.5">модулей</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
