import { useState } from "react";
import TopBar from "@/components/TopBar";
import TabBar from "@/components/TabBar";
import Dashboard from "@/components/Dashboard";
import Floors from "@/components/Floors";
import PlanFact from "@/components/PlanFact";
import Crew from "@/components/Crew";
import Supply from "@/components/Supply";
import GPR from "@/components/GPR";
import Alerts from "@/components/Alerts";

const tabComponents: Record<string, React.FC> = {
  dash: Dashboard,
  floors: Floors,
  pf: PlanFact,
  crew: Crew,
  sup: Supply,
  gpr: GPR,
  alerts: Alerts,
};

const Index = () => {
  const [activeTab, setActiveTab] = useState("dash");
  const ActiveComponent = tabComponents[activeTab] || Dashboard;

  return (
    <div className="min-h-screen bg-background relative">
      <TopBar />
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <ActiveComponent />
      <div className="h-[70px]" />
    </div>
  );
};

export default Index;
