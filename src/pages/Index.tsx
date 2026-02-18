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

// ── Новые модули ──────────────────────────────────────────
import OfflineBar from "@/components/OfflineBar";
import DirectorDashboard from "@/components/DirectorDashboard";
import GamificationPanel from "@/components/GamificationPanel";
import ForemenAI from "@/components/ForemenAI";
import ReportPDF from "@/components/ReportPDF";

import { useOfflineCache } from "@/hooks/useOfflineCache";
import InstallPWA from "@/components/InstallPWA";

// ── Типы ─────────────────────────────────────────────────
type Screen = "projects" | "create" | "project" | "director";

// ── Вкладки для прораба ──────────────────────────────────
const FOREMAN_TABS = ["foreman1", "foreman2", "foreman3"];

const Index = () => {
  const { user, loading, roles } = useAuth();
  const [activeTab, setActiveTab] = useState("dash");
  const [screen, setScreen] = useState<Screen>("projects");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Проект");
  const [showGamification, setShowGamification] = useState(false);
  const { cacheProjectData } = useOfflineCache();

  const isDirector = roles.includes("director");
  const isForeman = roles.some((r) => FOREMAN_TABS.includes(r));
  const userRole = roles[0] || "user";

  // ── Кэшируем данные при открытии проекта ────────────────
  useEffect(() => {
    if (selectedProjectId && screen === "project") {
      cacheProjectData(selectedProjectId);
    }
  }, [selectedProjectId, screen]);

  // ── Загрузка ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <div className="text-muted-foreground text-[11px]">Загрузка STSphera…</div>
        </div>
      </div>
    );
  }

  // ── Авторизация ──────────────────────────────────────────
  if (!user) {
    return <AuthScreen />;
  }

  // ── Экран директора — портфель всех проектов ─────────────
  if (screen === "director" || (isDirector && screen === "projects")) {
    return (
      <div className="min-h-screen bg-background relative">
        <OfflineBar />
        <DirectorDashboard
          onOpenProject={(id) => {
            setSelectedProjectId(id);
            setActiveTab("dash");
            setScreen("project");
          }}
        />
        {/* Кнопка геймификации */}
        <button
          onClick={() => setShowGamification(true)}
          className="fixed bottom-6 right-4 z-[100] w-11 h-11 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center text-lg shadow-lg hover:scale-110 transition-transform"
          title="Мой рейтинг"
        >
          🏆
        </button>
        {showGamification && user && (
          <div className="fixed inset-0 z-[200] bg-background animate-fade-in overflow-auto">
            <div className="sticky top-0 z-10 bg-bg0/90 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
              <span className="font-bold text-[14px]">🏆 Геймификация</span>
              <button onClick={() => setShowGamification(false)} className="text-t2 text-[11px] hover:text-t1">Закрыть</button>
            </div>
            <GamificationPanel userId={user.id} projectId={selectedProjectId || ""} userRole={userRole} />
          </div>
        )}
      </div>
    );
  }

  // ── Список проектов ──────────────────────────────────────
  if (screen === "projects") {
    return (
      <div className="relative">
        <OfflineBar />
        <ProjectList
          onSelectProject={(id, name) => {
            setSelectedProjectId(id);
            setProjectName(name || "Проект");
            setActiveTab("dash");
            setScreen("project");
          }}
          onCreateNew={() => setScreen("create")}
        />
      </div>
    );
  }

  // ── Создание проекта ──────────────────────────────────────
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

  // ── Экран проекта ─────────────────────────────────────────
  const pid = selectedProjectId!;

  const renderTab = () => {
    switch (activeTab) {
      case "card":    return <ProjectCard projectId={pid} onBack={() => setScreen("projects")} />;
      case "dash":    return <Dashboard projectId={pid} />;
      case "floors":  return <Floors projectId={pid} />;
      case "pf":      return <PlanFact projectId={pid} />;
      case "crew":    return <Crew projectId={pid} />;
      case "sup":     return <Supply projectId={pid} />;
      case "gpr":     return <GPR projectId={pid} />;
      case "alerts":  return <Alerts projectId={pid} />;
      case "wflow":   return <Workflow />;
      case "sheets":  return <SheetsSync />;
      case "docs":    return <Documents projectId={pid} />;
      // ── Новые вкладки ──
      case "ai":      return <ForemenAI projectId={pid} projectName={projectName} userRole={userRole} />;
      case "report":  return <ReportPDF projectId={pid} projectName={projectName} />;
      case "xp":      return user ? (
        <GamificationPanel userId={user.id} projectId={pid} userRole={userRole} />
      ) : null;
      default:        return <Dashboard projectId={pid} />;
    }
  };

  return (
    <div className="min-h-screen bg-background relative">
      {/* ── Офлайн-статус ── */}
      <OfflineBar projectId={pid} />

      {/* ── Шапка ── */}
      <TopBar
        projectName={projectName}
        projectId={pid}
        onBackToProjects={() => setScreen(isDirector ? "director" : "projects")}
        extraActions={[
          {
            icon: "📄",
            label: "Отчёт",
            onClick: () => setActiveTab("report"),
          },
          {
            icon: "🏆",
            label: "XP",
            onClick: () => setActiveTab("xp"),
          },
        ]}
      />

      {/* ── Таббар ── */}
      <TabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        showProjectCard
        userRoles={roles}
        extraTabs={
          isForeman
            ? [{ id: "ai", label: "ИИ", icon: "🤖" }]
            : []
        }
      />

      {/* ── Контент ── */}
      <div className="animate-fade-in">
        {renderTab()}
      </div>

      {/* ── ИИ-ассистент (FAB) — только не для прораба, у него своя вкладка ── */}
      {!isForeman && (
        <AIAssistant projectId={pid} projectName={projectName} userRole={userRole} />
      )}

      {/* ── PWA Install ── */}
      <InstallPWA />

      {/* ── Нижний отступ ── */}
      <div className="h-[70px]" />
    </div>
  );
};

export default Index;
