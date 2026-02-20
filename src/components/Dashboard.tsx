import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface DashboardProps {
  projectId: string;
}

const SkeletonKPI = () => (
  <div className="skeleton h-[88px] rounded-lg" />
);

const ProgressBar = ({ pct, color }: { pct: number; color: string }) => (
  <div className="h-1.5 rounded-full bg-[hsl(var(--bg2))] overflow-hidden">
    <div
      className="h-full rounded-full transition-all duration-500"
      style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
    />
  </div>
);

const KPICard = ({
  label, value, sub, accentColor, borderColor,
}: {
  label: string; value: string; sub: string;
  accentColor: string; borderColor: string;
}) => (
  <div
    className="relative bg-[hsl(var(--bg1))] border border-border rounded-lg p-3 overflow-hidden"
    style={{ borderLeftColor: borderColor, borderLeftWidth: 3 }}
  >
    <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--t3))] mb-1">
      {label}
    </p>
    <p className="num text-xl font-bold" style={{ color: accentColor }}>
      {value}
    </p>
    <p className="text-[10px] text-[hsl(var(--t2))] mt-0.5">{sub}</p>
  </div>
);

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
    return (
      <div className="p-4 space-y-3 animate-fade-in">
        <div className="grid grid-cols-2 gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonKPI key={i} />
          ))}
        </div>
      </div>
    );
  }

  const totalModulesPlan = floors.reduce((s, f) => s + (f.modules_plan || 0), 0);
  const totalModulesFact = floors.reduce((s, f) => s + (f.modules_fact || 0), 0);
  const totalBracketsPlan = floors.reduce((s, f) => s + (f.brackets_plan || 0), 0);
  const totalBracketsFact = floors.reduce((s, f) => s + (f.brackets_fact || 0), 0);
  const totalSealantPlan = floors.reduce((s, f) => s + Number(f.sealant_plan || 0), 0);
  const totalSealantFact = floors.reduce((s, f) => s + Number(f.sealant_fact || 0), 0);
  const deficitCount = materials.filter((m) => m.status === "deficit" || m.deficit > 0).length;

  const kpis = [
    {
      label: "Модули СПК",
      value: totalModulesFact.toLocaleString("ru"),
      sub: `из ${totalModulesPlan.toLocaleString("ru")} шт`,
      accentColor: "hsl(158 88% 40%)",
      borderColor: "hsl(158 88% 40%)",
    },
    {
      label: "Кронштейны",
      value: totalBracketsFact.toLocaleString("ru"),
      sub: `из ${totalBracketsPlan.toLocaleString("ru")} компл`,
      accentColor: "hsl(34 94% 56%)",
      borderColor: "hsl(34 94% 56%)",
    },
    {
      label: "Герметизация",
      value: Math.round(totalSealantFact).toLocaleString("ru"),
      sub: `из ${Math.round(totalSealantPlan).toLocaleString("ru")} м.п.`,
      accentColor: "hsl(210 76% 60%)",
      borderColor: "hsl(210 76% 60%)",
    },
    {
      label: "Дефицит",
      value: String(deficitCount),
      sub: "позиций",
      accentColor: deficitCount > 0 ? "hsl(4 78% 54%)" : "hsl(158 88% 40%)",
      borderColor: deficitCount > 0 ? "hsl(4 78% 54%)" : "hsl(158 88% 40%)",
    },
  ];

  const progress = [
    { label: "Модули СПК", pct: totalModulesPlan > 0 ? Math.round((totalModulesFact / totalModulesPlan) * 100) : 0, color: "hsl(158 88% 40%)" },
    { label: "Кронштейны", pct: totalBracketsPlan > 0 ? Math.round((totalBracketsFact / totalBracketsPlan) * 100) : 0, color: "hsl(34 94% 56%)" },
    { label: "Герметизация", pct: totalSealantPlan > 0 ? Math.round((totalSealantFact / totalSealantPlan) * 100) : 0, color: "hsl(210 76% 60%)" },
  ];

  const hasData = totalModulesPlan > 0 || facades.length > 0 || materials.length > 0;

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      {!hasData && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-3xl mb-2 opacity-30">◧</div>
          <p className="text-[hsl(var(--t2))] font-semibold text-sm">Нет данных</p>
          <p className="text-[hsl(var(--t3))] text-xs mt-1">
            Добавьте фасады, этажи и материалы
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        {kpis.map((k) => (
          <KPICard key={k.label} {...k} />
        ))}
      </div>

      {totalModulesPlan > 0 && (
        <div className="bg-[hsl(var(--bg1))] border border-border rounded-lg p-3">
          <p className="section-label">Общий прогресс</p>
          <div className="space-y-3 mt-2">
            {progress.map((p) => (
              <div key={p.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-[hsl(var(--t2))]">{p.label}</span>
                  <span className="num text-[11px] font-bold" style={{ color: p.color }}>
                    {p.pct}%
                  </span>
                </div>
                <ProgressBar pct={p.pct} color={p.color} />
              </div>
            ))}
          </div>
        </div>
      )}

      {facades.length > 0 && (
        <div>
          <p className="section-label">Фасады</p>
          <div className="grid grid-cols-4 gap-2">
            {facades.map((f: any, i: number) => {
              const isActive = activeFacade === i;
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveFacade(i)}
                  className={`rounded-lg p-2.5 text-center transition-all duration-150 border ${
                    isActive
                      ? "bg-primary/10 border-primary/25 text-primary"
                      : "bg-[hsl(var(--bg2))] border-border hover:border-white/10 text-[hsl(var(--t2))] hover:text-[hsl(var(--t1))]"
                  }`}
                >
                  <div className="num text-xs font-bold">{f.code || f.name.slice(0, 2)}</div>
                  <div className="num text-lg font-bold mt-0.5">{(f.total_modules || 0).toLocaleString("ru")}</div>
                  <div className="text-[9px] opacity-50">мод.</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
