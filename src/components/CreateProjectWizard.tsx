import { useState } from "react";

interface Contact {
  role: string;
  name: string;
  phone: string;
  email: string;
}

interface ProjectData {
  name: string;
  code: string;
  address: string;
  city: string;
  client_name: string;
  client_inn: string;
  client_director: string;
  client_phone: string;
  client_email: string;
  client_legal_address: string;
  client_actual_address: string;
  client_bank: string;
  client_account: string;
  work_type: "nvf" | "spk" | "both";
  start_date: string;
  end_date: string;
  contacts: Contact[];
}

const defaultContacts: Contact[] = [
  { role: "Директор", name: "", phone: "", email: "" },
  { role: "Руководитель проекта", name: "", phone: "", email: "" },
  { role: "Начальник участка", name: "", phone: "", email: "" },
  { role: "Прораб 1", name: "", phone: "", email: "" },
];

const emptyProject: ProjectData = {
  name: "",
  code: "",
  address: "",
  city: "",
  client_name: "",
  client_inn: "",
  client_director: "",
  client_phone: "",
  client_email: "",
  client_legal_address: "",
  client_actual_address: "",
  client_bank: "",
  client_account: "",
  work_type: "spk",
  start_date: "",
  end_date: "",
  contacts: [...defaultContacts],
};

const steps = [
  { id: 1, label: "Объект" },
  { id: 2, label: "Заказчик" },
  { id: 3, label: "Контакты" },
  { id: 4, label: "Вид работ" },
];

interface Props {
  onBack: () => void;
  onCreated: (id: string) => void;
}

const Field = ({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) => (
  <div className="mb-2.5">
    <div className="text-[9px] font-bold uppercase tracking-wider text-t3 mb-1">{label}</div>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-bg1 border border-border rounded-sm px-3 py-2 text-[11px] text-foreground outline-none focus:border-primary transition-colors placeholder:text-t3"
    />
  </div>
);

const CreateProjectWizard = ({ onBack, onCreated }: Props) => {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<ProjectData>(emptyProject);

  const upd = (field: keyof ProjectData, val: string) =>
    setData((d) => ({ ...d, [field]: val }));

  const updContact = (idx: number, field: keyof Contact, val: string) =>
    setData((d) => {
      const contacts = [...d.contacts];
      contacts[idx] = { ...contacts[idx], [field]: val };
      return { ...d, contacts };
    });

  const addContact = () =>
    setData((d) => ({
      ...d,
      contacts: [...d.contacts, { role: "", name: "", phone: "", email: "" }],
    }));

  const handleCreate = () => {
    // TODO: Save to Supabase, auto-generate tasks & ГПР
    onCreated("new-id");
  };

  return (
    <div className="min-h-screen bg-background animate-fade-in">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-bg0/88 backdrop-blur-[20px] border-b border-border px-3.5 py-2.5 flex items-center justify-between">
        <button onClick={onBack} className="text-t2 text-[13px] hover:text-primary transition-colors">← Назад</button>
        <span className="text-[13px] font-bold">Новый объект</span>
        <div className="w-12" />
      </div>

      {/* Steps indicator */}
      <div className="flex gap-0.5 px-2.5 py-2">
        {steps.map((s) => (
          <button
            key={s.id}
            onClick={() => setStep(s.id)}
            className={`flex-1 py-1.5 rounded-sm text-[10px] font-semibold text-center transition-all ${
              step === s.id
                ? "bg-primary/12 text-primary border border-primary/25"
                : step > s.id
                ? "bg-bg2 text-primary/60 border border-transparent"
                : "bg-bg1 text-t3 border border-transparent"
            }`}
          >
            {s.id}. {s.label}
          </button>
        ))}
      </div>

      <div className="p-3.5">
        {/* Step 1: Object Info */}
        {step === 1 && (
          <div className="animate-fade-in">
            <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-3 flex items-center gap-2">
              Информация об объекте <span className="flex-1 h-px bg-border" />
            </div>
            <Field label="Название объекта" value={data.name} onChange={(v) => upd("name", v)} placeholder="Напр: СИТИ 4 — Блок Б" />
            <Field label="Код объекта" value={data.code} onChange={(v) => upd("code", v)} placeholder="Напр: CITY4-B" />
            <Field label="Город" value={data.city} onChange={(v) => upd("city", v)} placeholder="Москва" />
            <Field label="Адрес" value={data.address} onChange={(v) => upd("address", v)} placeholder="Адрес объекта" />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Дата начала" value={data.start_date} onChange={(v) => upd("start_date", v)} type="date" />
              <Field label="Дата окончания" value={data.end_date} onChange={(v) => upd("end_date", v)} type="date" />
            </div>

            {/* Photo placeholder */}
            <div className="mb-2.5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-t3 mb-1">Фото объекта</div>
              <div className="border-2 border-dashed border-border rounded-sm p-6 text-center hover:border-primary/25 transition-all cursor-pointer">
                <div className="text-xl mb-1">📷</div>
                <div className="text-[10px] text-t3">Нажмите для загрузки</div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Client */}
        {step === 2 && (
          <div className="animate-fade-in">
            <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-3 flex items-center gap-2">
              Заказчик / Партнёр <span className="flex-1 h-px bg-border" />
            </div>
            <Field label="Наименование предприятия" value={data.client_name} onChange={(v) => upd("client_name", v)} placeholder='ООО «Компания»' />
            <Field label="Генеральный директор" value={data.client_director} onChange={(v) => upd("client_director", v)} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="ИНН" value={data.client_inn} onChange={(v) => upd("client_inn", v)} />
              <Field label="Телефон" value={data.client_phone} onChange={(v) => upd("client_phone", v)} />
            </div>
            <Field label="E-mail" value={data.client_email} onChange={(v) => upd("client_email", v)} />
            <Field label="Юридический адрес" value={data.client_legal_address} onChange={(v) => upd("client_legal_address", v)} />
            <Field label="Фактический адрес" value={data.client_actual_address} onChange={(v) => upd("client_actual_address", v)} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Банк" value={data.client_bank} onChange={(v) => upd("client_bank", v)} />
              <Field label="Расчётный счёт" value={data.client_account} onChange={(v) => upd("client_account", v)} />
            </div>
          </div>
        )}

        {/* Step 3: Contacts */}
        {step === 3 && (
          <div className="animate-fade-in">
            <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-3 flex items-center gap-2">
              Контакты и коммуникация <span className="flex-1 h-px bg-border" />
            </div>
            <div className="text-[10px] text-t2 mb-3">
              Укажите ключевых участников проекта для коммуникации
            </div>
            {data.contacts.map((c, i) => (
              <div key={i} className="bg-bg1 border border-border rounded-sm p-2.5 mb-2">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Роль" value={c.role} onChange={(v) => updContact(i, "role", v)} placeholder="Директор / РП / Прораб" />
                  <Field label="ФИО" value={c.name} onChange={(v) => updContact(i, "name", v)} placeholder="Иванов И.И." />
                  <Field label="Телефон" value={c.phone} onChange={(v) => updContact(i, "phone", v)} placeholder="+7 ..." />
                  <Field label="E-mail" value={c.email} onChange={(v) => updContact(i, "email", v)} placeholder="email@..." />
                </div>
              </div>
            ))}
            <button
              onClick={addContact}
              className="w-full py-2 border border-dashed border-border rounded-sm text-[10px] text-t2 font-semibold hover:border-primary/25 hover:text-primary transition-all"
            >
              + Добавить контакт
            </button>
          </div>
        )}

        {/* Step 4: Work Type */}
        {step === 4 && (
          <div className="animate-fade-in">
            <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-3 flex items-center gap-2">
              Вид работ и запуск <span className="flex-1 h-px bg-border" />
            </div>
            <div className="text-[10px] text-t2 mb-3">
              Выберите тип фасадной системы. Задачи экосистемы и ГПР будут сформированы автоматически.
            </div>
            <div className="grid grid-cols-1 gap-2 mb-4">
              {[
                { id: "spk" as const, icon: "🔲", title: "СПК — Светопрозрачные конструкции", desc: "Модули СПК, кронштейны, уплотнители, герметизация, сдача ТН" },
                { id: "nvf" as const, icon: "🏗️", title: "НВФ — Навесной вентилируемый фасад", desc: "Подсистема, утепление, облицовка, ламели, ветрозащита" },
                { id: "both" as const, icon: "🔀", title: "НВФ + СПК (комбинированный)", desc: "Оба вида работ на одном объекте" },
              ].map((wt) => (
                <button
                  key={wt.id}
                  onClick={() => setData((d) => ({ ...d, work_type: wt.id }))}
                  className={`text-left p-3.5 rounded-lg border transition-all ${
                    data.work_type === wt.id
                      ? "border-primary/40 bg-primary/8"
                      : "border-border bg-bg1 hover:border-primary/20"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{wt.icon}</span>
                    <span className="text-[12px] font-bold">{wt.title}</span>
                  </div>
                  <div className="text-[10px] text-t2 ml-7">{wt.desc}</div>
                </button>
              ))}
            </div>

            {/* Auto-generation info */}
            <div className="bg-bg2 border border-border rounded-lg p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-2">
                🚀 При создании автоматически
              </div>
              <div className="space-y-1 text-[10px] text-t2">
                <div>✅ Экосистема задач (Административный, Проектный, Снабжение, Монтаж блоки)</div>
                <div>✅ ГПР — График производства работ</div>
                <div>✅ Структура фасадов и этажей</div>
                <div>✅ Материалы и спецификации</div>
                <div>✅ Бригады и план-факт</div>
              </div>
            </div>

            <div className="mt-3 text-[10px] text-t3 bg-bg1 border border-border rounded-sm p-2.5">
              💡 Также можно сформировать ГПР из загруженного документа РД или Спецификации
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-2 mt-4">
          {step > 1 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex-1 py-2.5 rounded-sm bg-bg1 border border-border text-t1 text-[11px] font-bold hover:bg-bg2 transition-all"
            >
              ← Назад
            </button>
          )}
          {step < 4 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="flex-1 py-2.5 rounded-sm bg-primary text-primary-foreground text-[11px] font-bold hover:brightness-110 transition-all"
            >
              Далее →
            </button>
          ) : (
            <button
              onClick={handleCreate}
              className="flex-1 py-2.5 rounded-sm bg-primary text-primary-foreground text-[11px] font-bold hover:brightness-110 transition-all"
            >
              🚀 Создать объект
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateProjectWizard;
