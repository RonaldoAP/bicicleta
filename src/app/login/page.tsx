"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(traduzir(error.message));
        setBusy(false);
        return;
      }
      // Com confirmação de e-mail ligada no Supabase, não há sessão ainda.
      if (!data.session) {
        setMessage("Conta criada. Confirme o e-mail que acabamos de enviar e depois entre.");
        setMode("signin");
        setBusy(false);
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(traduzir(error.message));
        setBusy(false);
        return;
      }
    }

    router.replace(next);
    router.refresh();
  }

  return (
    <>
      <div className="head">
        <div className="title-block">
          <div className="kicker">Painel de Progresso · Ciclismo</div>
          <h1>
            Pedal <span>em evolução</span>
          </h1>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 460, margin: "0 auto" }}>
        <h3>{mode === "signin" ? "Entrar" : "Criar conta"}</h3>
        <p className="desc">
          Seus treinos são privados: cada conta só acessa os próprios dados, garantido no banco por
          política de acesso por linha.
        </p>

        <form className="form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              minLength={8}
              required
            />
            {mode === "signup" && <span className="hint">Mínimo de 8 caracteres.</span>}
          </div>

          {error && <div className="alert error">{error}</div>}
          {message && <div className="alert ok">{message}</div>}

          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta"}
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setMessage(null);
            }}
          >
            {mode === "signin" ? "Não tenho conta" : "Já tenho conta"}
          </button>
        </form>
      </div>
    </>
  );
}

function traduzir(message: string): string {
  const map: Record<string, string> = {
    "Invalid login credentials": "E-mail ou senha incorretos.",
    "User already registered": "Esse e-mail já tem conta. Escolha “Já tenho conta”.",
    "Email not confirmed": "Confirme o e-mail antes de entrar.",
    "Password should be at least 6 characters":
      "A senha precisa ter pelo menos 6 caracteres.",
  };
  return map[message] ?? message;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
