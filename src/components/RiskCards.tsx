// src/components/RiskCards.tsx
// MONOLITH v3.0 — Horizontal-scroll risk cards with LED status strips
// Shows critical risks, warnings, and info alerts for the current project
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Info, Clock, Users } from "lucide-react";

interface RiskCardsProps {
  projectId: string;
}

interface RiskItem {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  deadline: string | null;
  assignee: string | null;
  created_at: string;
}

/* LED color map — surgical accents only */
const SEVERITY = {
  critical: {
    label: "Критично",
    led: "from-[hsl(var(--red))] to-transparent",
    glow: "shadow-[0_0_12px_hsl(var(--red-glow))]",
    badge: "bg-[hsl(var(--red-dim))] text-[hsl(var(--red))]",
    Icon: AlertTriangle,
  },
  warning: {
    label: "Внимание",
    led: "from-[hsl(var(--amber))] to-transparent",
    glow: "",
    badge: "bg-[hsl(var(--amber-dim))] text-[hsl(var(--amber))]",
    Icon: AlertTriangle,
  },
  info: {
    label: "Инфо",
    led: "from-[hsl(var(--blue))] to-transparent",
    glow: "",
    badge: "bg-[hsl(var(--blue-dim))] text-[hsl(var(--blue))]",
    Icon: Info,
  },
};

const SkeletonCard = () => (
  <div className="flex-shrink-0 w-[272px] h-[140px] skeleton rounded-xl" />
);

const RiskCards = ({ projectId }: RiskCardsProps) => {
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("alerts")
        .select("*")
        .eq("project_id", projectId)
        .eq("is_resolved", false)
        .order("severity", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(10);

      if (data) {
        setRisks(
          data.map((a: any) => ({
            id: a.id,
            title: a.title || a.message || "Без названия",
            description: a.description || a.message || "",
            severity: a.severity === "critical" ? "critical" : a.severity === "warning" ? "warning" : "info",
            deadline: a.deadline || null,
            assignee: a.assigned_to || null,
            created_at: a.created_at,
          }))
        );
      }
      setLoading(false);
    };
    fetch();
  }, [projectId]);

  if (loading) {
    return (
      <div className="px-4 mt-5 animate-fade-in">
        <p className="section-label">Критические риски</p>
        <div className="flex gap-2.5 overflow-hidden">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (risks.length === 0) return null;

  return (
    <div className="mt-5 animate-fade-in">
      <div className="px-4 flex items-center justify-between mb-2.5">
        <p className="section-label !my-0">Критические риски</p>
        <span className="text-[10px] font-semibold text-t3 cursor-pointer active:text-t2 transition-colors">
          Все →
        </span>
      </div>

      {/* Horizontal scroll — snap to card start */}
      <div className="flex gap-2.5 overflow-x-auto scroll-smooth snap-x snap-mandatory px-4 pb-1 scrollbar-none">
        {risks.map((risk) => {
          const s = SEVERITY[risk.severity];
          return (
            <div
              key={risk.id}
              className="flex-shrink-0 w-[272px] snap-start bg-bg1 border border-border rounded-xl p-3.5 relative overflow-hidden cursor-pointer transition-all duration-150 active:scale-[0.98] active:border-[rgba(255,255,255,0.12)]"
            >
              {/* LED strip — 2px gradient on top edge */}
              <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${s.led} ${s.glow}`} />

              {/* Badge */}
              <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-[0.12em] mb-2 ${s.badge}`}>
                <s.Icon className="w-2.5 h-2.5" />
                {s.label}
              </div>

              {/* Content */}
              <p className="text-[13px] font-bold leading-snug mb-1 line-clamp-2">{risk.title}</p>
              <p className="text-[11px] text-t2 leading-relaxed mb-2.5 line-clamp-2">{risk.description}</p>

              {/* Meta row */}
              <div className="flex items-center gap-3 text-[10px] text-t3">
                {risk.deadline && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(risk.deadline).toLocaleDateString("ru-RU", { day: "numeric", month: "2-digit" })}
                  </span>
                )}
                {risk.assignee && (
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {risk.assignee}
                  </span>
                )}
                {!risk.deadline && !risk.assignee && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(risk.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "2-digit" })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RiskCards;
