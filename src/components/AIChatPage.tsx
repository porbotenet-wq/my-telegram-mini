import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowLeft, Plus, Bot, SendHorizontal, Trash2, MessageCircle,
} from "lucide-react";
import { format } from "date-fns";

interface AIChatPageProps {
  projectId: string;
  projectName: string;
  userRole: string;
  onBack?: () => void;
}

type Msg = { id?: string; role: "user" | "assistant"; content: string; created_at?: string };
type Conv = { id: string; title: string; updated_at: string; preview?: string };

const QUICK_QUESTIONS = [
  "Статус объекта",
  "Открытые алерты",
  "Прогресс монтажа",
  "Дефицит материалов",
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

const AIChatPage = ({ projectId, projectName, userRole, onBack }: AIChatPageProps) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<"list" | "chat">("list");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { loadConversations(); }, [projectId]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { if (view === "chat") inputRef.current?.focus(); }, [view]);

  const loadConversations = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("ai_conversations")
      .select("id, title, updated_at")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (!data) return;

    // Get last message preview for each conv
    const convs: Conv[] = [];
    for (const c of data.slice(0, 20)) {
      const { data: msgs } = await supabase
        .from("ai_messages")
        .select("content")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1);
      convs.push({ ...c, preview: msgs?.[0]?.content?.slice(0, 60) || "" });
    }
    setConversations(convs);
  };

  const openConversation = async (convId: string) => {
    setActiveConvId(convId);
    const { data } = await supabase
      .from("ai_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", convId)
      .order("created_at");
    setMessages(
      (data || [])
        .filter((m: any) => m.role !== "system")
        .map((m: any) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content, created_at: m.created_at }))
    );
    setView("chat");
  };

  const createNewConversation = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({ project_id: projectId, user_id: user.id, title: "Новый диалог" })
      .select()
      .single();
    if (error || !data) return;
    setActiveConvId(data.id);
    setMessages([]);
    setView("chat");
  };

  const deleteConversation = async (convId: string) => {
    await supabase.from("ai_conversations").delete().eq("id", convId);
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (activeConvId === convId) {
      setActiveConvId(null);
      setMessages([]);
      setView("list");
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading || !user) return;
    let convId = activeConvId;

    // Auto-create conversation if needed
    if (!convId) {
      const { data } = await supabase
        .from("ai_conversations")
        .insert({ project_id: projectId, user_id: user.id, title: text.trim().slice(0, 40) })
        .select()
        .single();
      if (!data) return;
      convId = data.id;
      setActiveConvId(convId);
    }

    const userMsg: Msg = { role: "user", content: text.trim() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setIsLoading(true);

    // Save user message
    await supabase.from("ai_messages").insert({
      conversation_id: convId,
      role: "user",
      content: text.trim(),
    });

    // Update conversation title if first message
    if (messages.length === 0) {
      await supabase.from("ai_conversations").update({ title: text.trim().slice(0, 40) }).eq("id", convId);
    }

    let assistantSoFar = "";
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: newMsgs.map((m) => ({ role: m.role, content: m.content })),
          projectId,
          projectName,
          userRole,
        }),
      });

      if (!resp.ok || !resp.body) {
        const errText = resp.status === 429
          ? "Слишком много запросов. Попробуйте позже."
          : resp.status === 402
            ? "Лимит запросов исчерпан."
            : "Ошибка AI. Попробуйте позже.";
        setMessages((prev) => [...prev, { role: "assistant", content: errText }]);
        setIsLoading(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      const upsert = (chunk: string) => {
        assistantSoFar += chunk;
        const content = assistantSoFar;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && !last.id) {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content } : m));
          }
          return [...prev, { role: "assistant", content }];
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsert(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Save assistant message
      if (assistantSoFar && convId) {
        await supabase.from("ai_messages").insert({
          conversation_id: convId,
          role: "assistant",
          content: assistantSoFar,
        });
      }
    } catch (e) {
      console.error("AI chat error:", e);
      setMessages((prev) => [...prev, { role: "assistant", content: "Ошибка соединения. Попробуйте позже." }]);
    }
    setIsLoading(false);
  };

  // ── Conversation list view ──
  if (view === "list") {
    return (
      <div className="animate-fade-in px-3 pt-4 pb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {onBack && (
              <button onClick={onBack} className="w-9 h-9 rounded-xl bg-bg2 flex items-center justify-center text-t2">
                <ArrowLeft size={18} />
              </button>
            )}
            <Bot size={20} className="text-primary" />
            <h2 className="text-[16px] font-bold text-t1">AI-помощник</h2>
          </div>
          <button
            onClick={createNewConversation}
            className="w-9 h-9 rounded-xl bg-bg2 flex items-center justify-center text-t2 active:scale-[0.95] transition-transform"
          >
            <Plus size={18} />
          </button>
        </div>

        {conversations.length === 0 ? (
          <div className="text-center py-12">
            <Bot size={48} className="mx-auto text-t3 opacity-20 mb-3" />
            <p className="text-[14px] text-t2 mb-1">Нет диалогов</p>
            <p className="text-[12px] text-t3 mb-4">Задайте вопрос об объекте</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={async () => {
                    await createNewConversation();
                    // sendMessage will be called after view change
                    setTimeout(() => sendMessage(q), 100);
                  }}
                  className="bg-bg1 rounded-xl px-3 py-2 text-[12px] text-t2 active:scale-[0.97] transition-transform"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className="flex items-center gap-3 p-3 bg-bg1 rounded-xl active:scale-[0.98] transition-transform"
              >
                <button className="flex-1 text-left min-w-0" onClick={() => openConversation(conv.id)}>
                  <div className="text-[14px] font-medium text-t1 truncate">{conv.title}</div>
                  {conv.preview && <div className="text-[11px] text-t2 truncate">{conv.preview}</div>}
                  <div className="text-[10px] text-t3 mt-0.5">
                    {format(new Date(conv.updated_at), "dd.MM.yy HH:mm")}
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                  className="text-t3 hover:text-destructive transition-colors flex-shrink-0 p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Chat view ──
  return (
    <div className="flex flex-col h-[calc(100vh-130px)] animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border flex-shrink-0">
        <button
          onClick={() => { setView("list"); loadConversations(); }}
          className="w-9 h-9 rounded-xl bg-bg2 flex items-center justify-center text-t2"
        >
          <ArrowLeft size={18} />
        </button>
        <Bot size={20} className="text-primary" />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold text-t1 truncate">AI-помощник</div>
          <div className="text-[9px] text-primary font-mono">{projectName}</div>
        </div>
        <button
          onClick={createNewConversation}
          className="w-9 h-9 rounded-xl bg-bg2 flex items-center justify-center text-t2"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[12px] text-t3 mb-4">Задайте вопрос об объекте</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="bg-bg1 rounded-xl px-3 py-2 text-[12px] text-t2 active:scale-[0.97] transition-transform"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md ml-auto font-medium"
                  : "bg-bg1 text-t1 rounded-2xl rounded-bl-md mr-auto border border-border"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex gap-1 px-4 py-3 bg-bg1 rounded-2xl rounded-bl-md w-fit border border-border">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 p-3 bg-bg0 border-t border-border flex-shrink-0">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          placeholder="Спросите про объект..."
          rows={1}
          className="flex-1 bg-bg1 border border-border rounded-xl px-4 py-3 text-foreground text-[14px] outline-none resize-none max-h-[100px] leading-relaxed focus:border-primary/30"
          onInput={(e) => {
            const t = e.target as HTMLTextAreaElement;
            t.style.height = "auto";
            t.style.height = Math.min(t.scrollHeight, 100) + "px";
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || isLoading}
          className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 transition-opacity disabled:opacity-40"
        >
          <SendHorizontal size={18} className="text-primary-foreground" />
        </button>
      </div>
    </div>
  );
};

export default AIChatPage;
