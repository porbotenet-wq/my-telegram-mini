import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import TopBar from "@/components/TopBar";
import TabBar from "@/components/TabBar";
import Dashboard from "@/components/Dashboard";
import Floors from "@/components/Floors";
import PlanFact from "@/components/PlanFact";
import Crew from "@/components/Crew";
import Supply from "@/components/Supply";
import GPR from "@/components/GPR";
import Alerts from "@/components/Alerts";
import AuthScreen from "@/components/AuthScreen";
import ProjectList from "@/components/ProjectList";
import ProjectCard from "@/components/ProjectCard";
import CreateProjectWizard from "@/components/CreateProjectWizard";
import SheetsSync from "@/components/SheetsSync";
import Documents from "@/components/Documents";

type Screen = "projects" | "create" | "project";

const Index = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState("dash");
  const [screen, setScreen] = useState<Screen>("projects");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Проект");

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm animate-pulse">Загрузка...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (screen === "projects") {
    return (
      <ProjectList
        onSelectProject={(id, name) => {
          setSelectedProjectId(id);
          setProjectName(name || "Проект");
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
        onCreated={(id, name) => {
          setSelectedProjectId(id);
          setProjectName(name || "Проект");
          setActiveTab("dash");
          setScreen("project");
        }}
      />
    );
  }

  const pid = selectedProjectId!;

  const renderTab = () => {
    switch (activeTab) {
      case "card": return <ProjectCard projectId={pid} onBack={() => setScreen("projects")} />;
      case "dash": return <Dashboard projectId={pid} />;
      case "floors": return <Floors projectId={pid} />;
      case "pf": return <PlanFact projectId={pid} />;
      case "crew": return <Crew projectId={pid} />;
      case "sup": return <Supply projectId={pid} />;
      case "gpr": return <GPR projectId={pid} />;
      case "alerts": return <Alerts projectId={pid} />;
      case "sheets": return <SheetsSync />;
      case "docs": return <Documents />;
      default: return <Dashboard projectId={pid} />;
    }
  };

  return (
    <div className="min-h-screen bg-background relative">
      <TopBar
        projectName={projectName}
        onBackToProjects={() => setScreen("projects")}
      />
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} showProjectCard />
      {renderTab()}
      <div className="h-[70px]" />
    </div>
  );
};

export default Index;
