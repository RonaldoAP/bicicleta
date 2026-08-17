"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ProfileRow } from "@/lib/types";

interface Props {
  profile: ProfileRow | null;
  userId: string;
  activityCount: number;
}

export function ProfileForm({ profile, userId, activityCount }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    display_name: profile?.display_name ?? "",
    location: profile?.location ?? "",
    weight_kg: String(profile?.weight_kg ?? 75),
    bike_weight_kg: String(profile?.bike_weight_kg ?? 10),
    hr_max: String(profile?.hr_max ?? 195),
    hr_rest: String(profile?.hr_rest ?? 55),
    hr_threshold: String(profile?.hr_threshold ?? 166),
    ftp_w: profile?.ftp_w === null || profile?.ftp_w === undefined ? "" : String(profile.ftp_w),
    cda: String(profile?.cda ?? 0.32),
    crr: String(profile?.crr ?? 0.005),
  });
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  function set(key: keyof typeof form) {
    return (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: event.target.value }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);

    const { error } = await createClient()
      .from("profiles")
      .upsert({
        id: userId,
        display_name: form.display_name.trim() || null,
        location: form.location.trim() || null,
        weight_kg: Number(form.weight_kg),
        bike_weight_kg: Number(form.bike_weight_kg),
        hr_max: Number(form.hr_max),
        hr_rest: Number(form.hr_rest),
        hr_threshold: Number(form.hr_threshold),
        ftp_w: form.ftp_w.trim() === "" ? null : Number(form.ftp_w),
        cda: Number(form.cda),
        crr: Number(form.crr),
        updated_at: new Date().toISOString(),
      });

    setSaving(false);
    if (error) {
      setFeedback({ tone: "error", text: `Não foi possível salvar: ${error.message}` });
      return;
    }
    setFeedback({
      tone: "ok",
      text:
        activityCount > 0
          ? "Perfil salvo. Os treinos já importados continuam com os valores antigos até você recalcular."
          : "Perfil salvo.",
    });
    router.refresh();
  }

  async function recalculate() {
    setRecalculating(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/recalcular", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        setFeedback({ tone: "error", text: payload.error ?? `Erro ${response.status}` });
      } else {
        const parts = [`${payload.updated} de ${payload.total} treinos reprocessados`];
        if (payload.skipped > 0) {
          parts.push(
            `${payload.skipped} sem o arquivo original guardado (importados antes desse recurso) — reenvie o GPX para reprocessar`,
          );
        }
        if (payload.failed > 0) parts.push(`${payload.failed} com erro`);
        setFeedback({ tone: "ok", text: `${parts.join(". ")}.` });
        router.refresh();
      }
    } catch (err) {
      setFeedback({ tone: "error", text: (err as Error).message || "Falha de rede." });
    }
    setRecalculating(false);
  }

  return (
    <div className="panel">
      <h3>Parâmetros de cálculo</h3>
      <p className="desc">
        Esses números alimentam as zonas de esforço, a estimativa de potência e a carga de treino. Vale
        acertá-los uma vez — o resto do painel depende deles.
      </p>

      <form className="form" onSubmit={save}>
        <div className="grid-fields">
          <div className="field">
            <label htmlFor="display_name">Nome</label>
            <input id="display_name" value={form.display_name} onChange={set("display_name")} />
          </div>
          <div className="field">
            <label htmlFor="location">Cidade</label>
            <input id="location" value={form.location} onChange={set("location")} placeholder="Gravataí · RS" />
          </div>
        </div>

        <div className="grid-fields">
          <div className="field">
            <label htmlFor="hr_max">FC máxima (bpm)</label>
            <input id="hr_max" type="number" min={120} max={230} value={form.hr_max} onChange={set("hr_max")} />
            <span className="hint">Define todas as zonas. Use a maior FC que você já viu num esforço real.</span>
          </div>
          <div className="field">
            <label htmlFor="hr_rest">FC de repouso</label>
            <input id="hr_rest" type="number" min={30} max={110} value={form.hr_rest} onChange={set("hr_rest")} />
          </div>
          <div className="field">
            <label htmlFor="hr_threshold">FC de limiar</label>
            <input
              id="hr_threshold"
              type="number"
              min={100}
              max={220}
              value={form.hr_threshold}
              onChange={set("hr_threshold")}
            />
            <span className="hint">A FC que você sustenta por cerca de uma hora. Base da carga de treino.</span>
          </div>
        </div>

        <div className="grid-fields">
          <div className="field">
            <label htmlFor="weight_kg">Seu peso (kg)</label>
            <input
              id="weight_kg"
              type="number"
              step="0.1"
              min={30}
              max={200}
              value={form.weight_kg}
              onChange={set("weight_kg")}
            />
          </div>
          <div className="field">
            <label htmlFor="bike_weight_kg">Peso da bike + equipamento (kg)</label>
            <input
              id="bike_weight_kg"
              type="number"
              step="0.1"
              min={3}
              max={40}
              value={form.bike_weight_kg}
              onChange={set("bike_weight_kg")}
            />
          </div>
          <div className="field">
            <label htmlFor="ftp_w">FTP (W, opcional)</label>
            <input id="ftp_w" type="number" min={50} max={600} value={form.ftp_w} onChange={set("ftp_w")} />
            <span className="hint">Com FTP e potência medida, a carga sai em TSS de verdade.</span>
          </div>
        </div>

        <div className="grid-fields">
          <div className="field">
            <label htmlFor="cda">CdA — área de arrasto (m²)</label>
            <input id="cda" type="number" step="0.01" min={0.15} max={0.6} value={form.cda} onChange={set("cda")} />
            <span className="hint">0,32 é típico de mãos no guidão reto; mais baixo em posição aerodinâmica.</span>
          </div>
          <div className="field">
            <label htmlFor="crr">Crr — resistência de rolamento</label>
            <input
              id="crr"
              type="number"
              step="0.0005"
              min={0.002}
              max={0.02}
              value={form.crr}
              onChange={set("crr")}
            />
            <span className="hint">0,005 para pneu de estrada em asfalto; ~0,010 para MTB em terra.</span>
          </div>
        </div>

        {feedback && <div className={`alert ${feedback.tone}`}>{feedback.text}</div>}

        <button className="btn" type="submit" disabled={saving}>
          {saving ? "Salvando…" : "Salvar perfil"}
        </button>

        {activityCount > 0 && (
          <button className="btn ghost" type="button" onClick={recalculate} disabled={recalculating}>
            {recalculating
              ? "Reprocessando…"
              : `Recalcular ${activityCount} ${activityCount === 1 ? "treino" : "treinos"} com estes valores`}
          </button>
        )}
      </form>
    </div>
  );
}
