import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const weekData: Record<number, string> = {
  9: "3-9 фев", 10: "10-16 фев", 11: "17-23 фев", 12: "24 фев-2 мар",
};

const planRows = [
  { name: "Бурение Ø12", plan: "130 шт" },
  { name: "Бурение Ø16", plan: "130 шт" },
  { name: "Кронштейны Н", plan: "67 компл" },
  { name: "Кронштейны В", plan: "4 компл" },
  { name: "Модули СПК", plan: "52 шт" },
  { name: "Уплотнитель", plan: "208 м.п." },
  { name: "Герметизация", plan: "72.8 м.п." },
];

const barData = Array.from({ length: 14 }, (_, i) => ({
  day: `${i + 3} фев`,
  plan: 24,
  fact: i < 10 ? Math.floor(18 + Math.random() * 10) : 0,
}));

const PlanFact = () => {
  const [week, setWeek] = useState(10);
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="animate-fade-in p-2.5">
      {/* Search */}
      <div className="bg-bg1 border border-border rounded-sm px-3 py-2 flex items-center gap-1.5 mb-2.5">
        <span>🔍</span>
        <input
          placeholder="Поиск по работам..."
          className="flex-1 bg-transparent border-none outline-none text-t1 font-sans text-xs placeholder:text-t3"
        />
      </div>

      {/* Week selector */}
      <div className="flex items-center justify-center gap-2.5 mb-2.5">
        <button onClick={() => setWeek((w) => Math.max(1, w - 1))} className="w-7 h-7 rounded-full bg-bg1 border border-border text-t2 flex items-center justify-center cursor-pointer hover:bg-primary/12 hover:text-primary hover:border-primary/25 transition-all">‹</button>
        <div className="font-mono text-[11px] font-semibold min-w-[110px] text-center">
          Н{week} · {weekData[week] || ""}
        </div>
        <button onClick={() => setWeek((w) => Math.min(13, w + 1))} className="w-7 h-7 rounded-full bg-bg1 border border-border text-t2 flex items-center justify-center cursor-pointer hover:bg-primary/12 hover:text-primary hover:border-primary/25 transition-all">›</button>
      </div>

      {/* Data entry */}
      <div className="bg-bg2 border border-border rounded-lg p-3.5 mb-2.5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-t3">Ввод данных за день</span>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-primary/12 text-primary">16 фев</span>
        </div>
        <div className="grid grid-cols-[1fr_70px_70px] gap-1.5 items-center py-1.5 border-b-2 border-border font-bold text-[9px] text-t3">
          <span>РАБОТА</span><span className="text-center">ПЛАН</span><span className="text-center">ФАКТ</span>
        </div>
        {planRows.map((r) => (
          <div key={r.name} className="grid grid-cols-[1fr_70px_70px] gap-1.5 items-center py-1.5 border-b border-border text-[11px]">
            <span className="text-t1 font-semibold">{r.name}</span>
            <span className="text-center text-t3">{r.plan}</span>
            <input
              type="number"
              placeholder="0"
              className="bg-bg1 border border-border rounded px-2 py-1 text-t1 font-mono text-[11px] w-full text-center outline-none focus:border-primary transition-colors"
            />
          </div>
        ))}
        <div className="flex gap-1.5 mt-3">
          <button
            onClick={() => setShowModal(true)}
            className="flex-1 py-2 px-3.5 rounded-sm bg-primary text-primary-foreground font-sans text-[11px] font-bold cursor-pointer hover:brightness-110 transition-all"
          >
            ✅ Отправить
          </button>
          <button className="py-2 px-3.5 rounded-sm bg-bg1 text-t1 border border-border font-sans text-[11px] font-bold cursor-pointer hover:bg-bg2 transition-all">
            📸
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-bg2 border border-border rounded-lg p-3.5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-t3">Накопительный итог</span>
        </div>
        <div className="h-[190px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis dataKey="day" tick={{ fill: "#555570", fontSize: 8, fontFamily: "JetBrains Mono" }} />
              <YAxis tick={{ fill: "#555570", fontSize: 8, fontFamily: "JetBrains Mono" }} />
              <Tooltip contentStyle={{ background: "#181828", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 10 }} />
              <Legend wrapperStyle={{ fontSize: 9 }} />
              <Bar dataKey="plan" name="План" fill="rgba(112,161,255,0.25)" radius={2} />
              <Bar dataKey="fact" name="Факт" fill="rgba(0,212,170,0.5)" radius={2} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-end" onClick={() => setShowModal(false)}>
          <div className="w-full max-h-[85vh] bg-bg2 rounded-t-[18px] p-3.5 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="w-8 h-[3px] bg-foreground/15 rounded-full mx-auto mb-3" />
            <div className="text-[15px] font-bold mb-3">✅ Отчёт отправлен</div>
            <div className="text-center py-4">
              <div className="text-[40px] mb-2.5">📊</div>
              <div className="text-[13px] font-semibold mb-1.5">Данные сохранены</div>
              <div className="text-[11px] text-t2">
                {new Date().toLocaleDateString("ru-RU")} · {new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
            <button onClick={() => setShowModal(false)} className="w-full py-2 px-3.5 rounded-sm bg-primary text-primary-foreground font-sans text-[11px] font-bold cursor-pointer">
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanFact;
