// src/components/TabBar.tsx
import { getAllowedTabs } from "@/data/roleConfig";

interface ExtraTab {
  id: string;
  label: string;
  icon?: string;
}

interface TabBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  showProjectCard?: boolean;
  userRoles?: string[];
  extraTabs?: ExtraTab[];
}

const BASE_TABS = [
  { id: "card",     label: "Объект" },
  { id: "dash",     label: "Дашборд" },
  { id: "floors",   label: "Этажи" },
  { id: "pf",       label: "План-Факт" },
  { id: "crew",     label: "Бригады" },
  { id: "sup",      label: "Снабжение" },
  { id: "gpr",      label: "ГПР" },
  { id: "wflow",    label: "Процессы" },
  { id: "alerts",   label: "Алерты" },
  { id: "logs",     label: "Отчёты" },
  { id: "appr",     label: "Согласования" },
  { id: "sheets",   label: "Sheets" },
  { id: "docs",     label: "Документы" },
  { id: "cal",      label: "Календарь" },
  { id: "settings", label: "Настройки" },
];

const SYSTEM_TABS = [
  { id: "report", label: "Отчёт" },
  { id: "xp",     label: "XP" },
];

const TabBar = ({ activeTab, onTabChange, showProjectCard, userRoles, extraTabs }: TabBarProps) => {
  const allowedTabs = getAllowedTabs(userRoles || []);

  const visibleBase = BASE_TABS.filter((t) => {
    if (t.id === "card" && !showProjectCard) return false;
    if (allowedTabs && !allowedTabs.includes(t.id)) return false;
    return true;
  });

  const extraMapped = (extraTabs || []).map((t) => ({
    id: t.id,
    label: t.icon ? `${t.icon} ${t.label}` : t.label,
  }));

  const allTabs = [...visibleBase, ...extraMapped, ...SYSTEM_TABS];

  return (
    <div className="sticky top-[49px] z-40 bg-[hsl(var(--bg0)/0.92)] backdrop-blur-md border-b border-border">
      <div className="flex items-center gap-0.5 px-3 py-1.5 overflow-x-auto scrollbar-none">
        {allTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-semibold whitespace-nowrap transition-all duration-150 relative ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-[hsl(var(--t2))] hover:text-[hsl(var(--t1))] hover:bg-[hsl(var(--bg2))]"
              }`}
            >
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TabBar;
