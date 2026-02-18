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
    <div className="sticky top-0 z-50 bg-bg0/88 backdrop-blur-[20px] border-b border-border px-3.5 py-2.5 flex items-center justify-between">
      {/* ── Левая часть: назад + название ── */}
      <div className="flex items-center gap-2 min-w-0">
        {onBackToProjects && (
          <button
            onClick={onBackToProjects}
            className="text-muted-foreground text-[11px] hover:text-primary transition-colors mr-1 flex-shrink-0"
          >
            ←
          </button>
        )}
        <span className="bg-primary/12 border border-primary/25 text-primary font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded tracking-widest flex-shrink-0">
          LIVE
        </span>
        <span className="text-[14px] font-bold tracking-tight truncate max-w-[140px]">
          {projectName || "STSphera"}
        </span>
      </div>

      {/* ── Правая часть ── */}
      <div className="flex items-center gap-2 flex-shrink-0">

        {/* Дополнительные действия (PDF, XP и т.д.) */}
        {extraActions && extraActions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            title={action.label}
            className="w-7 h-7 rounded-full bg-bg2 border border-border flex items-center justify-center text-[12px] hover:border-primary/40 hover:bg-bg3 transition-all"
          >
            {action.icon}
          </button>
        ))}

        {/* Telegram */}
        {projectId && <TelegramChats projectId={projectId} />}

        {/* Время */}
        <div className="flex items-center gap-1.5">
          <div className="w-[7px] h-[7px] rounded-full bg-primary shadow-[0_0_8px_hsl(163_100%_42%/0.25)] animate-pulse-dot" />
          <span className="font-mono text-[10px] text-muted-foreground">{time}</span>
        </div>

        {/* Имя пользователя */}
        {displayName && (
          <span className="text-[10px] text-muted-foreground truncate max-w-[70px] hidden sm:block">
            {displayName}
          </span>
        )}

        {/* Выйти */}
        <button
          onClick={signOut}
          className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
          title="Выйти"
        >
          ⏻
        </button>
      </div>
    </div>
  );
};

export default TopBar;
