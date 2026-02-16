import { useState } from "react";

const roles = [
  { id: "director", icon: "🏗️", title: "Директор", sub: "Руководство" },
  { id: "pm", icon: "📋", title: "Рук. проекта", sub: "РП" },
  { id: "project", icon: "📐", title: "Проектный отд.", sub: "ОПР/КМ/КМД" },
  { id: "supply", icon: "📦", title: "Снабжение", sub: "Снабжение" },
  { id: "production", icon: "👷", title: "Производство", sub: "Производств." },
  { id: "foreman1", icon: "🏗️", title: "Прораб Ф1", sub: "Монтаж" },
  { id: "foreman2", icon: "🔧", title: "Прораб Ф2", sub: "Монтаж" },
  { id: "foreman3", icon: "⚙️", title: "Прораб Ф3", sub: "Монтаж" },
  { id: "pto", icon: "📁", title: "ПТО", sub: "ПТО" },
  { id: "inspector", icon: "🔍", title: "Технадзор", sub: "ТН" },
];

interface LoginScreenProps {
  onLogin: (role: string) => void;
}

const LoginScreen = ({ onLogin }: LoginScreenProps) => {
  const [selectedRole, setSelectedRole] = useState("director");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    if (pin === "1234") {
      onLogin(selectedRole);
    } else {
      setError("Неверный PIN-код");
      setTimeout(() => setError(""), 2000);
    }
  };

  const handlePinChange = (val: string) => {
    if (/^\d{0,4}$/.test(val)) {
      setPin(val);
      setError("");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8 animate-fade-in">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="font-mono text-xs tracking-[0.3em] text-primary mb-2">
          STSphera · CITY4
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-1">СИТИ 4</h1>
        <p className="text-sm text-t2">Система управления фасадным проектом</p>
      </div>

      {/* Role selector */}
      <div className="w-full max-w-md mb-6">
        <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-3">
          Выберите отдел / роль
        </div>
        <div className="grid grid-cols-2 gap-2">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => setSelectedRole(role.id)}
              className={`flex items-start gap-2.5 p-3 rounded-lg border transition-all text-left ${
                selectedRole === role.id
                  ? "border-primary/40 bg-primary/8"
                  : "border-border bg-bg1 hover:border-primary/20 hover:bg-bg2"
              }`}
            >
              <span className="text-xl mt-0.5">{role.icon}</span>
              <div>
                <div className="text-[12px] font-semibold leading-tight">{role.title}</div>
                <div className="text-[10px] text-t3">{role.sub}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* PIN */}
      <div className="w-full max-w-md mb-6">
        <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-2">
          PIN-код
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xl">🔑</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => handlePinChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="4 цифры"
            className="flex-1 bg-bg1 border border-border rounded-lg px-4 py-3 text-foreground font-mono text-sm tracking-[0.5em] text-center outline-none focus:border-primary transition-colors placeholder:tracking-normal placeholder:text-t3"
          />
        </div>
        {error && (
          <div className="text-destructive text-[11px] text-center mt-2 animate-fade-in">{error}</div>
        )}
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={pin.length !== 4}
        className="w-full max-w-md py-3.5 rounded-lg bg-primary text-primary-foreground font-bold text-sm tracking-wide transition-all hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Войти в систему →
      </button>

      <div className="text-[10px] text-t3 mt-4">
        Демо-доступ: PIN <span className="font-mono font-bold text-t2">1234</span> для всех ролей
      </div>
    </div>
  );
};

export default LoginScreen;
