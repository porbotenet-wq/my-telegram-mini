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
import LoginScreen from "@/components/LoginScreen";
import ProjectList from "@/components/ProjectList";
import ProjectCard from "@/components/ProjectCard";
import CreateProjectWizard from "@/components/CreateProjectWizard";
import SheetsSync from "@/components/SheetsSync";

const tabComponents: Record<string, React.FC> = {
  card: ProjectCard as unknown as React.FC,
  dash: Dashboard,
  floors: Floors,
  pf: PlanFact,
  crew: Crew,
  sup: Supply,
  gpr: GPR,
  alerts: Alerts,
  sheets: SheetsSync,
};

type Screen = "projects" | "create" | "project";

const Index = () => {
  const [activeTab, setActiveTab] = useState("dash");
  const [loggedIn, setLoggedIn] = useState(false);
  const [role, setRole] = useState("");
  const [screen, setScreen] = useState<Screen>("projects");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  if (!loggedIn) {
    return (
      <LoginScreen
        onLogin={(r) => {
          setRole(r);
          setLoggedIn(true);
        }}
      />
    );
  }

  if (screen === "projects") {
    return (
      <ProjectList
        onSelectProject={(id) => {
          setSelectedProjectId(id);
          setActiveTab("dash");
          setScreen("project");
        }}
        onCreateNew={() => setScreen("create")}
      />
    );
  }

  if (screen === "create") {
    return (
      <CreateProjectWizard
        onBack={() => setScreen("projects")}
        onCreated={(id) => {
          setSelectedProjectId(id);
          setActiveTab("dash");
          setScreen("project");
        }}
      />
    );
  }

  const ActiveComponent = activeTab === "card"
    ? () => <ProjectCard onBack={() => setScreen("projects")} />
    : tabComponents[activeTab] || Dashboard;

  return (
    <div className="min-h-screen bg-background relative">
      <TopBar
        projectName="СИТИ 4 — Блок Б"
        onBackToProjects={() => setScreen("projects")}
      />
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} showProjectCard />
      <ActiveComponent />
      <div className="h-[70px]" />
    </div>
  );
};

export default Index;
