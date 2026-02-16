import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip } from "recharts";

interface SupplyProps {
  projectId: string;
}

const COLORS = ["#00d4aa", "#70a1ff", "#ffb347", "#ff4757"];

const statusLabel: Record<string, { text: string; cls: string }> = {
  ok: { text: "ОК", cls: "bg-primary/12 text-primary" },
  normal: { text: "ОК", cls: "bg-primary/12 text-primary" },
  low: { text: "Мало", cls: "bg-warning/12 text-warning" },
  deficit: { text: "Дефицит", cls: "bg-destructive/12 text-destructive" },
  critical: { text: "Критич.", cls: "bg-destructive/12 text-destructive" },
};

const Supply = ({ projectId }: SupplyProps) => {
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase.from("materials").select("*").eq("project_id", projectId).order("name");
      setMaterials(data || []);
      setLoading(false);
    };
    fetchData();
  }, [projectId]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (materials.length === 0) {
    return (
      <div className="animate-fade-in p-2.5 text-center py-8">
        <div className="text-2xl mb-2">📦</div>
        <div className="text-[12px] text-t2 font-semibold">Нет материалов</div>
        <div className="text-[10px] text-t3 mt-1">Добавьте материалы для этого проекта</div>
      </div>
    );
  }

  const okCount = materials.filter(m => m.status === "ok" || m.status === "normal").length;
  const lowCount = materials.filter(m => m.status === "low").length;
  const defCount = materials.filter(m => m.status === "deficit" || m.status === "critical").length;
  const pieData = [
    { name: "В наличии", value: okCount },
    { name: "Мало", value: lowCount },
    { name: "Дефицит", value: defCount },
  ].filter(d => d.value > 0);

  return (
    <div className="animate-fade-in p-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-t3 my-3.5 flex items-center gap-2">
        Материалы <span className="flex-1 h-px bg-border" />
      </div>
      <div className="bg-bg2 border border-border rounded-lg p-3.5 mb-2.5">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr>
                {["Материал", "Ед.", "Нужно", "На площ.", "Статус"].map((h) => (
                  <th key={h} className="text-left text-[8px] font-bold uppercase tracking-wide text-t3 p-1.5 border-b border-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => {
                const st = statusLabel[m.status] || statusLabel.normal;
                const c = m.status === "ok" || m.status === "normal" ? "text-primary" : m.status === "low" ? "text-warning" : "text-destructive";
                return (
                  <tr key={m.id}>
                    <td className="p-2 border-b border-border font-semibold text-t1 text-[10px]">{m.name}</td>
                    <td className="p-2 border-b border-border font-mono text-[9px]">{m.unit}</td>
                    <td className="p-2 border-b border-border font-mono text-center">{Number(m.total_required).toLocaleString()}</td>
                    <td className={`p-2 border-b border-border font-mono text-center font-semibold ${c}`}>{Number(m.on_site).toLocaleString()}</td>
                    <td className="p-2 border-b border-border"><span className={`font-mono text-[9px] px-1.5 py-0.5 rounded ${st.cls}`}>{st.text}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {pieData.length > 0 && (
        <div className="bg-bg2 border border-border rounded-lg p-3.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-t3">Снабжение — обзор</span>
          <div className="h-[190px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={2}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 9, fontFamily: "Manrope" }} />
                <Tooltip contentStyle={{ background: "#181828", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default Supply;
