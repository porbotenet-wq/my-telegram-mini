import { useEffect, useState } from "react";

const TopBar = () => {
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => {
      const n = new Date();
      setTime(
        n.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) +
          " · " +
          n.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
      );
    };
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="sticky top-0 z-50 bg-bg0/88 backdrop-blur-[20px] border-b border-border px-3.5 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="bg-primary/12 border border-primary/25 text-primary font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded tracking-widest">
          LIVE
        </span>
        <span className="text-[15px] font-bold tracking-tight">СИТИ 4</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-[7px] h-[7px] rounded-full bg-primary shadow-[0_0_8px_hsl(163_100%_42%/0.25)] animate-pulse-dot" />
        <span className="font-mono text-[10px] text-t2">{time}</span>
      </div>
    </div>
  );
};

export default TopBar;
