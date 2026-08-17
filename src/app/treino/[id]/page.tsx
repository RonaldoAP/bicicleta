import Link from "next/link";
import { notFound } from "next/navigation";
import { COLORS, ProfileChart, SplitsChart, ZoneBars } from "@/components/charts";
import { Nav } from "@/components/nav";
import { RouteMap } from "@/components/route-map";
import { clock, decimal, duration, fullDate, integer, km, timeOfDay } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ActivityRow, ClimbRow, StreamRow } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Reduz as séries para o gráfico: 8 mil pontos travam o canvas sem ganho visual. */
function downsample<T>(values: T[], target: number): T[] {
  if (values.length <= target) return values;
  const stride = Math.ceil(values.length / target);
  const out: T[] = [];
  for (let i = 0; i < values.length; i += stride) out.push(values[i]);
  if (out[out.length - 1] !== values[values.length - 1]) out.push(values[values.length - 1]);
  return out;
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="stat">
      <div className="k">{label}</div>
      <div className="v">
        {value}
        {unit && <small> {unit}</small>}
      </div>
    </div>
  );
}

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: activityData }, { data: streamData }, { data: climbData }] = await Promise.all([
    supabase.from("activities").select("*").eq("id", id).maybeSingle(),
    supabase.from("activity_streams").select("*").eq("activity_id", id).maybeSingle(),
    supabase.from("climbs").select("*").eq("activity_id", id).order("ord"),
  ]);

  if (!activityData) notFound();

  const activity = activityData as ActivityRow;
  const streams = streamData as StreamRow | null;
  const climbs = (climbData ?? []) as ClimbRow[];

  const stride = streams ? Math.ceil(streams.dist_m.length / 700) : 1;
  const pick = <T,>(arr: T[] | undefined) => (arr ? downsample(arr, 700) : []);

  const distanceKm = streams ? pick(streams.dist_m).map((d) => Number((d / 1000).toFixed(2))) : [];
  const elevation = streams ? pick(streams.ele) : [];

  // A série sobreposta ao perfil: FC quando existe, senão velocidade.
  const overlay = streams
    ? activity.has_hr
      ? { label: "FC", values: pick(streams.hr), color: COLORS.hot, unit: "bpm" }
      : { label: "Velocidade", values: pick(streams.speed_kmh), color: COLORS.cool, unit: "km/h" }
    : null;

  const zoneSeries = activity.hr_zones?.length
    ? activity.hr_zones.map((z) => ({ zone: z.zone, values: [z.pct] }))
    : [];

  const quarters = activity.quarters ?? [];

  return (
    <>
      <div className="head">
        <div className="title-block">
          <div className="kicker">
            {fullDate(activity.started_at)} · {timeOfDay(activity.started_at)}
          </div>
          <h1>{activity.name}</h1>
        </div>
        <div className="rider">
          <b>
            {km(activity.distance_m, 1)} km · {duration(activity.moving_s)}
          </b>
          {integer(activity.elevation_gain_m)} m de elevação
          <br />
          {activity.file_name}
        </div>
      </div>

      <Nav />

      <div className="panel">
        <h3>Resumo</h3>
        <p className="desc">
          Tempo em movimento desconta paradas: pontos com velocidade abaixo de 1,5 km/h não entram na
          média.
        </p>
        <div className="stat-row">
          <Stat label="Distância" value={km(activity.distance_m, 2)} unit="km" />
          <Stat label="Em movimento" value={duration(activity.moving_s)} />
          <Stat label="Tempo total" value={duration(activity.elapsed_s)} />
          <Stat label="Vel. média" value={decimal(activity.avg_speed_kmh, 1)} unit="km/h" />
          <Stat label="Vel. máxima" value={decimal(activity.max_speed_kmh, 1)} unit="km/h" />
          <Stat label="Elevação" value={integer(activity.elevation_gain_m)} unit="m" />
          {activity.has_hr && (
            <>
              <Stat label="FC média" value={integer(activity.avg_hr)} unit="bpm" />
              <Stat label="FC máxima" value={integer(activity.max_hr)} unit="bpm" />
            </>
          )}
          {activity.has_cadence && (
            <Stat label="Cadência" value={integer(activity.avg_cadence)} unit="rpm" />
          )}
          <Stat label="Potência méd." value={integer(activity.avg_power_w)} unit="W" />
          {activity.np_power_w !== null && (
            <Stat label="Pot. normalizada" value={integer(activity.np_power_w)} unit="W" />
          )}
          {activity.tss !== null && <Stat label="Carga" value={decimal(activity.tss, 0)} unit="TSS" />}
          {activity.work_kj !== null && (
            <Stat label="Trabalho" value={integer(activity.work_kj)} unit="kJ" />
          )}
          {activity.calories !== null && (
            <Stat label="Gasto estimado" value={integer(activity.calories)} unit="kcal" />
          )}
          {activity.efficiency_index !== null && (
            <Stat label="Eficiência" value={decimal(activity.efficiency_index, 2)} />
          )}
          {activity.decoupling_pct !== null && (
            <Stat label="Deriva cardíaca" value={decimal(activity.decoupling_pct, 1)} unit="%" />
          )}
        </div>
        {!activity.has_power && (
          <p className="desc" style={{ marginTop: 16, marginBottom: 0 }}>
            Este arquivo não traz medidor de potência: os watts são estimados pela física do percurso
            (peso, inclinação, aceleração e arrasto), sem considerar vento. Servem para comparar treinos
            entre si, não como leitura absoluta.
          </p>
        )}
      </div>

      {streams && distanceKm.length > 1 && (
        <div className="panel">
          <h3>Perfil do treino</h3>
          <p className="desc">
            Altimetria ao longo da distância com {activity.has_hr ? "a frequência cardíaca" : "a velocidade"}{" "}
            sobreposta. Dá para ver onde o esforço subiu e se ele acompanhou o terreno.
          </p>
          <div className="chart-box tall">
            <ProfileChart distanceKm={distanceKm} elevation={elevation} overlay={overlay} />
          </div>
        </div>
      )}

      <div className="grid2">
        {activity.polyline?.length > 1 && (
          <div className="panel">
            <h3>Percurso</h3>
            <p className="desc">
              Traçado do treino — o ponto verde é a partida, o vermelho a chegada.
            </p>
            <RouteMap polyline={activity.polyline} height={240} />
          </div>
        )}

        {zoneSeries.length > 0 && (
          <div className="panel">
            <h3>Tempo por zona de esforço</h3>
            <p className="desc">
              Como o tempo em movimento se dividiu entre as cinco zonas de frequência cardíaca.
            </p>
            <div className="chart-box short">
              <ZoneBars labels={["este treino"]} zones={zoneSeries} />
            </div>
            <table style={{ marginTop: 14, minWidth: 0 }}>
              <thead>
                <tr>
                  <th>Zona</th>
                  <th>Faixa</th>
                  <th>Tempo</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {activity.hr_zones.map((zone) => (
                  <tr key={zone.zone}>
                    <td>
                      {zone.zone} · {zone.name}
                    </td>
                    <td className="num">
                      {zone.min}
                      {zone.max ? `–${zone.max}` : "+"}
                    </td>
                    <td className="num">{duration(zone.seconds)}</td>
                    <td className="num">{decimal(zone.pct, 0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {climbs.length > 0 && (
        <div className="climb">
          <h3>⛰️ Subidas detectadas ({climbs.length})</h3>
          <p className="desc">
            Trechos com no mínimo 200 m, 15 m de ganho e 2% de inclinação média. VAM é a velocidade
            vertical: metros de altitude por hora.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>No km</th>
                  <th>Extensão</th>
                  <th>Ganho</th>
                  <th>Incl. méd</th>
                  <th>Incl. máx</th>
                  <th>Tempo</th>
                  <th>Vel.</th>
                  <th>VAM</th>
                  <th>FC méd</th>
                  <th>Categoria</th>
                </tr>
              </thead>
              <tbody>
                {climbs.map((climb) => (
                  <tr key={climb.id}>
                    <td className="num">{decimal(climb.start_dist_m / 1000, 1)}</td>
                    <td className="num">{integer(climb.distance_m)} m</td>
                    <td className="num">{integer(climb.elev_gain_m)} m</td>
                    <td className="num">{decimal(climb.avg_grade, 1)}%</td>
                    <td className="num">{decimal(climb.max_grade, 1)}%</td>
                    <td className="num">{clock(climb.duration_s)}</td>
                    <td className="num">{decimal(climb.speed_kmh, 1)} km/h</td>
                    <td className="num">{integer(climb.vam)}</td>
                    <td className="num">{integer(climb.avg_hr)}</td>
                    <td>
                      <span className="pill">{climb.category}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {quarters.length === 4 && (
        <div className="panel">
          <h3>Como o treino se comportou do começo ao fim</h3>
          <p className="desc">
            O percurso dividido em quatro partes iguais em distância. Queda de velocidade no último
            quarto costuma ser falta de combustível ou ritmo alto demais na largada.
          </p>
          <div className="climb-row">
            {quarters.map((quarter) => (
              <div className="climb-item" key={quarter.quarter}>
                <div className="d">{quarter.quarter}º QUARTO</div>
                <div className="s">
                  {decimal(quarter.speed_kmh, 1)} <span className="unit">km/h</span>
                </div>
                <div className="meta">
                  {km(quarter.distance_m, 1)} km · {duration(quarter.moving_s)}
                  {quarter.avg_hr && ` · FC ${quarter.avg_hr}`}
                </div>
              </div>
            ))}
          </div>
          {activity.fade_pct !== null && (
            <p className="desc" style={{ marginTop: 16, marginBottom: 0 }}>
              Do primeiro ao último quarto, a velocidade{" "}
              {activity.fade_pct > 0 ? "caiu" : "subiu"} {decimal(Math.abs(activity.fade_pct), 1)}%.
            </p>
          )}
        </div>
      )}

      {activity.splits?.length > 0 && (
        <div className="panel">
          <h3>Parciais por quilômetro</h3>
          <p className="desc">
            Velocidade de cada quilômetro com a frequência cardíaca sobreposta — útil para achar onde o
            terreno ou o esforço mudou.
          </p>
          <div className="chart-box">
            <SplitsChart
              labels={activity.splits.map((s) => String(s.km))}
              speed={activity.splits.map((s) => s.speed_kmh)}
              heartRate={activity.splits.map((s) => s.avg_hr)}
            />
          </div>
          <div style={{ overflowX: "auto", marginTop: 18 }}>
            <table>
              <thead>
                <tr>
                  <th>km</th>
                  <th>Tempo</th>
                  <th>Vel.</th>
                  <th>Elev.</th>
                  <th>FC méd</th>
                  <th>Pot. méd</th>
                </tr>
              </thead>
              <tbody>
                {activity.splits.map((split) => (
                  <tr key={split.km}>
                    <td className="num">{split.km}</td>
                    <td className="num">{clock(split.moving_s)}</td>
                    <td className="num">{decimal(split.speed_kmh, 1)} km/h</td>
                    <td className="num">{integer(split.elev_gain_m)} m</td>
                    <td className="num">{integer(split.avg_hr)}</td>
                    <td className="num">{integer(split.avg_power_w)} W</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="note">
        <Link href="/" style={{ color: "var(--accent)" }}>
          ← Voltar ao painel
        </Link>
        {stride > 1 && ` · gráficos desenhados com 1 a cada ${stride} pontos do arquivo`}
      </div>
    </>
  );
}
