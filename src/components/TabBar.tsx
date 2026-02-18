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
  { id: "card",   label: "📋 Объект" },
  { id: "dash",   label: "📊 Дашборд" },
  { id: "floors", label: "🏗️ Этажи" },
  { id: "pf",     label: "📋 План-Факт" },
  { id: "crew",   label: "👷 Бригады" },
  { id: "sup",    label: "📦 Снабжение" },
  { id: "gpr",    label: "📆 ГПР" },
  { id: "wflow",  label: "🔄 Процессы" },
  { id: "alerts", label: "🔔 Алерты" },
  { id: "logs",   label: "📝 Отчёты" },
  { id: "appr",   label: "✅ Согласования" },
  { id: "sheets", label: "📊 Sheets" },
  { id: "docs",   label: "📄 Документы" },
  { id: "cal",    label: "📅 Календарь" },
];

// Системные служебные вкладки (всегда в конце, не в roleConfig)
const SYSTEM_TABS = [
  { id: "report", label: "📄 Отчёт" },
  { id: "xp",     label: "🏆 XP" },
];

const TabBar = ({ activeTab, onTabChange, showProjectCard, userRoles, extraTabs }: TabBarProps) => {
  const allowedTabs = getAllowedTabs(userRoles || []);

  // Основные вкладки с учётом ролей
  const visibleBase = BASE_TABS.filter((t) => {
    if (t.id === "card" && !showProjectCard) return false;
    if (allowedTabs && !allowedTabs.includes(t.id)) return false;
    return true;
  });

  // Дополнительные (например, ИИ для прораба)
  const extraMapped = (extraTabs || []).map((t) => ({
    id: t.id,
    label: t.icon ? `${t.icon} ${t.label}` : t.label,
  }));

  // Итоговый список: базовые + extra + системные
  const allTabs = [...visibleBase, ...extraMapped, ...SYSTEM_TABS];

  return (
    <div className="flex gap-0.5 px-2.5 py-1.5 bg-bg1 overflow-x-auto scrollbar-none border-b border-border">
      {allTabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-sm text-[11px] font-semibold transition-all duration-200 border whitespace-nowrap ${
            activeTab === tab.id
              ? "text-primary bg-primary/12 border-primary/25"
              : "text-t2 border-transparent hover:text-t1 hover:bg-bg2"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

export default TabBar;
