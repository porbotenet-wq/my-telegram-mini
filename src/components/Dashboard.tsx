import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Area, AreaChart,
} from "recharts";

const chartData = [
  { w: "Н1", plan: 168, fact: 25 }, { w: "Н2", plan: 336, fact: 145 },
  { w: "Н3", plan: 504, fact: 280 }, { w: "Н4", plan: 672, fact: 410 },
  { w: "Н5", plan: 840, fact: 520 }, { w: "Н6", plan: 1008, fact: 640 },
  { w: "Н7", plan: 1176, fact: 780 }, { w: "Н8", plan: 1344, fact: 920 },
  { w: "Н9", plan: 1512, fact: 1040 }, { w: "Н10", plan: 1680, fact: null },
  { w: "Н11", plan: 1848, fact: null }, { w: "Н12", plan: 2006, fact: null },
  { w: "Н13", plan: 2006, fact: null },
];

const kpis = [
  { label: "Модули СПК", value: "201", sub: "из 2 486 шт", color: "primary" },
  { label: "Кронштейны", value: "534", sub: "из 2 920 компл", color: "warning" },
  { label: "Герметизация", value: "450", sub: "из 2 836 м.п.", color: "info" },
  { label: "Просрочки", value: "3", sub: "задачи", color: "destructive" },
];

const progress = [
  { label: "Модули СПК", pct: 8.1, color: "primary" },
  { label: "Кронштейны", pct: 18.3, color: "warning" },
  { label: "Уплотнитель", pct: 12.4, color: "info" },
  { label: "Герметизация", pct: 15.9, color: "destructive" },
];

const facades = [
  { name: "Фасад 1", val: 885 }, { name: "Фасад 2", val: 25 },
  { name: "Фасад 3", val: 338 }, { name: "Углы", val: 68 },
];

const events = [
  { icon: "🚛", title: "Отгрузка партии М-006", desc: "24 модуля Тип 1 — в пути. ETA: 14:30", time: "12 мин назад", type: "" },
  { icon: "⚠️", title: "Отставание: Фасад 3, 8 этаж", desc: "Герметизация: план 200 м.п., факт 140 м.п.", time: "48 мин назад", type: "warning" },
  { icon: "🔴", title: "Дефект при приемке", desc: "Скол на модуле МР-2.1-1, партия #47", time: "1 ч назад", type: "danger" },
];

const colorMap: Record<string, string> = {
  primary: "text-primary",
  warning: "text-warning",
  info: "text-info",
  destructive: "text-destructive",
};

const barColorMap: Record<string, string> = {
  primary: "from-primary to-[#00ff99]",
  warning: "from-warning to-[#ffd700]",
  info: "from-info to-[#7bed9f]",
  destructive: "from-destructive to-[#ff6b81]",
};

const accentBorderMap: Record<string, string> = {
  primary: "after:bg-primary",
  warning: "after:bg-warning",
  info: "after:bg-info",
  destructive: "after:bg-destructive",
};

const Dashboard = () => {
  const [activeFacade, setActiveFacade] = useState(0);

  return (
    <div className="animate-fade-in p-2.5">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2.5">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="bg-bg2 border border-border rounded-lg p-3 relative overflow-hidden
              before:content-[''] before:absolute before:top-0 before:left-0 before:w-[3px] before:h-full before:rounded-r"
            style={{ ["--tw-before-bg" as string]: `var(--${k.color})` }}
          >
            <div className={`absolute top-0 left-0 w-[3px] h-full rounded-r ${k.color === "primary" ? "bg-primary" : k.color === "warning" ? "bg-warning" : k.color === "info" ? "bg-info" : "bg-destructive"}`} />
            <div className="text-[9px] font-semibold text-t2 uppercase tracking-wide mb-1">{k.label}</div>
            <div className={`font-mono text-[22px] font-bold leading-none mb-0.5 ${colorMap[k.color]}`}>{k.value}</div>
            <div className="font-mono text-[9px] text-t3">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Progress Card */}
      <div className="bg-bg2 border border-border rounded-lg p-3.5 mb-2.5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-t3">Общий прогресс</span>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-primary/12 text-primary">День 67/90</span>
        </div>
        {progress.map((p) => (
          <div key={p.label} className="mb-2.5 last:mb-0">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] font-semibold">{p.label}</span>
              <span className={`font-mono text-[11px] font-semibold ${colorMap[p.color]}`}>{p.pct}%</span>
            </div>
            <div className="h-[5px] bg-foreground/5 rounded-sm overflow-hidden">
              <div
                className={`h-full rounded-sm bg-gradient-to-r ${barColorMap[p.color]} transition-all duration-1000`}
                style={{ width: `${p.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Facades */}
      <div className="text-[10px] font-bold uppercase tracking-wider text-t3 my-3.5 flex items-center gap-2">
        Фасады <span className="flex-1 h-px bg-border" />
      </div>
      <div className="grid grid-cols-4 gap-1.5 mb-2.5">
        {facades.map((f, i) => (
          <button
            key={f.name}
            onClick={() => setActiveFacade(i)}
            className={`bg-bg1 border rounded-sm p-2 text-center cursor-pointer transition-all duration-200 ${
              activeFacade === i
                ? "border-primary/25 bg-primary/12"
                : "border-border hover:border-primary/25 hover:bg-primary/12"
            }`}
          >
            <div className="text-[9px] font-bold mb-0.5">{f.name}</div>
            <div className="font-mono text-[15px] font-bold text-primary leading-none">{f.val}</div>
            <div className="text-[8px] text-t3 mt-0.5">модулей</div>
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-bg2 border border-border rounded-lg p-3.5 mb-2.5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-t3">План vs Факт (модули)</span>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-info/12 text-info">13 нед</span>
        </div>
        <div className="h-[190px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis dataKey="w" tick={{ fill: "#555570", fontSize: 8, fontFamily: "JetBrains Mono" }} />
              <YAxis tick={{ fill: "#555570", fontSize: 8, fontFamily: "JetBrains Mono" }} />
              <Tooltip
                contentStyle={{ background: "#181828", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 10 }}
                labelStyle={{ color: "#8888a0" }}
              />
              <Legend wrapperStyle={{ fontSize: 9, fontFamily: "Manrope" }} />
              <Area type="monotone" dataKey="plan" name="План" stroke="rgba(112,161,255,0.6)" fill="rgba(112,161,255,0.04)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="fact" name="Факт" stroke="#00d4aa" fill="rgba(0,212,170,0.08)" strokeWidth={2} connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Events */}
      <div className="text-[10px] font-bold uppercase tracking-wider text-t3 my-3.5 flex items-center gap-2">
        Последние события <span className="flex-1 h-px bg-border" />
      </div>
      {events.map((e, i) => (
        <div
          key={i}
          className={`flex gap-2 p-2.5 bg-bg1 rounded-sm mb-1.5 border-l-[3px] ${
            e.type === "warning" ? "border-l-warning" : e.type === "danger" ? "border-l-destructive" : "border-l-primary"
          }`}
        >
          <span className="text-base">{e.icon}</span>
          <div className="flex-1">
            <div className="text-[11px] font-semibold mb-0.5">{e.title}</div>
            <div className="text-[10px] text-t2 leading-snug">{e.desc}</div>
            <div className="font-mono text-[9px] text-t3 mt-0.5">{e.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Dashboard;
