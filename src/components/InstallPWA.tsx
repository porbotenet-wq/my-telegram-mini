import { useState } from "react";
import { usePWA } from "@/hooks/usePWA";
import { Download, X, Share } from "lucide-react";

const InstallPWA = () => {
  const { canInstall, isInstalled, isIOS, promptInstall, dismissInstall, showBanner } = usePWA();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled || !showBanner) return null;

  // iOS guide
  if (isIOS && showIOSGuide) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur flex flex-col items-center justify-center p-6 animate-fade-in">
        <button onClick={() => setShowIOSGuide(false)} className="absolute top-4 right-4 text-muted-foreground">
          <X size={20} />
        </button>
        <div className="text-4xl mb-4">📲</div>
        <div className="text-[14px] font-bold text-foreground mb-6">Установка на iPhone</div>
        <div className="space-y-4 text-[12px] text-muted-foreground max-w-[280px]">
          <div className="flex items-start gap-3">
            <span className="text-primary font-bold">1.</span>
            <span>Нажмите <Share size={14} className="inline text-primary" /> внизу экрана Safari</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-primary font-bold">2.</span>
            <span>Прокрутите вниз и нажмите «На экран Домой»</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-primary font-bold">3.</span>
            <span>Нажмите «Добавить»</span>
          </div>
        </div>
      </div>
    );
  }

  if (!canInstall) return null;

  return (
    <div className="fixed bottom-[76px] left-3 right-3 z-[100] bg-card border border-border rounded-xl p-3 shadow-lg flex items-center gap-3 animate-fade-in">
      <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center text-primary flex-shrink-0">
        <Download size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-bold text-foreground">Установить STSphera</div>
        <div className="text-[9px] text-muted-foreground">Работайте офлайн, быстрый доступ</div>
      </div>
      <button
        onClick={() => (isIOS ? setShowIOSGuide(true) : promptInstall())}
        className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold flex-shrink-0"
      >
        {isIOS ? "Как?" : "Установить"}
      </button>
      <button onClick={dismissInstall} className="text-muted-foreground flex-shrink-0">
        <X size={14} />
      </button>
    </div>
  );
};

export default InstallPWA;
