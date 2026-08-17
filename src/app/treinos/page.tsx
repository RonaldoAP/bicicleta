import Link from "next/link";
import { Nav } from "@/components/nav";
import { groupRoutes } from "@/lib/compare";
import { decimal, duration, integer, km, shortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ActivityRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ActivitiesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("activities").select("*").order("started_at", { ascending: false });
  const activities = (data ?? []) as ActivityRow[];

  if (activities.length === 0) {
    return (
      <>
        <div className="head">
          <div className="title-block">
            <div className="kicker">Histórico</div>
            <h1>
              Todos os <span>treinos</span>
            </h1>
          </div>
        </div>
        <Nav />
        <div className="empty">
          <div className="ico">📂</div>
          <h2>Nada importado ainda</h2>
          <p>Assim que você subir um GPX ele aparece aqui com todas as métricas calculadas.</p>
          <Link href="/upload" className="btn" style={{ display: "inline-block" }}>
            Subir GPX
          </Link>
        </div>
      </>
    );
  }

  const routeGroups = groupRoutes(activities);
  // Cada treino recebe o número da rota a que pertence, para dar para enxergar
  // repetições de percurso direto na tabela.
  const routeOf = new Map<string, number>();
  routeGroups.forEach((group, index) => {
    for (const activity of group.activities) routeOf.set(activity.id, index + 1);
  });

  const repeated = routeGroups.filter((g) => g.activities.length > 1);

  return (
    <>
      <div className="head">
        <div className="title-block">
          <div className="kicker">Histórico</div>
          <h1>
            Todos os <span>treinos</span>
          </h1>
        </div>
        <div className="rider">
          <b>{activities.length} treinos</b>
          {km(
            activities.reduce((s, a) => s + a.distance_m, 0),
            0,
          )}{" "}
          km no total
          <br />
          {routeGroups.length} {routeGroups.length === 1 ? "rota distinta" : "rotas distintas"}
        </div>
      </div>

      <Nav />

      {repeated.length > 0 && (
        <div className="panel">
          <h3>Rotas repetidas</h3>
          <p className="desc">
            Percursos que você fez mais de uma vez. Comparar treinos na mesma rota elimina a
            interferência de distância e terreno — é a comparação mais honesta que existe.
          </p>
          <div className="climb-row">
            {repeated.map((group, index) => {
              const withHr = group.activities.filter((a) => a.avg_hr !== null);
              const hrDelta =
                withHr.length >= 2
                  ? (withHr[withHr.length - 1].avg_hr as number) - (withHr[0].avg_hr as number)
                  : null;
              return (
                <div className="climb-item" key={group.id}>
                  <div className="d">
                    ROTA {routeOf.get(group.activities[0].id)} · {group.activities.length}×
                  </div>
                  <div className="s">
                    {km(group.avgDistanceM, 0)} <span className="unit">km</span>
                  </div>
                  <div className="meta">
                    {hrDelta === null
                      ? group.activities.map((a) => shortDate(a.started_at)).join(" · ")
                      : `FC média ${hrDelta <= 0 ? "−" : "+"}${Math.abs(hrDelta)} bpm da 1ª à última`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="table-panel">
        <table style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>Data</th>
              <th>Treino</th>
              <th>Rota</th>
              <th>Dist.</th>
              <th>Movim.</th>
              <th>Elev.</th>
              <th>Vel. méd</th>
              <th>FC méd</th>
              <th>Pot. méd</th>
              <th>Carga</th>
              <th>Efic.</th>
              <th>Deriva</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((activity) => (
              <tr key={activity.id} className="clickable">
                <td className="num">
                  <Link href={`/treino/${activity.id}`}>{shortDate(activity.started_at)}</Link>
                </td>
                <td>
                  <Link href={`/treino/${activity.id}`}>{activity.name}</Link>
                </td>
                <td className="num">
                  {routeOf.has(activity.id) ? `#${routeOf.get(activity.id)}` : "—"}
                </td>
                <td className="num">{km(activity.distance_m, 1)}</td>
                <td className="num">{duration(activity.moving_s)}</td>
                <td className="num">{integer(activity.elevation_gain_m)} m</td>
                <td className="num">{decimal(activity.avg_speed_kmh, 1)}</td>
                <td className="num">{integer(activity.avg_hr)}</td>
                <td className="num">{integer(activity.avg_power_w)} W</td>
                <td className="num">{decimal(activity.tss, 0)}</td>
                <td className="num">{decimal(activity.efficiency_index, 2)}</td>
                <td className="num">
                  {activity.decoupling_pct === null ? "—" : `${decimal(activity.decoupling_pct, 1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="note">
        Potência estimada quando o arquivo não tem medidor · Carga em TSS quando há potência medida e
        FTP configurado, senão estimada pelo tempo em cada zona de FC
      </div>
    </>
  );
}
