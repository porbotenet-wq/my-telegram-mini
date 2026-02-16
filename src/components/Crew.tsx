import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, Legend, Tooltip } from "recharts";

const brigades = [
  { id: "BR01", n: "Бригада №1 — Бурение", s: "Бурение Ø12, Ø16", p: 6, t: 12, d: 8, r: 92 },
  { id: "BR02", n: "Бригада №2 — Кронштейны", s: "Монтаж кронштейнов", p: 8, t: 10, d: 7, r: 88 },
  { id: "BR03", n: "Бригада №3 — Монтаж СПК", s: "Монтаж модулей СПК", p: 12, t: 8, d: 4, r: 75 },
  { id: "BR04", n: "Бригада №4 — Герметизация", s: "Уплотнитель, герметизация", p: 6, t: 6, d: 4, r: 85 },
  { id: "BR05", n: "Бригада №5 — Утепление", s: "Утепление за витражом", p: 6, t: 4, d: 3, r: 90 },
  { id: "BR06", n: "Бригада №6 — Ламели", s: "Декоративные элементы", p: 4, t: 0, d: 0, r: 0 },
  { id: "BR07", n: "Геодезист", s: "Геодезический контроль", p: 2, t: 5, d: 5, r: 100 },
];

const tasks = [
  { t: "Бурение Ø12 — Фасад 1, 7 этаж", m: "BR01 · 130 шт", pc: "bg-warning", st: "В работе", sb: "bg-warning/12 text-warning" },
  { t: "Кронштейны — Фасад 1, 6 этаж", m: "BR02 · 67 компл", pc: "bg-primary", st: "Готово", sb: "bg-primary/12 text-primary" },
  { t: "Модули — Фасад 3, 5 этаж", m: "BR03 · 48 шт", pc: "bg-destructive", st: "Задержка", sb: "bg-destructive/12 text-destructive" },
  { t: "Герметизация — Фасад 1, 4 эт", m: "BR04 · 72.8 м.п.", pc: "bg-info", st: "В работе", sb: "bg-warning/12 text-warning" },
  { t: "Геодезия — Фасад 1, 6 этаж", m: "BR07 · 1 точка", pc: "bg-primary", st: "Готово", sb: "bg-primary/12 text-primary" },
];

const radarData = [
  { subject: "Скорость", BR01: 90, BR03: 65, BR04: 80 },
  { subject: "Качество", BR01: 85, BR03: 80, BR04: 90 },
  { subject: "Дисциплина", BR01: 95, BR03: 70, BR04: 85 },
  { subject: "Безопасн.", BR01: 90, BR03: 85, BR04: 88 },
  { subject: "Отчётность", BR01: 88, BR03: 60, BR04: 82 },
];

const Crew = () => (
  <div className="animate-fade-in p-2.5">
    <div className="text-[10px] font-bold uppercase tracking-wider text-t3 my-3.5 flex items-center gap-2">
      Активные бригады <span className="flex-1 h-px bg-border" />
    </div>

    {brigades.map((b) => {
      const c = b.r >= 90 ? "text-primary" : b.r >= 75 ? "text-warning" : b.r > 0 ? "text-destructive" : "text-t3";
      return (
        <div key={b.id} className="bg-bg1 border border-border rounded-sm p-2.5 mb-1.5 cursor-pointer hover:border-foreground/10 transition-all">
          <div className="flex justify-between items-center mb-1.5">
            <div className="text-xs font-bold">{b.n}</div>
            <div className={`font-mono text-[10px] ${c}`}>{b.r > 0 ? `★ ${b.r}%` : "Ожидание"}</div>
          </div>
          <div className="text-[9px] text-t3 mb-1.5">{b.s}</div>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div>
              <div className="font-mono text-[13px] font-bold text-info">{b.p}</div>
              <div className="text-[8px] text-t3">чел</div>
            </div>
            <div>
              <div className="font-mono text-[13px] font-bold text-warning">{b.t}</div>
              <div className="text-[8px] text-t3">задач</div>
            </div>
            <div>
              <div className="font-mono text-[13px] font-bold text-primary">{b.d}</div>
              <div className="text-[8px] text-t3">готово</div>
            </div>
          </div>
        </div>
      );
    })}

    {/* Radar chart */}
    <div className="bg-bg2 border border-border rounded-lg p-3.5 mb-2.5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wide text-t3">Эффективность бригад</span>
        <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-info/12 text-info">Н10</span>
      </div>
      <div className="h-[190px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData}>
            <PolarGrid stroke="rgba(255,255,255,0.05)" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: "#8888a0", fontSize: 8 }} />
            <Radar name="BR01" dataKey="BR01" stroke="#00d4aa" fill="rgba(0,212,170,0.08)" />
            <Radar name="BR03" dataKey="BR03" stroke="#ff4757" fill="rgba(255,71,87,0.08)" />
            <Radar name="BR04" dataKey="BR04" stroke="#ffb347" fill="rgba(255,179,71,0.08)" />
            <Legend wrapperStyle={{ fontSize: 9 }} />
            <Tooltip contentStyle={{ background: "#181828", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 10 }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>

    {/* Tasks */}
    <div className="text-[10px] font-bold uppercase tracking-wider text-t3 my-3.5 flex items-center gap-2">
      Задачи на сегодня <span className="flex-1 h-px bg-border" />
    </div>
    {tasks.map((tk, i) => (
      <div key={i} className="flex items-start gap-2 p-2.5 rounded-sm bg-bg1 mb-1.5 cursor-pointer hover:border-border border border-transparent transition-all">
        <div className={`w-[3px] min-h-[30px] rounded-sm flex-shrink-0 ${tk.pc}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold mb-0.5">{tk.t}</div>
          <div className="text-[9px] text-t3">{tk.m}</div>
        </div>
        <div className={`font-mono text-[9px] px-1.5 py-0.5 rounded-sm flex-shrink-0 self-center ${tk.sb}`}>{tk.st}</div>
      </div>
    ))}
  </div>
);

export default Crew;
