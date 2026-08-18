"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ATALHOS = [50, 60, 80, 100, 160];

/** Escolha da meta: atalhos para as distâncias clássicas e campo livre. */
export function GoalForm({ current }: { current: number }) {
  const router = useRouter();
  const [km, setKm] = useState(String(current));

  function go(value: number) {
    router.push(`/plano?km=${value}`);
  }

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const value = Number(km);
        if (Number.isFinite(value) && value > 0) go(Math.round(value));
      }}
    >
      <div className="field">
        <label htmlFor="km">Distância que você quer alcançar</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            id="km"
            type="number"
            min={5}
            max={600}
            value={km}
            onChange={(e) => setKm(e.target.value)}
            style={{ maxWidth: 140 }}
          />
          <button className="btn" type="submit">
            Montar plano
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ATALHOS.map((value) => (
          <button
            key={value}
            type="button"
            className="pill"
            onClick={() => {
              setKm(String(value));
              go(value);
            }}
            style={{
              cursor: "pointer",
              border: "1px solid var(--line)",
              background: value === current ? "rgba(255,90,31,0.15)" : "var(--panel-2)",
              color: value === current ? "var(--accent)" : "var(--muted)",
            }}
          >
            {value} km
          </button>
        ))}
      </div>
    </form>
  );
}
