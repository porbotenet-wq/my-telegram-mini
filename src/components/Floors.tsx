import { useState } from "react";

const floorStatus: Record<number, string[]> = {
  2: ["dn", "dn", "dn", "dn"], 3: ["dn", "dn", "dn", "dn"],
  4: ["dn", "dn", "ip", "dn"], 5: ["dn", "dn", "ip", "ip"],
  6: ["ip", "dn", "ip", "ip"], 7: ["ip", "ns", "ns", "ns"],
  8: ["ip", "ns", "bl", "ns"],
};
const floorPct: Record<number, number[]> = {
  2: [100, 100, 85, 100], 3: [100, 100, 72, 90],
  4: [95, 100, 45, 80], 5: [88, 100, 30, 55],
  6: [60, 100, 20, 35], 7: [40, 0, 0, 0], 8: [25, 0, 0, 0],
};

const cellStyle: Record<string, string> = {
  dn: "bg-primary/12 text-primary border-primary/25",
  ip: "bg-warning/12 text-warning border-warning/30 animate-pulse-cell",
  ns: "bg-foreground/[0.02] text-t3 border-transparent",
  bl: "bg-destructive/12 text-destructive border-transparent",
};

const getFloorDetail = (f: number) => [
  { n: "Бурение Ø12", u: "шт", p: 130, f: f <= 6 ? 130 : f === 7 ? 85 : 0 },
  { n: "Бурение Ø16", u: "шт", p: 130, f: f <= 6 ? 130 : f === 7 ? 80 : 0 },
  { n: "Кронштейны Н", u: "компл", p: 67, f: f <= 5 ? 67 : f === 6 ? 42 : 0 },
  { n: "Кронштейны В", u: "компл", p: 4, f: f <= 5 ? 4 : 0 },
  { n: "Геодезия", u: "точка", p: 1, f: f <= 5 ? 1 : 0 },
  { n: "Сдача ТН (кр)", u: "этаж", p: 1, f: f <= 4 ? 1 : 0 },
  { n: "Модули СПК", u: "шт", p: 52, f: f <= 4 ? 52 : f === 5 ? 38 : 0 },
  { n: "Уплотнитель", u: "м.п.", p: 208, f: f <= 3 ? 208 : f === 4 ? 150 : 0 },
  { n: "Герметизация", u: "м.п.", p: 72.8, f: f <= 3 ? 72.8 : f === 4 ? 40 : 0 },
  { n: "Сдача ТН (эт)", u: "этаж", p: 1, f: f <= 3 ? 1 : 0 },
];

const Floors = () => {
  const [selectedFloor, setSelectedFloor] = useState(5);
  const detail = getFloorDetail(selectedFloor);

  return (
    <div className="animate-fade-in p-2.5">
      <div className="bg-bg2 border border-border rounded-lg p-3.5 mb-2.5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-t3">Матрица по этажам</span>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-primary/12 text-primary">Все фасады</span>
        </div>
        <div className="flex gap-2.5 mb-2.5 flex-wrap">
          {[
            { color: "bg-primary", label: "Готово" },
            { color: "bg-warning", label: "В работе" },
            { color: "bg-foreground/[0.06]", label: "Не начат" },
            { color: "bg-destructive", label: "Проблема" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1 text-[9px] text-t2">
              <div className={`w-[7px] h-[7px] rounded-sm ${l.color}`} />
              {l.label}
            </div>
          ))}
        </div>
        {/* Header */}
        <div className="grid grid-cols-[28px_repeat(4,1fr)] gap-0.5 text-[8px] font-mono font-semibold text-t3 mb-1">
          <div />
          <div className="text-center">Ф1</div>
          <div className="text-center">Ф2</div>
          <div className="text-center">Ф3</div>
          <div className="text-center">Ф4</div>
        </div>
        {/* Grid */}
        {Array.from({ length: 17 }, (_, i) => 18 - i).map((floor) => {
          const st = floorStatus[floor] || ["ns", "ns", "ns", "ns"];
          const pc = floorPct[floor] || [0, 0, 0, 0];
          return (
            <div key={floor} className="grid grid-cols-[28px_repeat(4,1fr)] gap-0.5 mb-0.5">
              <div className="font-mono font-semibold text-t3 text-[8px] flex items-center justify-center">{floor}</div>
              {st.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedFloor(floor)}
                  className={`h-6 rounded-sm flex items-center justify-center font-mono text-[8px] font-semibold cursor-pointer transition-all duration-200 border hover:scale-105 ${cellStyle[s]}`}
                >
                  {pc[i] > 0 ? `${pc[i]}%` : "—"}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {/* Floor detail */}
      <div className="bg-bg2 border border-border rounded-lg p-3.5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-t3">Детализация этажа</span>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-warning/12 text-warning">Этаж {selectedFloor}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr>
                {["Работа", "Ед.", "План", "Факт", "%"].map((h) => (
                  <th key={h} className="text-left text-[8px] font-bold uppercase tracking-wide text-t3 p-1.5 border-b border-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detail.map((row) => {
                const pct = row.p > 0 ? Math.round((row.f / row.p) * 100) : 0;
                const c = pct >= 100 ? "text-primary" : pct > 0 ? "text-warning" : "text-t3";
                return (
                  <tr key={row.n} className="last:border-0">
                    <td className="p-2 border-b border-border font-semibold text-t1">{row.n}</td>
                    <td className="p-2 border-b border-border text-t2">{row.u}</td>
                    <td className="p-2 border-b border-border font-mono text-center">{row.p}</td>
                    <td className={`p-2 border-b border-border font-mono text-center font-semibold ${c}`}>{row.f}</td>
                    <td className={`p-2 border-b border-border font-mono text-center font-bold ${c}`}>{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Floors;
