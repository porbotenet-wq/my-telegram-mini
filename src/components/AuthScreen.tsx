import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const AuthScreen = () => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message === "Invalid login credentials"
        ? "Неверный email или пароль"
        : error.message);
    }
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!displayName.trim()) {
      toast.error("Укажите имя");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Проверьте почту для подтверждения регистрации");
      setMode("login");
    }
    setLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") handleLogin();
    else handleRegister();
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error("Введите email");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Ссылка для сброса пароля отправлена на почту");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8 animate-fade-in">
      <div className="text-center mb-8">
        <div className="font-mono text-xs tracking-[0.3em] text-primary mb-2">
          STSphera · CITY4
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-1">СИТИ 4</h1>
        <p className="text-sm text-muted-foreground">Система управления фасадным проектом</p>
      </div>

      {/* Tabs */}
      <div className="flex w-full max-w-md mb-6 bg-card rounded-lg border border-border overflow-hidden">
        <button
          onClick={() => setMode("login")}
          className={`flex-1 py-2.5 text-sm font-semibold transition-all ${
            mode === "login"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Вход
        </button>
        <button
          onClick={() => setMode("register")}
          className={`flex-1 py-2.5 text-sm font-semibold transition-all ${
            mode === "register"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Регистрация
        </button>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
        {mode === "register" && (
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Имя
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Иван Петров"
              className="w-full bg-card border border-border rounded-lg px-4 py-3 text-foreground text-sm outline-none focus:border-primary transition-colors placeholder:text-muted-foreground"
            />
          </div>
        )}

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@company.ru"
            className="w-full bg-card border border-border rounded-lg px-4 py-3 text-foreground text-sm outline-none focus:border-primary transition-colors placeholder:text-muted-foreground"
          />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
            Пароль
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-card border border-border rounded-lg px-4 py-3 text-foreground text-sm outline-none focus:border-primary transition-colors placeholder:text-muted-foreground"
          />
        </div>

        {mode === "login" && (
          <button
            type="button"
            onClick={handleForgotPassword}
            className="text-xs text-primary hover:underline"
          >
            Забыли пароль?
          </button>
        )}

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="w-full py-3.5 rounded-lg bg-primary text-primary-foreground font-bold text-sm tracking-wide transition-all hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {loading
            ? "Загрузка..."
            : mode === "login"
            ? "Войти в систему →"
            : "Зарегистрироваться →"}
        </button>
      </form>

      <Link
        to="/privacy"
        className="text-[10px] text-muted-foreground hover:text-primary transition-colors mt-6 underline underline-offset-2"
      >
        Политика конфиденциальности
      </Link>
    </div>
  );
};

export default AuthScreen;
