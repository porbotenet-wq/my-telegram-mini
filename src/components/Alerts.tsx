import { useState } from "react";

const alerts = [
  { tp: "ug", ic: "🔴", t: "Дефект модуля при приемке", x: "Скол на стеклопакете, партия #47, МР-2.1-1", tm: "14:22", ac: ["📸 Фото", "📞 Производство"] },
  { tp: "ug", ic: "🔴", t: "Просрочка: план-факт отчёт", x: "Прораб Фасад 3 не сдал отчёт. Эскалация → РП.", tm: "13:15", ac: ["📞 Позвонить"] },
  { tp: "wn", ic: "⚠️", t: "Отставание: монтаж модулей", x: "Фасад 3, 5 этаж. План: 48, факт: 32 (-33%)", tm: "12:40", ac: ["📊 Детали", "👷 Бригада"] },
  { tp: "wn", ic: "⚠️", t: "Дефицит: Планка ПЛ1", x: "Остаток 187 из 1308. Заказать доп. партию.", tm: "11:30", ac: ["📦 Заказать"] },
  { tp: "", ic: "🚛", t: "Отгрузка М-006", x: "24 модуля Тип 1. Машина А567ВК. ETA: 14:30", tm: "10:55", ac: ["✅ Принять", "📞 Водитель"] },
  { tp: "", ic: "✅", t: "Сдача ТН: кронштейны, 5 эт", x: "Технадзор принял Фасад 1, 5 этаж.", tm: "10:20", ac: ["▶️ Начать модули"] },
  { tp: "", ic: "📊", t: "Еженедельный отчёт Н9", x: "Модули: 145/168 (86%). Кронштейны: 192/218 (88%)", tm: "09:00", ac: ["📈 Полный отчёт"] },
  { tp: "wn", ic: "⚠️", t: "Контроль качества", x: "Понедельник 10:00 — чек-лист Фасад 1", tm: "08:30", ac: ["📋 Чек-лист"] },
];

type Filter = "all" | "ug" | "wn" | "info";

const Alerts = () => {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = alerts.filter((a) => {
    if (filter === "all") return true;
    if (filter === "ug") return a.tp === "ug";
    if (filter === "wn") return a.tp === "wn";
    return a.tp === "";
  });

  const filterBtns: { id: Filter; label: string }[] = [
    { id: "all", label: "Все" },
    { id: "ug", label: "🔴 Критические" },
    { id: "wn", label: "⚠️ Предупреждения" },
    { id: "info", label: "ℹ️ Инфо" },
  ];

  return (
    <div className="animate-fade-in p-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-t3 my-3.5 flex items-center gap-2">
        Уведомления <span className="flex-1 h-px bg-border" />
      </div>

      <div className="flex gap-1 mb-2.5 flex-wrap">
        {filterBtns.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-2 py-1 rounded-sm font-sans text-[10px] font-bold transition-all ${
              filter === f.id
                ? "bg-primary text-primary-foreground"
                : "bg-bg1 text-t1 border border-border hover:bg-bg2"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.map((a, i) => (
        <div
          key={i}
          className={`flex gap-2 p-2.5 bg-bg1 rounded-sm mb-1.5 border-l-[3px] ${
            a.tp === "ug" ? "border-l-destructive" : a.tp === "wn" ? "border-l-warning" : "border-l-primary"
          }`}
        >
          <span className="text-base">{a.ic}</span>
          <div className="flex-1">
            <div className="text-[11px] font-semibold mb-0.5">{a.t}</div>
            <div className="text-[10px] text-t2 leading-snug">{a.x}</div>
            <div className="flex gap-1 mt-1 flex-wrap">
              {a.ac.map((btn) => (
                <button key={btn} className="px-1.5 py-0.5 rounded-sm bg-bg1 text-t1 border border-border font-sans text-[9px] font-bold hover:bg-bg2 transition-all">
                  {btn}
                </button>
              ))}
            </div>
            <div className="font-mono text-[9px] text-t3 mt-0.5">{a.tm}</div>
          </div>
        </div>
      ))}

      {/* Escalation */}
      <div className="text-[10px] font-bold uppercase tracking-wider text-t3 my-3.5 flex items-center gap-2">
        Эскалации <span className="flex-1 h-px bg-border" />
      </div>
      <div className="bg-bg2 border border-border rounded-lg p-3.5">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[8px] text-t3 mb-0.5">УРОВЕНЬ 1</div>
            <div className="text-[10px] font-semibold text-primary">Исполнитель</div>
            <div className="font-mono text-[9px] text-t3">0-4 ч</div>
          </div>
          <div>
            <div className="text-[8px] text-t3 mb-0.5">УРОВЕНЬ 2</div>
            <div className="text-[10px] font-semibold text-warning">Рук. проекта</div>
            <div className="font-mono text-[9px] text-t3">4-24 ч</div>
          </div>
          <div>
            <div className="text-[8px] text-t3 mb-0.5">УРОВЕНЬ 3</div>
            <div className="text-[10px] font-semibold text-destructive">Директор</div>
            <div className="font-mono text-[9px] text-t3">&gt; 24 ч</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Alerts;
