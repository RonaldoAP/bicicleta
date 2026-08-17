"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Nav } from "@/components/nav";
import { decimal, duration, integer } from "@/lib/format";

interface Result {
  file: string;
  status: "pending" | "sending" | "ok" | "duplicate" | "error";
  message?: string;
  activityId?: string;
  summary?: {
    name: string;
    distanceKm: number;
    movingS: number;
    elevationGainM: number;
    avgHr: number | null;
    climbs: number;
    hasHr: boolean;
    hasPower: boolean;
    powerIsEstimated: boolean;
  };
}

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const files = Array.from(inputRef.current?.files ?? []);
    if (files.length === 0) return;

    setBusy(true);
    setResults(files.map((f) => ({ file: f.name, status: "pending" })));

    // Um arquivo por requisição: evita estourar o limite de corpo da requisição
    // e deixa cada resultado aparecer conforme termina.
    for (let i = 0; i < files.length; i++) {
      setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "sending" } : r)));

      const body = new FormData();
      body.append("file", files[i]);

      try {
        const response = await fetch("/api/upload", { method: "POST", body });
        const payload = await response.json();

        setResults((prev) =>
          prev.map((r, idx) => {
            if (idx !== i) return r;
            if (response.ok) {
              return {
                ...r,
                status: "ok",
                activityId: payload.activityId,
                summary: {
                  name: payload.name,
                  distanceKm: payload.distanceKm,
                  movingS: payload.movingS,
                  elevationGainM: payload.elevationGainM,
                  avgHr: payload.avgHr,
                  climbs: payload.climbs,
                  hasHr: payload.hasHr,
                  hasPower: payload.hasPower,
                  powerIsEstimated: payload.powerIsEstimated,
                },
              };
            }
            return {
              ...r,
              status: payload.duplicate ? "duplicate" : "error",
              message: payload.error ?? `Erro ${response.status}`,
              activityId: payload.activityId,
            };
          }),
        );
      } catch (err) {
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? { ...r, status: "error", message: (err as Error).message || "Falha de rede." }
              : r,
          ),
        );
      }
    }

    setBusy(false);
    router.refresh();
  }

  const imported = results.filter((r) => r.status === "ok");

  return (
    <>
      <div className="head">
        <div className="title-block">
          <div className="kicker">Alimentar a plataforma</div>
          <h1>
            Subir <span>GPX</span>
          </h1>
        </div>
      </div>

      <Nav />

      <div className="panel">
        <h3>Escolha os arquivos</h3>
        <p className="desc">
          Aceita GPX exportado do Strava, Garmin, Wahoo ou de qualquer app de treino. Frequência
          cardíaca, cadência e potência são lidas quando o arquivo tiver esses dados — sem medidor de
          potência, ela é estimada pela física do percurso. Pode selecionar vários arquivos de uma vez.
        </p>

        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="files">Arquivos GPX</label>
            <input
              ref={inputRef}
              id="files"
              name="files"
              type="file"
              accept=".gpx,application/gpx+xml,application/xml,text/xml"
              multiple
              required
            />
            <span className="hint">
              Reenviar o mesmo arquivo não duplica o treino — a plataforma reconhece pelo conteúdo.
            </span>
          </div>

          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Processando…" : "Importar treinos"}
          </button>
        </form>
      </div>

      {results.length > 0 && (
        <div className="panel">
          <h3>Resultado da importação</h3>
          <p className="desc">
            {imported.length} de {results.length}{" "}
            {results.length === 1 ? "arquivo importado" : "arquivos importados"}.
          </p>

          <div className="form">
            {results.map((result) => (
              <div
                key={result.file}
                className={`alert ${result.status === "ok" ? "ok" : result.status === "error" ? "error" : ""}`}
              >
                <b>{result.file}</b>
                {result.status === "pending" && " — na fila…"}
                {result.status === "sending" && " — analisando…"}
                {result.status === "duplicate" && ` — ${result.message}`}
                {result.status === "error" && ` — ${result.message}`}
                {result.status === "ok" && result.summary && (
                  <>
                    {" — "}
                    {result.summary.name}
                    <ul>
                      <li>
                        {decimal(result.summary.distanceKm, 1)} km em{" "}
                        {duration(result.summary.movingS)} de movimento ·{" "}
                        {integer(result.summary.elevationGainM)} m de elevação
                      </li>
                      <li>
                        {result.summary.hasHr
                          ? `FC média ${result.summary.avgHr} bpm`
                          : "sem frequência cardíaca no arquivo"}
                        {" · "}
                        {result.summary.hasPower
                          ? "potência medida"
                          : "potência estimada pela física do percurso"}
                      </li>
                      <li>
                        {result.summary.climbs === 0
                          ? "nenhuma subida relevante detectada"
                          : `${result.summary.climbs} ${result.summary.climbs === 1 ? "subida detectada" : "subidas detectadas"}`}
                      </li>
                    </ul>
                  </>
                )}
                {result.activityId && (
                  <div style={{ marginTop: 8 }}>
                    <Link href={`/treino/${result.activityId}`} style={{ color: "var(--accent)" }}>
                      Ver análise do treino →
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>

          {imported.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <Link href="/" className="btn" style={{ display: "inline-block" }}>
                Ir para o painel
              </Link>
            </div>
          )}
        </div>
      )}

      <div className="note">
        Como exportar do Strava: abra a atividade no site → menu “…” → Exportar GPX. No Garmin
        Connect: abra a atividade → engrenagem → Exportar para GPX.
      </div>
    </>
  );
}
