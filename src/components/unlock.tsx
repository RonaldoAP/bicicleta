"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Tela única de entrada: sem cadastro, sem e-mail, só a senha combinada. */
export function Unlock() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/entrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error ?? "Não foi possível entrar.");
        setBusy(false);
        return;
      }

      router.refresh();
    } catch {
      setError("Falha de rede. Tente de novo.");
      setBusy(false);
    }
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

      <div className="panel" style={{ maxWidth: 420, margin: "40px auto 0" }}>
        <h3>Área restrita</h3>
        <p className="desc">
          Este painel é pessoal. Informe a senha de acesso para continuar.
        </p>

        <form className="form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              type="password"
              inputMode="numeric"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          </div>

          {error && <div className="alert error">{error}</div>}

          <button className="btn" type="submit" disabled={busy || senha.length === 0}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </>
  );
}
