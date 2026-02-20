// src/components/TopBar.tsx
// SMR — полностью переписан
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import TelegramChats from "@/components/TelegramChats";

interface TopBarAction {
  icon: string;
  label: string;
  onClick: () => void;
}

interface TopBarProps {
  projectName?: string;
  projectId?: string;
  onBackToProjects?: () => void;
  extraActions?: TopBarAction[];
}

const TopBar = ({ projectName, projectId, onBackToProjects, extraActions }: TopBarProps) => {
  const { displayName, signOut } = useAuth();
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => {
      const n = new Date();
      setTime(
        n.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) +
          " · " +
          n.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
      );
    };
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="sticky top-0 z-50 bg-[hsl(var(--bg0)/0.88)] backdrop-blur-[20px] border-b border-border px-3.5 py-2.5 flex items-center justify-between">
      {/* Левая часть: логотип + объект */}
      <div className="flex items-center gap-2 min-w-0">
        {onBackToProjects && (
          <button
            onClick={onBackToProjects}
            className="text-muted-foreground text-[11px] hover:text-primary transition-colors mr-1 flex-shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}

        {/* SMR логотип */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-6 h-6 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
            <span className="text-primary font-mono text-[10px] font-bold">S</span>
          </div>
          <span className="text-[13px] font-bold tracking-tight">SMR</span>
        </div>

        {/* Разделитель + название объекта */}
        {projectName && (
          <>
            <span className="text-[hsl(var(--t3))] text-[10px] mx-0.5">·</span>
            <span className="text-[12px] text-muted-foreground truncate max-w-[140px]">
              {projectName}
            </span>
          </>
        )}
      </div>

      {/* Правая часть */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Дополнительные действия */}
        {extraActions && extraActions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            title={action.label}
            className="w-7 h-7 rounded-full bg-[hsl(var(--bg2))] border border-border flex items-center justify-center text-[12px] hover:border-primary/40 transition-all"
          >
            {action.icon}
          </button>
        ))}
        {/* LIVE индикатор */}
        <div className="flex items-center gap-1.5">
          <div className="w-[6px] h-[6px] rounded-full bg-primary shadow-[0_0_8px_hsl(158_88%_40%/0.3)] animate-pulse-dot" />
          <span className="font-mono text-[10px] text-muted-foreground">{time}</span>
        </div>

        {projectId && <TelegramChats projectId={projectId} />}

        {/* Имя пользователя */}
        {displayName && (
          <span className="text-[10px] text-muted-foreground truncate max-w-[70px] hidden sm:block">
            {displayName}
          </span>
        )}

        {/* Выход */}
        <button
          onClick={signOut}
          className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
          title="Выйти"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TopBar;
