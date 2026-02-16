interface TabBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  showProjectCard?: boolean;
}

const tabs = [
  { id: "card", label: "📋 Объект" },
  { id: "dash", label: "📊 Дашборд" },
  { id: "floors", label: "🏗️ Этажи" },
  { id: "pf", label: "📋 План-Факт" },
  { id: "crew", label: "👷 Бригады" },
  { id: "sup", label: "📦 Снабжение" },
  { id: "gpr", label: "📆 ГПР" },
  { id: "alerts", label: "🔔 Алерты" },
  { id: "sheets", label: "📊 Sheets" },
];

const TabBar = ({ activeTab, onTabChange, showProjectCard }: TabBarProps) => {
  const visibleTabs = showProjectCard ? tabs : tabs.filter((t) => t.id !== "card");

  return (
    <div className="flex gap-0.5 px-2.5 py-1.5 bg-bg1 overflow-x-auto scrollbar-none">
      {visibleTabs.map((tab) => (
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
