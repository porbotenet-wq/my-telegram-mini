// src/components/QuickActions.tsx
// MONOLITH v3.0 — 2×2 action grid with dim-colored icons
// Large tap zones (64px min-height) for construction site use
import { Camera, FileText, Users, Monitor } from "lucide-react";

interface QuickActionsProps {
  projectId: string;
  onAction?: (action: string) => void;
}

const ACTIONS = [
  {
    id: "photo",
    title: "Фотофиксация",
    sub: "Нарушение / дефект",
    Icon: Camera,
    iconBg: "bg-[hsl(var(--red-dim))]",
    iconColor: "text-[hsl(var(--red))]",
  },
  {
    id: "report",
    title: "Дневной отчёт",
    sub: "Заполнить за сегодня",
    Icon: FileText,
    iconBg: "bg-[hsl(var(--amber-dim))]",
    iconColor: "text-[hsl(var(--amber))]",
  },
  {
    id: "crew",
    title: "Персонал",
    sub: "Явка и бригады",
    Icon: Users,
    iconBg: "bg-[hsl(var(--green-dim))]",
    iconColor: "text-[hsl(var(--green))]",
  },
  {
    id: "ai",
    title: "AI-анализ",
    sub: "Документы и чертежи",
    Icon: Monitor,
    iconBg: "bg-[hsl(var(--blue-dim))]",
    iconColor: "text-[hsl(var(--blue))]",
  },
];

const QuickActions = ({ projectId, onAction }: QuickActionsProps) => {
  return (
    <div className="px-4 mt-5 animate-fade-in">
      <p className="section-label">Быстрые действия</p>
      <div className="grid grid-cols-2 gap-2.5">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            onClick={() => onAction?.(a.id)}
            className="flex items-center gap-3 bg-bg1 border border-border rounded-xl p-3.5 min-h-[64px] text-left transition-all duration-150 active:scale-[0.97] active:bg-bg2 active:border-[rgba(255,255,255,0.12)]"
          >
            {/* Icon container — 40×40, dim background */}
            <div className={`w-10 h-10 rounded-[10px] ${a.iconBg} flex items-center justify-center flex-shrink-0`}>
              <a.Icon className={`w-5 h-5 ${a.iconColor}`} strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-bold leading-tight">{a.title}</p>
              <p className="text-[9px] text-t3 mt-0.5">{a.sub}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickActions;
