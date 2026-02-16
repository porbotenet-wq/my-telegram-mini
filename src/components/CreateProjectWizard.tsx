import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileUp, Loader2, Sparkles, CheckCircle } from "lucide-react";

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
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [data, setData] = useState<ProjectData>(emptyProject);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [docName, setDocName] = useState<string | null>(null);
  const [filled, setFilled] = useState(false);

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

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["application/pdf", "image/png", "image/jpeg"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Ошибка", description: "Поддерживаются PDF, PNG, JPEG", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Ошибка", description: "Максимум 20 МБ", variant: "destructive" });
      return;
    }

    setUploading(true);
    setDocName(file.name);
    const filePath = `${crypto.randomUUID()}-${file.name}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("project-documents")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      setUploading(false);
      setParsing(true);

      const { data: parseResult, error: parseError } = await supabase.functions.invoke(
        "parse-project-document",
        { body: { file_path: filePath } }
      );

      if (parseError) throw parseError;

      if (parseResult?.success && parseResult.project) {
        const p = parseResult.project;
        setData((prev) => ({
          ...prev,
          name: p.name || prev.name,
          code: p.code || prev.code,
          address: p.address || prev.address,
          city: p.city || prev.city,
          client_name: p.client_name || prev.client_name,
          client_inn: p.client_inn || prev.client_inn,
          client_director: p.client_director || prev.client_director,
          client_phone: p.client_phone || prev.client_phone,
          client_email: p.client_email || prev.client_email,
          client_legal_address: p.client_legal_address || prev.client_legal_address,
          client_actual_address: p.client_actual_address || prev.client_actual_address,
          client_bank: p.client_bank || prev.client_bank,
          client_account: p.client_account || prev.client_account,
          work_type: (["nvf", "spk", "both"].includes(p.work_type) ? p.work_type : prev.work_type) as ProjectData["work_type"],
          start_date: p.start_date || prev.start_date,
          end_date: p.end_date || prev.end_date,
          contacts: p.contacts?.length > 0
            ? p.contacts.map((c: any) => ({
                role: c.role || "",
                name: c.name || "",
                phone: c.phone || "",
                email: c.email || "",
              }))
            : prev.contacts,
        }));
        setFilled(true);
        toast({ title: "✨ Данные извлечены", description: "Поля заполнены из документа. Проверьте и скорректируйте." });
      } else {
        throw new Error(parseResult?.error || "Не удалось распознать документ");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ошибка обработки";
      toast({ title: "Ошибка", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleCreate = () => {
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
            {/* Document upload for auto-fill */}
            <div className="mb-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-2 flex items-center gap-2">
                <Sparkles className="h-3 w-3 text-primary" /> Создать из документа
                <span className="flex-1 h-px bg-border" />
              </div>
              <div
                className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${
                  filled
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-bg2 hover:border-primary/30"
                }`}
                onClick={() => !uploading && !parsing && fileRef.current?.click()}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={handleDocUpload}
                />
                {uploading ? (
                  <>
                    <Loader2 className="h-5 w-5 mx-auto text-primary animate-spin" />
                    <p className="text-[10px] text-t2 mt-1.5 font-semibold">Загрузка файла...</p>
                  </>
                ) : parsing ? (
                  <>
                    <Loader2 className="h-5 w-5 mx-auto text-primary animate-spin" />
                    <p className="text-[10px] text-primary mt-1.5 font-semibold">✨ AI анализирует документ...</p>
                    <p className="text-[9px] text-t3 mt-0.5">{docName}</p>
                  </>
                ) : filled ? (
                  <>
                    <CheckCircle className="h-5 w-5 mx-auto text-primary" />
                    <p className="text-[10px] text-primary mt-1.5 font-semibold">Данные извлечены из {docName}</p>
                    <p className="text-[9px] text-t3 mt-0.5">Нажмите для загрузки другого документа</p>
                  </>
                ) : (
                  <>
                    <FileUp className="h-5 w-5 mx-auto text-t3" />
                    <p className="text-[10px] text-t2 mt-1.5 font-semibold">
                      Загрузите договор, КП или спецификацию
                    </p>
                    <p className="text-[9px] text-t3 mt-0.5">AI заполнит карточку автоматически • PDF, PNG, JPEG до 20 МБ</p>
                  </>
                )}
              </div>
            </div>

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
