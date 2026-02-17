import { useState, useEffect } from "react";
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
import Workflow from "@/components/Workflow";
import AIAssistant from "@/components/AIAssistant";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/data/jobInstructions";

type Screen = "projects" | "create" | "project";

// Map DB roles to jobInstructions AppRole
const ROLE_MAP: Record<string, AppRole> = {
  director: "director",
  pm: "pm",
  foreman1: "foreman",
  foreman2: "foreman",
  foreman3: "foreman",
  production: "foreman",
  pto: "pto",
  supply: "supply",
  project: "pm",
  inspector: "inspector",
};

const Index = () => {
  const { user, loading, roles, displayName } = useAuth();
  const [activeTab, setActiveTab] = useState("dash");
  const [screen, setScreen] = useState<Screen>("projects");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Проект");
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);

  // Check onboarding status
  useEffect(() => {
    if (!user) { setOnboardingCompleted(null); return; }
    supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setOnboardingCompleted(data?.onboarding_completed ?? false);
      });
  }, [user]);

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

  // Show onboarding if not completed and user has a role
  if (onboardingCompleted === false && roles.length > 0) {
    const appRole = ROLE_MAP[roles[0]] || "pm";
    return (
      <OnboardingFlow
        role={appRole}
        userName={displayName || "Коллега"}
        onComplete={() => setOnboardingCompleted(true)}
      />
    );
  }

  // Still loading onboarding status
  if (onboardingCompleted === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm animate-pulse">Загрузка...</div>
      </div>
    );
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
      case "wflow": return <Workflow />;
      case "sheets": return <SheetsSync />;
      case "docs": return <Documents projectId={pid} />;
      default: return <Dashboard projectId={pid} />;
    }
  };

  return (
    <div className="min-h-screen bg-background relative">
      <TopBar
        projectName={projectName}
        projectId={pid}
        onBackToProjects={() => setScreen("projects")}
      />
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} showProjectCard userRoles={roles} />
      {renderTab()}
      <AIAssistant projectId={pid} projectName={projectName} userRole={roles[0]} />
      <div className="h-[70px]" />
    </div>
  );
};

export default Index;
