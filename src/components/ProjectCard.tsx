interface ProjectCardProps {
  onBack: () => void;
}

const workTypeLabels: Record<string, { text: string; cls: string }> = {
  spk: { text: "СПК", cls: "bg-primary/12 text-primary" },
  nvf: { text: "НВФ", cls: "bg-info/12 text-info" },
  both: { text: "НВФ + СПК", cls: "bg-warning/12 text-warning" },
};

const projectData = {
  name: "СИТИ 4 — Блок Б",
  code: "CITY4-B",
  address: 'ММДЦ «Москва-Сити», участок №4',
  city: "Москва",
  work_type: "spk",
  status: "active",
  start_date: "2025-12-12",
  end_date: "2026-03-11",
  duration_days: 90,
  client_name: 'ООО «СФЕРА»',
  client_inn: "1660339627",
  client_director: "Нигматуллин Артур Альбертович",
  client_phone: "8 (960) 057 20 31",
  client_email: "info@gkpanorama.com",
  client_legal_address: "420087, Республика Татарстан, город Казань, улица Аделя Кутуя, дом 86 корпус 3, офис 1",
  client_actual_address: "420015, Республика Татарстан, город Казань, улица Касаткина, дом 15",
  client_bank: 'ООО "Банк Точка"',
  client_account: "40702810002500062202",
  contacts: [
    { role: "Директор", name: "Нигматуллин А.А.", phone: "8 (960) 057 20 31" },
    { role: "РП", name: "—", phone: "—" },
    { role: "Начальник участка", name: "—", phone: "—" },
  ],
};

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between items-start py-1.5 border-b border-border last:border-0">
    <span className="text-[10px] text-t3 flex-shrink-0 w-28">{label}</span>
    <span className="text-[10px] text-t1 font-semibold text-right">{value}</span>
  </div>
);

const ProjectCard = ({ onBack }: ProjectCardProps) => {
  const wt = workTypeLabels[projectData.work_type];

  return (
    <div className="animate-fade-in p-2.5">
      <button onClick={onBack} className="text-[11px] text-t2 mb-3 hover:text-primary transition-colors">
        ← К списку объектов
      </button>

      {/* Header card */}
      <div className="bg-bg2 border border-border rounded-lg p-3.5 mb-2.5">
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="text-[14px] font-bold mb-0.5">{projectData.name}</div>
            <div className="font-mono text-[10px] text-t3">{projectData.code}</div>
          </div>
          <span className={`text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded ${wt.cls}`}>{wt.text}</span>
        </div>
        <div className="text-[10px] text-t2 mb-1">📍 {projectData.city}, {projectData.address}</div>
        <div className="text-[10px] text-t2 mb-1">📅 {projectData.start_date} — {projectData.end_date} ({projectData.duration_days} дн.)</div>
      </div>

      {/* Client */}
      <div className="bg-bg2 border border-border rounded-lg p-3.5 mb-2.5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-2 flex items-center gap-2">
          🏢 Заказчик <span className="flex-1 h-px bg-border" />
        </div>
        <InfoRow label="Компания" value={projectData.client_name} />
        <InfoRow label="Директор" value={projectData.client_director} />
        <InfoRow label="ИНН" value={projectData.client_inn} />
        <InfoRow label="Телефон" value={projectData.client_phone} />
        <InfoRow label="E-mail" value={projectData.client_email} />
        <InfoRow label="Юр. адрес" value={projectData.client_legal_address} />
        <InfoRow label="Факт. адрес" value={projectData.client_actual_address} />
        <InfoRow label="Банк" value={projectData.client_bank} />
        <InfoRow label="Р/С" value={projectData.client_account} />
      </div>

      {/* Contacts */}
      <div className="bg-bg2 border border-border rounded-lg p-3.5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-2 flex items-center gap-2">
          👥 Контакты <span className="flex-1 h-px bg-border" />
        </div>
        {projectData.contacts.map((c, i) => (
          <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
            <div className="w-6 h-6 rounded-full bg-primary/12 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              {c.role[0]}
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-semibold">{c.name}</div>
              <div className="text-[9px] text-t3">{c.role}</div>
            </div>
            <div className="text-[9px] text-t2 font-mono">{c.phone}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectCard;
