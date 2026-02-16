import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  FileUp, FileText, Loader2, Sparkles, Trash2, Eye,
} from "lucide-react";

interface DocEntry {
  id: string;
  name: string;
  file_path: string;
  analysis: string | null;
  loading: boolean;
}

const Documents = () => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["application/pdf", "image/png", "image/jpeg"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Ошибка", description: "Поддерживаются PDF, PNG, JPEG", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Ошибка", description: "Максимум 20 МБ", variant: "destructive" });
      return;
    }

    setUploading(true);
    const filePath = `${crypto.randomUUID()}-${file.name}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("project-documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const newDoc: DocEntry = {
        id: crypto.randomUUID(),
        name: file.name,
        file_path: filePath,
        analysis: null,
        loading: false,
      };
      setDocs((prev) => [newDoc, ...prev]);
      toast({ title: "Загружено", description: file.name });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ошибка загрузки";
      toast({ title: "Ошибка", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const analyzeDoc = async (doc: DocEntry) => {
    setDocs((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, loading: true, analysis: null } : d))
    );

    try {
      const { data, error } = await supabase.functions.invoke("analyze-document", {
        body: {
          file_path: doc.file_path,
          prompt: customPrompt || undefined,
        },
      });

      if (error) throw error;

      if (data?.success) {
        setDocs((prev) =>
          prev.map((d) =>
            d.id === doc.id ? { ...d, loading: false, analysis: data.analysis } : d
          )
        );
        setExpandedId(doc.id);
        toast({ title: "Анализ завершён", description: doc.name });
      } else {
        throw new Error(data?.error || "Ошибка анализа");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ошибка анализа";
      setDocs((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, loading: false } : d))
      );
      toast({ title: "Ошибка", description: msg, variant: "destructive" });
    }
  };

  const removeDoc = (id: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <div className="animate-fade-in p-2.5 space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-t3 flex items-center gap-2">
        <FileText className="h-3 w-3" /> Документы и AI-анализ
        <span className="flex-1 h-px bg-border" />
      </div>

      {/* Upload area */}
      <div
        className="bg-bg2 border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/30 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          className="hidden"
          onChange={handleUpload}
        />
        {uploading ? (
          <Loader2 className="h-6 w-6 mx-auto text-primary animate-spin" />
        ) : (
          <FileUp className="h-6 w-6 mx-auto text-t3" />
        )}
        <p className="text-[11px] text-t2 mt-2 font-semibold">
          {uploading ? "Загрузка..." : "Нажмите для загрузки PDF, PNG или JPEG"}
        </p>
        <p className="text-[9px] text-t3 mt-0.5">Макс. 20 МБ</p>
      </div>

      {/* Custom prompt */}
      <div className="bg-bg2 border border-border rounded-lg p-3">
        <label className="text-[10px] font-semibold text-t2 uppercase tracking-wide mb-1 block">
          Промпт для анализа (опционально)
        </label>
        <Textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="Извлеки таблицу объёмов работ и список материалов..."
          className="bg-bg1 border-border text-[11px] h-16 resize-none"
        />
      </div>

      {/* Document list */}
      {docs.length === 0 && (
        <div className="text-center py-8">
          <FileText className="h-8 w-8 mx-auto text-t3 mb-2 opacity-40" />
          <p className="text-[11px] text-t3">Загрузите документ для анализа</p>
        </div>
      )}

      {docs.map((doc) => (
        <div key={doc.id} className="bg-bg2 border border-border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 p-3">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold truncate">{doc.name}</div>
              <div className="text-[9px] text-t3 font-mono">{doc.file_path.split("-").pop()}</div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => analyzeDoc(doc)}
                disabled={doc.loading}
              >
                {doc.loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                )}
              </Button>
              {doc.analysis && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                >
                  <Eye className="h-3.5 w-3.5 text-info" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => removeDoc(doc.id)}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>

          {/* Analysis result */}
          {expandedId === doc.id && doc.analysis && (
            <div className="border-t border-border p-3 bg-bg1">
              <div className="text-[10px] font-bold text-primary uppercase tracking-wide mb-2 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Результат анализа
              </div>
              <div className="text-[11px] text-t1 leading-relaxed whitespace-pre-wrap font-mono max-h-[400px] overflow-y-auto">
                {doc.analysis}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Help */}
      <div className="bg-bg1 border border-border rounded-lg p-3">
        <div className="text-[10px] font-bold text-t2 mb-1.5">Как использовать:</div>
        <ul className="text-[10px] text-t3 space-y-1 list-disc list-inside">
          <li>Загрузите PDF-чертёж или спецификацию</li>
          <li>Нажмите <Sparkles className="h-3 w-3 inline text-primary" /> для запуска AI-анализа</li>
          <li>Укажите свой промпт для целевого анализа</li>
          <li>Claude извлечёт таблицы, размеры, объёмы и материалы</li>
        </ul>
      </div>
    </div>
  );
};

export default Documents;
