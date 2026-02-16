import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip } from "recharts";

const materials = [
  { n: "Кронштейн КР 1", t: "КР 1", nd: 1628, hv: 401, s: "deficit" },
  { n: "Кронштейн КР 2", t: "КР 2", nd: 1292, hv: 337, s: "deficit" },
  { n: "Анкер CAP12/30", t: "CAP12", nd: 3384, hv: 1050, s: "low" },
  { n: "Анкер CAP16/40", t: "CAP16", nd: 4308, hv: 960, s: "low" },
  { n: "Шайба Ш1", t: "Ш1", nd: 4308, hv: 1239, s: "low" },
  { n: "Планка ПЛ1", t: "ПЛ1", nd: 1308, hv: 187, s: "deficit" },
  { n: "Паронит 2мм", t: "п-2", nd: 120, hv: 120, s: "ok" },
  { n: "Болт DIN 933", t: "А2", nd: 2616, hv: 1864, s: "ok" },
  { n: "SILANDE MF 899", t: "MF899", nd: 500, hv: 0, s: "deficit" },
];

const modules = [
  { t: "МР-2.1-1", a: 1394, d: 123 }, { t: "МР-2.1-2", a: 336, d: 20 },
  { t: "МР-2.2-1", a: 258, d: 0 }, { t: "МР-1.1-1", a: 74, d: 53 },
  { t: "МР-3.1-1", a: 100, d: 0 }, { t: "МР-4.1-1", a: 100, d: 0 },
];

const pieData = [
  { name: "В наличии", value: 35 }, { name: "В пути", value: 20 },
  { name: "Заказано", value: 25 }, { name: "Дефицит", value: 20 },
];
const COLORS = ["#00d4aa", "#70a1ff", "#ffb347", "#ff4757"];

const statusLabel: Record<string, { text: string; cls: string }> = {
  ok: { text: "ОК", cls: "bg-primary/12 text-primary" },
  low: { text: "Мало", cls: "bg-warning/12 text-warning" },
  deficit: { text: "Дефицит", cls: "bg-destructive/12 text-destructive" },
};

const Supply = () => (
  <div className="animate-fade-in p-2.5">
    <div className="text-[10px] font-bold uppercase tracking-wider text-t3 my-3.5 flex items-center gap-2">
      Критические позиции <span className="flex-1 h-px bg-border" />
    </div>
    <div className="bg-bg2 border border-border rounded-lg p-3.5 mb-2.5">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              {["Материал", "Тип", "Нужно", "Есть", "Статус"].map((h) => (
                <th key={h} className="text-left text-[8px] font-bold uppercase tracking-wide text-t3 p-1.5 border-b border-border">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => {
              const st = statusLabel[m.s];
              const c = m.s === "ok" ? "text-primary" : m.s === "low" ? "text-warning" : "text-destructive";
              return (
                <tr key={m.t}>
                  <td className="p-2 border-b border-border font-semibold text-t1 text-[10px]">{m.n}</td>
                  <td className="p-2 border-b border-border font-mono text-[9px]">{m.t}</td>
                  <td className="p-2 border-b border-border font-mono text-center">{m.nd.toLocaleString()}</td>
                  <td className={`p-2 border-b border-border font-mono text-center font-semibold ${c}`}>{m.hv.toLocaleString()}</td>
                  <td className="p-2 border-b border-border"><span className={`font-mono text-[9px] px-1.5 py-0.5 rounded ${st.cls}`}>{st.text}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

    <div className="text-[10px] font-bold uppercase tracking-wider text-t3 my-3.5 flex items-center gap-2">
      Модули по типам <span className="flex-1 h-px bg-border" />
    </div>
    <div className="bg-bg2 border border-border rounded-lg p-3.5 mb-2.5">
      {modules.map((m) => {
        const p = Math.round((m.d / m.a) * 100);
        const barCls = p > 50 ? "from-primary to-[#00ff99]" : p > 0 ? "from-warning to-[#ffd700]" : "from-destructive to-[#ff6b81]";
        const c = p > 50 ? "text-primary" : p > 0 ? "text-warning" : "text-t3";
        return (
          <div key={m.t} className="mb-2.5 last:mb-0">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-semibold">
                {m.t} <span className="text-t3 font-normal text-[9px]">({m.a})</span>
              </span>
              <span className={`font-mono text-[11px] font-semibold ${c}`}>{m.d}/{m.a}</span>
            </div>
            <div className="h-[5px] bg-foreground/5 rounded-sm overflow-hidden">
              <div className={`h-full rounded-sm bg-gradient-to-r ${barCls}`} style={{ width: `${Math.max(p, 1)}%` }} />
            </div>
          </div>
        );
      })}
    </div>

    {/* Donut */}
    <div className="bg-bg2 border border-border rounded-lg p-3.5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wide text-t3">Снабжение — обзор</span>
      </div>
      <div className="h-[190px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={2}>
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i]} />
              ))}
            </Pie>
            <Legend wrapperStyle={{ fontSize: 9, fontFamily: "Manrope" }} />
            <Tooltip contentStyle={{ background: "#181828", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 10 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  </div>
);

export default Supply;
