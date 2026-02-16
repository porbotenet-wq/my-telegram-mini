import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface PlanFactProps {
  projectId: string;
}

const PlanFact = ({ projectId }: PlanFactProps) => {
  const [records, setRecords] = useState<any[]>([]);
  const [workTypes, setWorkTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const [pfRes, wtRes] = await Promise.all([
        supabase.from("plan_fact").select("*").eq("project_id", projectId).order("date", { ascending: false }).limit(100),
        supabase.from("work_types").select("*").eq("project_id", projectId).order("sort_number"),
      ]);
      setRecords(pfRes.data || []);
      setWorkTypes(wtRes.data || []);
      setLoading(false);
    };
    fetchData();
  }, [projectId]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  // Group by week
  const weekMap = new Map<number, { plan: number; fact: number }>();
  records.forEach(r => {
    const cur = weekMap.get(r.week_number) || { plan: 0, fact: 0 };
    cur.plan += Number(r.plan_value || 0);
    cur.fact += Number(r.fact_value || 0);
    weekMap.set(r.week_number, cur);
  });

  const chartData = Array.from(weekMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([w, d]) => ({ week: `Н${w}`, plan: d.plan, fact: d.fact }));

  const hasData = records.length > 0 || workTypes.length > 0;

  return (
    <div className="animate-fade-in p-2.5">
      {!hasData && (
        <div className="text-center py-8">
          <div className="text-2xl mb-2">📋</div>
          <div className="text-[12px] text-t2 font-semibold">Нет данных план-факт</div>
          <div className="text-[10px] text-t3 mt-1">Добавьте виды работ и данные план-факт</div>
        </div>
      )}

      {/* Work types */}
      {workTypes.length > 0 && (
        <div className="bg-bg2 border border-border rounded-lg p-3.5 mb-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-t3">Виды работ</span>
          <div className="overflow-x-auto mt-3">
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr>
                  {["Работа", "Ед.", "Объём"].map((h) => (
                    <th key={h} className="text-left text-[8px] font-bold uppercase tracking-wide text-t3 p-1.5 border-b border-border">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workTypes.map((wt) => (
                  <tr key={wt.id}>
                    <td className="p-2 border-b border-border font-semibold text-t1">{wt.name}</td>
                    <td className="p-2 border-b border-border text-t2">{wt.unit}</td>
                    <td className="p-2 border-b border-border font-mono text-center">{wt.volume || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-bg2 border border-border rounded-lg p-3.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-t3">План vs Факт по неделям</span>
          <div className="h-[190px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="week" tick={{ fill: "#555570", fontSize: 8, fontFamily: "JetBrains Mono" }} />
                <YAxis tick={{ fill: "#555570", fontSize: 8, fontFamily: "JetBrains Mono" }} />
                <Tooltip contentStyle={{ background: "#181828", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                <Bar dataKey="plan" name="План" fill="rgba(112,161,255,0.25)" radius={2} />
                <Bar dataKey="fact" name="Факт" fill="rgba(0,212,170,0.5)" radius={2} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanFact;
