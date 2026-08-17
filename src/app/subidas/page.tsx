import Link from "next/link";
import { Nav } from "@/components/nav";
import { groupClimbs } from "@/lib/compare";
import { clock, decimal, integer, shortDate, signed } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ActivityRow, ClimbRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ClimbsPage() {
  const supabase = await createClient();
  const [{ data: climbData }, { data: activityData }] = await Promise.all([
    supabase.from("climbs").select("*"),
    supabase.from("activities").select("*"),
  ]);

  const climbs = (climbData ?? []) as ClimbRow[];
  const activities = (activityData ?? []) as ActivityRow[];
  const groups = groupClimbs(climbs, activities);

  if (groups.length === 0) {
    return (
      <>
        <div className="head">
          <div className="title-block">
            <div className="kicker">Mesmo trecho, treinos diferentes</div>
            <h1>
              Suas <span>subidas</span>
            </h1>
          </div>
        </div>
        <Nav />
        <div className="empty">
          <div className="ico">⛰️</div>
          <h2>Nenhuma subida detectada</h2>
          <p>
            A plataforma marca como subida os trechos com pelo menos 200 m de extensão, 15 m de ganho e
            2% de inclinação média. Treinos em terreno plano não geram nenhuma — suba um GPX com relevo
            para ver a comparação.
          </p>
          <Link href="/upload" className="btn" style={{ display: "inline-block" }}>
            Subir GPX
          </Link>
        </div>
      </>
    );
  }

  const repeated = groups.filter((g) => g.climbs.length >= 2);

  return (
    <>
      <div className="head">
        <div className="title-block">
          <div className="kicker">Mesmo trecho, treinos diferentes</div>
          <h1>
            Suas <span>subidas</span>
          </h1>
        </div>
        <div className="rider">
          <b>{groups.length} subidas distintas</b>
          {repeated.length} {repeated.length === 1 ? "repetida" : "repetidas"} em mais de um treino
          <br />
          {climbs.length} registros no total
        </div>
      </div>

      <Nav />

      <div className="panel">
        <h3>Como ler esta página</h3>
        <p className="desc" style={{ marginBottom: 0 }}>
          Subidas de treinos diferentes são pareadas quando começam no mesmo lugar (até 150 m de
          distância) e têm extensão parecida. Isso permite comparar o mesmo esforço sem a interferência
          de vento na reta, distância total ou rota diferente. VAM é a velocidade vertical: quantos
          metros de altitude você ganha por hora — a métrica mais direta de desempenho em subida.
        </p>
      </div>

      {groups.map((group) => {
        const first = group.climbs[0];
        const last = group.climbs[group.climbs.length - 1];
        const hasComparison = group.climbs.length >= 2;
        const speedDelta = hasComparison
          ? ((last.speed_kmh - first.speed_kmh) / first.speed_kmh) * 100
          : null;

        return (
          <div className="climb" key={group.id}>
            <h3>
              ⛰️ {group.label}{" "}
              <span style={{ color: "var(--muted)", fontWeight: 400, textTransform: "none" }}>
                · {first.category}
              </span>
            </h3>
            <p className="desc">
              {hasComparison
                ? `Registrada ${group.climbs.length} vezes, de ${shortDate(
                    first.activity.started_at,
                  )} a ${shortDate(last.activity.started_at)}.`
                : `Registrada uma vez, em ${shortDate(first.activity.started_at)}. Repita essa subida para o painel comparar.`}
            </p>

            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Treino</th>
                    <th>Tempo</th>
                    <th>Vel.</th>
                    <th>VAM</th>
                    <th>Ganho</th>
                    <th>Incl. méd</th>
                    <th>FC méd</th>
                    <th>FC máx</th>
                    <th>Pot. méd</th>
                  </tr>
                </thead>
                <tbody>
                  {group.climbs.map((climb) => {
                    const isBest =
                      hasComparison &&
                      climb.speed_kmh === Math.max(...group.climbs.map((c) => c.speed_kmh));
                    return (
                      <tr key={climb.id}>
                        <td className="num">
                          {shortDate(climb.activity.started_at)}
                          {isBest && (
                            <>
                              {" "}
                              <span className="pill best">melhor</span>
                            </>
                          )}
                        </td>
                        <td>
                          <Link href={`/treino/${climb.activity_id}`}>{climb.activity.name}</Link>
                        </td>
                        <td className="num">{clock(climb.duration_s)}</td>
                        <td className="num">{decimal(climb.speed_kmh, 1)} km/h</td>
                        <td className="num">{integer(climb.vam)} m/h</td>
                        <td className="num">{integer(climb.elev_gain_m)} m</td>
                        <td className="num">{decimal(climb.avg_grade, 1)}%</td>
                        <td className="num">{integer(climb.avg_hr)}</td>
                        <td className="num">{integer(climb.max_hr)}</td>
                        <td className="num">{integer(climb.avg_power_w)} W</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {hasComparison && speedDelta !== null && (
              <div className="climb-row" style={{ marginTop: 16 }}>
                <div className="climb-item result">
                  <div className="d">EVOLUÇÃO NO TRECHO</div>
                  <div className={`s small ${speedDelta >= 0 ? "good" : "bad"}`}>
                    {signed(speedDelta, 0)}% {speedDelta >= 0 ? "mais rápido" : "mais lento"}
                  </div>
                  <div className="meta">
                    {clock(first.duration_s)} → {clock(last.duration_s)}
                  </div>
                </div>
                <div className="climb-item result">
                  <div className="d">VELOCIDADE VERTICAL</div>
                  <div className={`s small ${last.vam >= first.vam ? "good" : "bad"}`}>
                    {signed(last.vam - first.vam)} <span className="unit">m/h</span>
                  </div>
                  <div className="meta">
                    {integer(first.vam)} → {integer(last.vam)} m/h
                  </div>
                </div>
                {first.avg_hr && last.avg_hr && (
                  <div className="climb-item result">
                    <div className="d">CUSTO CARDÍACO</div>
                    <div className={`s small ${last.avg_hr <= first.avg_hr ? "good" : "bad"}`}>
                      {signed(last.avg_hr - first.avg_hr)} <span className="unit">bpm</span>
                    </div>
                    <div className="meta">
                      {first.avg_hr} → {last.avg_hr} bpm de média
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="note">
        Inclinação calculada sobre altimetria suavizada em janela de 20 m, para não inflar o número com
        o ruído do GPS
      </div>
    </>
  );
}
