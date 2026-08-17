import Link from "next/link";
import { HeartRateBars, TrendLine, ZoneBars, COLORS } from "@/components/charts";
import { Nav } from "@/components/nav";
import { buildHeroInsight, buildInsights, groupClimbs, groupRoutes } from "@/lib/compare";
import { decimal, hours, integer, km, shortDate, signed } from "@/lib/format";
import { hrZoneBounds } from "@/lib/metrics";
import { OWNER_ID } from "@/lib/owner";
import { createClient } from "@/lib/supabase/server";
import type { ActivityRow, ClimbRow, ProfileRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function periodLabel(activities: ActivityRow[]): string {
  if (activities.length === 0) return "";
  const dates = activities.map((a) => new Date(a.started_at));
  const format = (d: Date) =>
    d.toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });
  const first = format(dates[dates.length - 1]);
  const last = format(dates[0]);
  return first === last ? first : `${first} — ${last}`;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const [{ data: activityData }, { data: climbData }, { data: profileData }] = await Promise.all([
    supabase.from("activities").select("*").order("started_at", { ascending: false }),
    supabase.from("climbs").select("*"),
    supabase.from("profiles").select("*").eq("id", OWNER_ID).maybeSingle(),
  ]);

  const activities = (activityData ?? []) as ActivityRow[];
  const climbs = (climbData ?? []) as ClimbRow[];
  const profile = profileData as ProfileRow | null;

  if (activities.length === 0) {
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
        <Nav />
        <div className="empty">
          <div className="ico">🚴</div>
          <h2>Nenhum treino ainda</h2>
          <p>
            Suba seu primeiro GPX e o painel monta a análise: zonas de esforço, subidas detectadas
            automaticamente, eficiência cardíaca, queda de ritmo no final e comparação entre treinos na
            mesma rota.
          </p>
          <Link href="/upload" className="btn" style={{ display: "inline-block" }}>
            Subir primeiro GPX
          </Link>
        </div>
      </>
    );
  }

  const chronological = [...activities].sort((a, b) => a.started_at.localeCompare(b.started_at));
  const routeGroups = groupRoutes(activities);
  const climbGroups = groupClimbs(climbs, activities);
  const hero = buildHeroInsight(activities, routeGroups);
  const insights = buildInsights(activities);

  const withHr = chronological.filter((a) => a.avg_hr !== null && a.max_hr !== null);
  const withZones = chronological.filter((a) => a.hr_zones && a.hr_zones.length > 0);
  const withSpeed = chronological.filter((a) => a.avg_speed_kmh !== null);
  const withEfficiency = chronological.filter((a) => a.efficiency_index !== null);
  const withFade = chronological.filter((a) => a.fade_pct !== null);

  const totalDistance = activities.reduce((s, a) => s + a.distance_m, 0);
  const totalMoving = activities.reduce((s, a) => s + a.moving_s, 0);
  const totalElevation = activities.reduce((s, a) => s + a.elevation_gain_m, 0);
  const totalLoad = activities.reduce((s, a) => s + (a.tss ?? 0), 0);

  const bestEfficiency = withEfficiency.length
    ? withEfficiency.reduce((best, a) =>
        (a.efficiency_index as number) > (best.efficiency_index as number) ? a : best,
      )
    : null;

  const zoneBounds = hrZoneBounds(profile?.hr_max ?? 195);
  const zoneLabels = withZones.map(
    (a) => `${shortDate(a.started_at).replace(".", "")}\n(${km(a.distance_m, 0)} km)`,
  );
  const zoneSeries = ["Z1", "Z2", "Z3", "Z4", "Z5"].map((zone) => ({
    zone,
    values: withZones.map((a) => a.hr_zones.find((z) => z.zone === zone)?.pct ?? 0),
  }));

  const trendLabels = (list: ActivityRow[]) =>
    list.map((a) => `${shortDate(a.started_at).replace(".", "")}\n(${km(a.distance_m, 0)} km)`);

  // A subida com mais repetições entre treinos é a que mede evolução de verdade.
  const featuredClimb = climbGroups.find((group) => group.climbs.length >= 2) ?? climbGroups[0];

  return (
    <>
      <div className="head">
        <div className="title-block">
          <div className="kicker">Painel de Progresso · Ciclismo</div>
          <h1>
            Pedal <span>em evolução</span>
          </h1>
        </div>
        <div className="rider">
          <b>{profile?.display_name || "Meus treinos"}</b>
          {profile?.location && (
            <>
              {profile.location}
              <br />
            </>
          )}
          {activities.length} {activities.length === 1 ? "treino" : "treinos"}
          {withHr.length > 0 && ` · ${withHr.length} com FC`}
          {periodLabel(activities) && ` · ${periodLabel(activities)}`}
        </div>
      </div>

      <Nav />

      {hero && (
        <div className="hero">
          <div>
            <h2>{hero.headline}</h2>
            <div className="big" data-tone={hero.tone}>
              {hero.value} <small>{hero.unit}</small>
            </div>
            <p>{hero.body}</p>
          </div>
          <div className="viz">
            <div className="chart-box short">
              <TrendLine
                labels={hero.chart.labels}
                values={hero.chart.values}
                tooltip={hero.chart.tooltip}
                color={
                  hero.tone === "good"
                    ? COLORS.accent2
                    : hero.tone === "warn"
                      ? COLORS.gold
                      : COLORS.cool
                }
                fillColor={
                  hero.tone === "good"
                    ? "rgba(25,211,162,0.12)"
                    : hero.tone === "warn"
                      ? "rgba(255,210,63,0.12)"
                      : "rgba(56,189,248,0.12)"
                }
              />
            </div>
          </div>
        </div>
      )}

      <div className="cards">
        <div className="card">
          <div className="label">Distância total</div>
          <div className="val">
            {km(totalDistance, 1)} <small>km</small>
          </div>
          <div className="sub">
            {activities.length} {activities.length === 1 ? "treino registrado" : "treinos registrados"}
          </div>
          <div className="bar" />
        </div>

        <div className="card">
          <div className="label">Tempo em movimento</div>
          <div className="val">
            {hours(totalMoving, 1)} <small>h</small>
          </div>
          <div className="sub">~{integer(totalMoving / 60)} min pedalando</div>
          <div className="bar" />
        </div>

        <div className="card">
          <div className="label">Elevação acumulada</div>
          <div className="val">
            {integer(totalElevation)} <small>m</small>
          </div>
          <div className="sub">subida total no período</div>
          <div className="bar" />
        </div>

        {withFade.length >= 2 ? (
          <div className="card">
            <div className="label">Queda no final do treino</div>
            <div
              className={`val ${
                (withFade[withFade.length - 1].fade_pct as number) < (withFade[0].fade_pct as number)
                  ? "trend-down"
                  : "trend-up"
              }`}
            >
              {decimal(withFade[0].fade_pct, 0)}% → {decimal(withFade[withFade.length - 1].fade_pct, 0)}%
            </div>
            <div className="sub">do 1º treino ao último</div>
            <div className="bar" />
          </div>
        ) : (
          <div className="card">
            <div className="label">Carga de treino</div>
            <div className="val">{integer(totalLoad)}</div>
            <div className="sub">
              {activities.some((a) => a.has_power) ? "TSS acumulado" : "estimado pela FC"}
            </div>
            <div className="bar" />
          </div>
        )}
      </div>

      {(withHr.length > 0 || withZones.length > 0) && (
        <div className="grid2">
          {withHr.length > 0 && (
            <div className="panel">
              <h3>Frequência cardíaca — média vs máxima</h3>
              <p className="desc">
                Caindo a média mantendo a velocidade, o ganho é de condicionamento. Se a média sobe junto
                com a velocidade, o ganho veio de puxar mais forte.
              </p>
              <div className="chart-box">
                <HeartRateBars
                  labels={trendLabels(withHr)}
                  avg={withHr.map((a) => a.avg_hr as number)}
                  max={withHr.map((a) => a.max_hr as number)}
                />
              </div>
            </div>
          )}

          {withZones.length > 0 && (
            <div className="panel">
              <h3>Distribuição por zona de esforço</h3>
              <p className="desc">
                Zona 2 é onde a base aeróbica se constrói. Z4 e Z5 perto de zero nos treinos longos é o
                que permite treinar com frequência sem acumular desgaste.
              </p>
              <div className="chart-box">
                <ZoneBars labels={zoneLabels} zones={zoneSeries} />
              </div>
              <div className="legend-zones">
                {zoneBounds.slice(1).map((zone) => (
                  <div className="lz" key={zone.zone}>
                    <span
                      className="dot"
                      style={{
                        background:
                          zone.zone === "Z2"
                            ? COLORS.accent2
                            : zone.zone === "Z3"
                              ? COLORS.gold
                              : zone.zone === "Z4"
                                ? COLORS.accent
                                : COLORS.hot,
                      }}
                    />
                    {zone.zone} · {zone.name.toLowerCase()} ({zone.min}
                    {zone.max ? `–${zone.max}` : "+"})
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {featuredClimb && (
        <div className="climb">
          <h3>⛰️ A prova de fogo — {featuredClimb.label}</h3>
          <p className="desc">
            {featuredClimb.climbs.length >= 2
              ? "Mesma subida, treinos diferentes: aqui o progresso aparece sem a interferência de vento, rota ou distância."
              : "Detectada em um treino até agora. Quando você repetir essa subida, o painel compara os dois lado a lado."}
          </p>
          <div className="climb-row">
            {featuredClimb.climbs.map((climb) => (
              <div className="climb-item" key={climb.id}>
                <div className="d">{shortDate(climb.activity.started_at).toUpperCase()}</div>
                <div className="s">
                  {decimal(climb.speed_kmh, 1)} <span className="unit">km/h</span>
                </div>
                <div className="meta">
                  {climb.avg_hr ? `FC ${climb.avg_hr} · máx ${climb.max_hr}` : `VAM ${integer(climb.vam)} m/h`}
                </div>
              </div>
            ))}

            {featuredClimb.climbs.length >= 2 &&
              (() => {
                const first = featuredClimb.climbs[0];
                const last = featuredClimb.climbs[featuredClimb.climbs.length - 1];
                const deltaPct = ((last.speed_kmh - first.speed_kmh) / first.speed_kmh) * 100;
                const faster = deltaPct >= 0;
                const hrNote =
                  first.max_hr && last.max_hr
                    ? last.max_hr < first.max_hr
                      ? "subindo com FC máx menor"
                      : last.max_hr > first.max_hr
                        ? "com FC máx maior"
                        : "com a mesma FC máx"
                    : `VAM ${signed(last.vam - first.vam)} m/h`;
                return (
                  <div className="climb-item result">
                    <div className="d">RESULTADO</div>
                    <div className={`s small ${faster ? "good" : "bad"}`}>
                      {signed(deltaPct, 0)}% {faster ? "mais rápido" : "mais lento"}
                    </div>
                    <div className="meta">{hrNote}</div>
                  </div>
                );
              })()}
          </div>
          {climbGroups.length > 1 && (
            <div style={{ marginTop: 14 }}>
              <Link href="/subidas" style={{ color: "var(--gold)", fontSize: 12 }}>
                Ver todas as {climbGroups.length} subidas detectadas →
              </Link>
            </div>
          )}
        </div>
      )}

      {(withSpeed.length >= 2 || withEfficiency.length >= 2) && (
        <div className="grid2">
          {withSpeed.length >= 2 && (
            <div className="panel">
              <h3>Velocidade média por treino</h3>
              <p className="desc">
                Velocidade estável com FC caindo significa ganho de eficiência, não de esforço. É o
                padrão que se busca em treino de base.
              </p>
              <div className="chart-box">
                <TrendLine
                  labels={trendLabels(withSpeed)}
                  values={withSpeed.map((a) => a.avg_speed_kmh as number)}
                  color={COLORS.cool}
                  fillColor="rgba(56,189,248,0.10)"
                  tooltip="km/h médio"
                  yTitle="km/h"
                  pad={2}
                />
              </div>
            </div>
          )}

          {withEfficiency.length >= 2 && (
            <div className="panel">
              <h3>Eficiência: quilômetro por batimento</h3>
              <p className="desc">
                Índice “velocidade ÷ FC média × 100”: quanto mais alto, mais distância seu coração
                entrega por esforço. Subindo = evoluindo.
              </p>
              <div className="chart-box">
                <TrendLine
                  labels={trendLabels(withEfficiency)}
                  values={withEfficiency.map((a) => a.efficiency_index as number)}
                  color={COLORS.accent}
                  fillColor="rgba(255,90,31,0.12)"
                  tooltip="de índice"
                  yTitle="índice de eficiência"
                  pad={1}
                  decimals={2}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {insights.length > 0 && (
        <div className="insights">
          {insights.map((insight) => (
            <div className="ins" key={insight.title}>
              <div className="ico">{insight.icon}</div>
              <h4>{insight.title}</h4>
              <p>{insight.body}</p>
            </div>
          ))}
        </div>
      )}

      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Treino</th>
              <th>Dist.</th>
              <th>Elev.</th>
              <th>Vel. méd</th>
              <th>FC méd</th>
              <th>FC máx</th>
              <th>Z2</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((activity) => {
              const z2 = activity.hr_zones?.find((z) => z.zone === "Z2")?.pct ?? null;
              const hard = (activity.hr_zones ?? [])
                .filter((z) => z.zone === "Z4" || z.zone === "Z5")
                .reduce((sum, z) => sum + z.pct, 0);
              const isBest = bestEfficiency?.id === activity.id && activities.length > 1;
              return (
                <tr key={activity.id} className="clickable">
                  <td className="num">
                    <Link href={`/treino/${activity.id}`}>{shortDate(activity.started_at)}</Link>
                  </td>
                  <td>
                    <Link href={`/treino/${activity.id}`}>{activity.name}</Link>
                  </td>
                  <td className="num">{km(activity.distance_m, 1)} km</td>
                  <td className="num">{integer(activity.elevation_gain_m)} m</td>
                  <td className="num">{decimal(activity.avg_speed_kmh, 1)}</td>
                  <td className="num">{integer(activity.avg_hr)}</td>
                  <td className="num">{integer(activity.max_hr)}</td>
                  <td className="num">{z2 === null ? "—" : `${decimal(z2, 0)}%`}</td>
                  <td>
                    {isBest ? (
                      <span className="pill best">melhor ✓</span>
                    ) : hard >= 15 ? (
                      <span className="pill warn">intenso</span>
                    ) : (
                      <span className="pill">base</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="note">
        Tudo calculado a partir dos seus arquivos GPX · FC máxima de referência:{" "}
        {profile?.hr_max ?? 195} bpm ·{" "}
        <Link href="/perfil" style={{ color: "var(--accent)" }}>
          ajustar no perfil
        </Link>
        <br />
        Suba um novo treino para ver a curva continuar.
      </div>
    </>
  );
}
