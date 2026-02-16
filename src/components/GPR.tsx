import { useState } from "react";

const works = [
  { n: "Бурение Ø12", a: 5015, wk: [400, 400, 400, 400], c: "#00d4aa" },
  { n: "Бурение Ø16", a: 5015, wk: [400, 400, 400, 400], c: "#00d4aa" },
  { n: "Кронш. Н", a: 2608, wk: [200, 200, 200, 200], c: "#ffb347" },
  { n: "Кронш. В", a: 160, wk: [15, 15, 15, 15], c: "#ffb347" },
  { n: "Геодезия", a: 68, wk: [5, 5, 5, 5], c: "#70a1ff" },
  { n: "Сдача ТН(кр)", a: 68, wk: [5, 5, 5, 5], c: "#ff4757" },
  { n: "Модули СПК", a: 2006, wk: [177, 177, 118, 118], c: "#00ffaa" },
  { n: "Уплотнитель", a: 8024, wk: [708, 708, 472, 472], c: "#70a1ff" },
  { n: "Герметизация", a: 2808, wk: [248, 248, 165, 165], c: "#ffb347" },
  { n: "Сдача ТН(эт)", a: 68, wk: [5, 5, 5, 5], c: "#ff4757" },
];

const sequence = [
  { label: "1.Бурение Ø12", cls: "bg-primary/12 text-primary" },
  { label: "2.Бурение Ø16", cls: "bg-primary/12 text-primary" },
  { label: "3.Кронш.Н", cls: "bg-warning/12 text-warning" },
  { label: "4.Кронш.В", cls: "bg-warning/12 text-warning" },
  { label: "5.Геодезия", cls: "bg-info/12 text-info" },
  { label: "6.Сдача ТН", cls: "bg-destructive/12 text-destructive" },
  { label: "7.Модули", cls: "bg-primary/20 text-[#0fa]" },
  { label: "8.Уплотн.", cls: "bg-info/12 text-info" },
  { label: "9.Герметиз.", cls: "bg-warning/12 text-warning" },
  { label: "10.Сдача ТН", cls: "bg-destructive/12 text-destructive" },
];

const mx = Math.max(...works.map((w) => w.a));

const GPR = () => {
  const [week, setWeek] = useState(10);

  return (
    <div className="animate-fade-in p-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-t3 my-3.5 flex items-center gap-2">
        График производства работ <span className="flex-1 h-px bg-border" />
      </div>

      <div className="flex items-center justify-center gap-2.5 mb-2.5">
        <button onClick={() => setWeek((w) => Math.max(1, w - 1))} className="w-7 h-7 rounded-full bg-bg1 border border-border text-t2 flex items-center justify-center cursor-pointer hover:bg-primary/12 hover:text-primary hover:border-primary/25 transition-all">‹</button>
        <div className="font-mono text-[11px] font-semibold min-w-[110px] text-center">Неделя {week}</div>
        <button onClick={() => setWeek((w) => Math.min(13, w + 1))} className="w-7 h-7 rounded-full bg-bg1 border border-border text-t2 flex items-center justify-center cursor-pointer hover:bg-primary/12 hover:text-primary hover:border-primary/25 transition-all">›</button>
      </div>

      {/* Gantt */}
      <div className="bg-bg2 border border-border rounded-lg p-3.5 mb-2.5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-t3">Gantt-диаграмма</span>
        </div>
        {works.map((w) => {
          const wd = (w.a / mx) * 80 + 10;
          return (
            <div key={w.n} className="flex items-center gap-1.5 mb-1.5 text-[10px]">
              <div className="w-20 flex-shrink-0 text-[9px] text-t2 text-right whitespace-nowrap overflow-hidden text-ellipsis">{w.n}</div>
              <div className="flex-1 h-5 bg-foreground/[0.03] rounded-sm relative overflow-hidden">
                <div
                  className="absolute top-[1px] bottom-[1px] rounded-sm flex items-center px-1.5 font-mono text-[8px] font-semibold whitespace-nowrap"
                  style={{
                    width: `${wd}%`,
                    background: `${w.c}30`,
                    border: `1px solid ${w.c}50`,
                    color: w.c,
                  }}
                >
                  {w.a.toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Weekly breakdown */}
      <div className="bg-bg2 border border-border rounded-lg p-3.5 mb-2.5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-t3">Понедельная разбивка</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr>
                {["Работа", "Всего", "Н9", "Н10", "Н11", "Н12"].map((h) => (
                  <th key={h} className="text-left text-[8px] font-bold uppercase tracking-wide text-t3 p-1.5 border-b border-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {works.map((w) => (
                <tr key={w.n}>
                  <td className="p-2 border-b border-border font-semibold text-t1 text-[10px] whitespace-nowrap">{w.n}</td>
                  <td className="p-2 border-b border-border font-mono text-[9px]">{w.a.toLocaleString()}</td>
                  {w.wk.map((v, i) => (
                    <td key={i} className="p-2 border-b border-border font-mono text-[9px] text-center">{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sequence */}
      <div className="bg-bg2 border border-border rounded-lg p-3.5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-t3">Последовательность работ</span>
        </div>
        <div className="flex flex-wrap gap-1 items-center text-[9px] py-1.5">
          {sequence.map((s, i) => (
            <span key={i} className="contents">
              <span className={`px-1.5 py-0.5 rounded-sm font-semibold ${s.cls}`}>{s.label}</span>
              {i < sequence.length - 1 && <span className="text-t3">→</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GPR;
