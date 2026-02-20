// src/components/PTODashboard.tsx
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileCheck, FileText, Inbox } from "lucide-react";

interface Props { projectId: string; }

const PTODashboard = ({ projectId }: Props) => {
  const [loading, setLoading] = useState(true);
  const [aosrDocs, setAosrDocs] = useState<any[]>([]);
  const [execSchemes, setExecSchemes] = useState(0);
  const [pendingInbox, setPendingInbox] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const [docsRes, execRes, inboxRes] = await Promise.all([
          supabase.from("documents")
            .select("id, name, category, created_at")
            .eq("project_id", projectId)
            .in("category", ["aosr_brackets", "aosr_frame", "aosr_glass", "aosr"])
            .order("created_at", { ascending: false })
            .limit(20),
          supabase.from("documents")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId)
            .eq("category", "exec_scheme"),
          supabase.from("bot_inbox")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId)
            .eq("status", "new"),
        ]);

        setAosrDocs(docsRes.data || []);
        setExecSchemes(execRes.count || 0);
        setPendingInbox(inboxRes.count || 0);
      } catch (e) {
        console.error("PTODashboard error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 animate-fade-in">
      <div className="px-1 pt-2 pb-1">
        <div className="text-[16px] font-bold text-foreground">📐 Панель ПТО</div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <FileCheck size={16} className="mx-auto text-primary mb-1" />
          <div className="text-[20px] font-bold text-foreground">{aosrDocs.length}</div>
          <div className="text-[8px] text-muted-foreground">АОСР</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <FileText size={16} className="mx-auto text-primary mb-1" />
          <div className="text-[20px] font-bold text-foreground">{execSchemes}</div>
          <div className="text-[8px] text-muted-foreground">Исп. схемы</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <Inbox size={16} className="mx-auto text-amber-500 mb-1" />
          <div className="text-[20px] font-bold text-foreground">{pendingInbox}</div>
          <div className="text-[8px] text-muted-foreground">Входящие</div>
        </div>
      </div>

      {/* AOSR registry */}
      <div className="bg-card border border-border rounded-xl p-3">
        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Реестр АОСР</div>
        {aosrDocs.length === 0 ? (
          <div className="text-[10px] text-muted-foreground py-4 text-center">Нет документов АОСР</div>
        ) : (
          <div className="space-y-2">
            {aosrDocs.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-[10px]">
                <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                <span className="text-foreground truncate flex-1">{d.name}</span>
                <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">{d.category}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PTODashboard;
