import { haversine } from "./metrics";
import type { ActivityRow, ClimbRow } from "./types";
import { decimal, integer, km, shortDate } from "./format";

/* ------------------------------------------------------------------ *
 * Agrupamento de rotas
 * ------------------------------------------------------------------ */

/** Distância média máxima entre pontos correspondentes de duas rotas iguais. */
const SAME_ROUTE_TOLERANCE_M = 500;
/** Duas voltas na mesma rota nunca diferem tanto assim em quilometragem. */
const SAME_ROUTE_DISTANCE_TOLERANCE = 0.2;
const ROUTE_SAMPLE_POINTS = 24;

function samplePolyline(polyline: [number, number][], count: number): [number, number][] {
  if (polyline.length === 0) return [];
  const out: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.min(polyline.length - 1, Math.round((i / (count - 1)) * (polyline.length - 1)));
    out.push(polyline[idx]);
  }
  return out;
}

/**
 * Distância média entre pontos correspondentes de dois traçados. Comparar por
 * fração do percurso — e não só o ponto de partida — evita confundir duas rotas
 * diferentes que saem da mesma casa.
 */
function routeDistance(a: [number, number][], b: [number, number][]): number | null {
  const sa = samplePolyline(a, ROUTE_SAMPLE_POINTS);
  const sb = samplePolyline(b, ROUTE_SAMPLE_POINTS);
  if (sa.length < 2 || sb.length < 2) return null;
  let sum = 0;
  for (let i = 0; i < sa.length; i++) {
    sum += haversine(sa[i][0], sa[i][1], sb[i][0], sb[i][1]);
  }
  return sum / sa.length;
}

export interface RouteGroup {
  id: string;
  label: string;
  activities: ActivityRow[]; // em ordem cronológica
  avgDistanceM: number;
}

/** Junta treinos que percorreram essencialmente o mesmo caminho. */
export function groupRoutes(activities: ActivityRow[]): RouteGroup[] {
  const chronological = [...activities].sort((a, b) => a.started_at.localeCompare(b.started_at));
  const groups: RouteGroup[] = [];

  for (const activity of chronological) {
    if (!activity.polyline || activity.polyline.length < 2) continue;

    const match = groups.find((group) => {
      const reference = group.activities[0];
      const ratio = Math.abs(activity.distance_m - group.avgDistanceM) / group.avgDistanceM;
      if (ratio > SAME_ROUTE_DISTANCE_TOLERANCE) return false;
      const spread = routeDistance(reference.polyline, activity.polyline);
      return spread !== null && spread <= SAME_ROUTE_TOLERANCE_M;
    });

    if (match) {
      match.activities.push(activity);
      match.avgDistanceM =
        match.activities.reduce((sum, a) => sum + a.distance_m, 0) / match.activities.length;
    } else {
      groups.push({
        id: activity.id,
        label: `Rota de ${km(activity.distance_m, 0)} km`,
        activities: [activity],
        avgDistanceM: activity.distance_m,
      });
    }
  }

  return groups
    .map((group) => ({ ...group, label: `Rota de ${km(group.avgDistanceM, 0)} km` }))
    .sort((a, b) => b.activities.length - a.activities.length);
}

/* ------------------------------------------------------------------ *
 * Pareamento de subidas entre treinos
 * ------------------------------------------------------------------ */

const SAME_CLIMB_START_M = 150;
const SAME_CLIMB_DISTANCE_TOLERANCE = 0.3;

export interface ClimbGroup {
  id: string;
  label: string;
  distanceM: number;
  avgGrade: number;
  climbs: (ClimbRow & { activity: ActivityRow })[]; // em ordem cronológica
}

/**
 * Agrupa a mesma subida registrada em treinos diferentes, para medir evolução
 * no trecho em vez de comparar médias de percursos distintos.
 */
export function groupClimbs(climbs: ClimbRow[], activities: ActivityRow[]): ClimbGroup[] {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const enriched = climbs
    .map((climb) => {
      const activity = byId.get(climb.activity_id);
      return activity ? { ...climb, activity } : null;
    })
    .filter((c): c is ClimbRow & { activity: ActivityRow } => c !== null)
    .sort((a, b) => a.activity.started_at.localeCompare(b.activity.started_at));

  const groups: ClimbGroup[] = [];
  for (const climb of enriched) {
    const match = groups.find((group) => {
      const reference = group.climbs[0];
      const gap = haversine(
        reference.start_lat,
        reference.start_lon,
        climb.start_lat,
        climb.start_lon,
      );
      if (gap > SAME_CLIMB_START_M) return false;
      const ratio = Math.abs(climb.distance_m - group.distanceM) / group.distanceM;
      return ratio <= SAME_CLIMB_DISTANCE_TOLERANCE;
    });

    if (match) {
      match.climbs.push(climb);
      match.distanceM = match.climbs.reduce((s, c) => s + c.distance_m, 0) / match.climbs.length;
      match.avgGrade = match.climbs.reduce((s, c) => s + c.avg_grade, 0) / match.climbs.length;
    } else {
      groups.push({
        id: climb.id,
        label: "",
        distanceM: climb.distance_m,
        avgGrade: climb.avg_grade,
        climbs: [climb],
      });
    }
  }

  return groups
    .map((group) => {
      const first = group.climbs[0];
      return {
        ...group,
        label: `Subida do km ${decimal(first.start_dist_m / 1000, 1)} · ${integer(
          group.distanceM,
        )} m a ${decimal(group.avgGrade, 1)}%`,
      };
    })
    .sort((a, b) => {
      if (b.climbs.length !== a.climbs.length) return b.climbs.length - a.climbs.length;
      return b.distanceM * b.avgGrade - a.distanceM * a.avgGrade;
    });
}

/* ------------------------------------------------------------------ *
 * Destaque principal do painel
 * ------------------------------------------------------------------ */

export interface HeroInsight {
  headline: string;
  value: string;
  unit: string;
  tone: "good" | "warn" | "neutral";
  body: string;
  chart: { labels: string[]; values: number[]; tooltip: string; min?: number; max?: number };
}

function trendChart(activities: ActivityRow[], pick: (a: ActivityRow) => number | null) {
  const usable = activities.filter((a) => pick(a) !== null);
  return {
    labels: usable.map((a) => `${shortDate(a.started_at).replace(".", "")}\n(${km(a.distance_m, 0)} km)`),
    values: usable.map((a) => pick(a) as number),
  };
}

/**
 * Escolhe o sinal de progresso mais forte que os dados sustentam, na ordem em
 * que ele é interpretável: mesma rota com FC caindo é a evidência mais limpa de
 * ganho aeróbico; sem isso, cai para eficiência, ritmo e finalmente volume.
 */
export function buildHeroInsight(
  activities: ActivityRow[],
  routeGroups: RouteGroup[],
): HeroInsight | null {
  if (activities.length === 0) return null;

  const chronological = [...activities].sort((a, b) => a.started_at.localeCompare(b.started_at));

  // 1. Mesma rota, FC média mais baixa: o sinal mais direto de condicionamento.
  const hrRoute = routeGroups
    .map((group) => group.activities.filter((a) => a.avg_hr !== null && a.avg_speed_kmh !== null))
    .filter((list) => list.length >= 2)
    .map((list) => {
      const first = list[0];
      const last = list[list.length - 1];
      return {
        list,
        first,
        last,
        hrDelta: (last.avg_hr as number) - (first.avg_hr as number),
        speedDelta: (last.avg_speed_kmh as number) - (first.avg_speed_kmh as number),
      };
    })
    .sort((a, b) => a.hrDelta - b.hrDelta)[0];

  if (hrRoute && hrRoute.hrDelta <= -2) {
    const chart = trendChart(hrRoute.list, (a) => a.avg_hr);
    const speedPhrase =
      hrRoute.speedDelta >= 0.2
        ? "e com velocidade média maior"
        : hrRoute.speedDelta <= -0.2
          ? "com velocidade média um pouco menor"
          : "mantendo a mesma velocidade média";
    return {
      headline: "O grande sinal: mesmo esforço, coração trabalhando menos",
      value: `−${Math.abs(hrRoute.hrDelta)}`,
      unit: "bpm",
      tone: "good",
      body: `Na mesma rota de ~${km(hrRoute.first.distance_m, 0)} km, sua FC média caiu de ${
        hrRoute.first.avg_hr
      } (${shortDate(hrRoute.first.started_at)}) para ${hrRoute.last.avg_hr} (${shortDate(
        hrRoute.last.started_at,
      )}), ${speedPhrase}. Isso é fitness aeróbico subindo — o objetivo nº 1 de quem treina resistência.`,
      chart: { ...chart, tooltip: "bpm médio" },
    };
  }

  // 2. Índice de eficiência (velocidade por batimento) ao longo do tempo.
  const withEfficiency = chronological.filter((a) => a.efficiency_index !== null);
  if (withEfficiency.length >= 2) {
    const first = withEfficiency[0];
    const last = withEfficiency[withEfficiency.length - 1];
    const deltaPct =
      (((last.efficiency_index as number) - (first.efficiency_index as number)) /
        (first.efficiency_index as number)) *
      100;
    const improving = deltaPct >= 0;
    const chart = trendChart(withEfficiency, (a) => a.efficiency_index);
    return {
      headline: improving
        ? "Cada batimento está rendendo mais quilômetro"
        : "A eficiência recuou neste período",
      value: `${improving ? "+" : "−"}${decimal(Math.abs(deltaPct), 1)}`,
      unit: "%",
      tone: improving ? "good" : "warn",
      body: improving
        ? `O índice de eficiência (velocidade ÷ FC média) subiu de ${decimal(
            first.efficiency_index,
            2,
          )} para ${decimal(last.efficiency_index, 2)}. Você está entregando mais velocidade pelo mesmo custo cardíaco.`
        : `O índice caiu de ${decimal(first.efficiency_index, 2)} para ${decimal(
            last.efficiency_index,
            2,
          )}. Pode ser calor, vento, cansaço acumulado ou rota mais dura — vale olhar treino por treino antes de concluir.`,
      chart: { ...chart, tooltip: "índice (vel ÷ FC × 100)" },
    };
  }

  // 3. Sem FC no arquivo: o que sobra de comparável é o ritmo.
  const withSpeed = chronological.filter((a) => a.avg_speed_kmh !== null);
  if (withSpeed.length >= 2) {
    const first = withSpeed[0];
    const last = withSpeed[withSpeed.length - 1];
    const delta = (last.avg_speed_kmh as number) - (first.avg_speed_kmh as number);
    const chart = trendChart(withSpeed, (a) => a.avg_speed_kmh);
    return {
      headline: "Evolução do ritmo médio",
      value: `${delta >= 0 ? "+" : "−"}${decimal(Math.abs(delta), 1)}`,
      unit: "km/h",
      tone: delta >= 0 ? "good" : "neutral",
      body: `Sua velocidade média foi de ${decimal(first.avg_speed_kmh, 1)} km/h para ${decimal(
        last.avg_speed_kmh,
        1,
      )} km/h. Como esses arquivos não trazem frequência cardíaca, ainda não é possível separar ganho de condicionamento de um dia mais favorável.`,
      chart: { ...chart, tooltip: "km/h médio" },
    };
  }

  // 4. Primeiro treino: só há volume para mostrar.
  const only = chronological[0];
  return {
    headline: "Primeiro treino no ar",
    value: km(only.distance_m, 1),
    unit: "km",
    tone: "neutral",
    body: "A partir do segundo treino o painel passa a comparar rotas, subidas e frequência cardíaca para mostrar sua evolução.",
    chart: {
      labels: [shortDate(only.started_at)],
      values: [only.distance_m / 1000],
      tooltip: "km",
    },
  };
}

/* ------------------------------------------------------------------ *
 * Cartões de leitura do período
 * ------------------------------------------------------------------ */

export interface Insight {
  icon: string;
  title: string;
  body: string;
}

/** Lê os números e escreve o que eles dizem, sem inventar o que não está lá. */
export function buildInsights(activities: ActivityRow[]): Insight[] {
  const chronological = [...activities].sort((a, b) => a.started_at.localeCompare(b.started_at));
  const insights: Insight[] = [];

  // Queda de ritmo no último quarto do percurso.
  const withFade = chronological.filter((a) => a.fade_pct !== null);
  if (withFade.length >= 2) {
    const first = withFade[0];
    const last = withFade[withFade.length - 1];
    const improved = (last.fade_pct as number) < (first.fade_pct as number);
    insights.push({
      icon: improved ? "📉" : "⚠️",
      title: improved ? "O fim do treino está mais firme" : "O final do treino está cedendo",
      body: improved
        ? `No treino de ${shortDate(first.started_at)} a velocidade caiu ${decimal(
            first.fade_pct,
            0,
          )}% no último quarto do percurso. No de ${shortDate(last.started_at)} a queda foi de ${decimal(
            last.fade_pct,
            0,
          )}%. Ritmo e alimentação sob controle aparecem exatamente aqui.`
        : `A queda de velocidade no último quarto passou de ${decimal(
            first.fade_pct,
            0,
          )}% para ${decimal(last.fade_pct, 0)}%. Vale revisar alimentação na estrada e ritmo na primeira metade.`,
    });
  } else if (withFade.length === 1) {
    const only = withFade[0];
    insights.push({
      icon: "📉",
      title: "Queda no último quarto",
      body: `A velocidade no último quarto do percurso ficou ${decimal(
        only.fade_pct,
        0,
      )}% abaixo do primeiro quarto. Com mais treinos essa curva mostra se o problema é combustível ou ritmo inicial.`,
    });
  }

  // Deriva cardíaca: FC subindo com a velocidade caindo indica limite aeróbico.
  const withDecoupling = chronological.filter((a) => a.decoupling_pct !== null);
  if (withDecoupling.length > 0) {
    const last = withDecoupling[withDecoupling.length - 1];
    const value = last.decoupling_pct as number;
    const healthy = value < 5;
    insights.push({
      icon: healthy ? "❤️" : "🌡️",
      title: healthy ? "Deriva cardíaca sob controle" : "Deriva cardíaca alta",
      body: healthy
        ? `No treino de ${shortDate(last.started_at)} a deriva foi de ${decimal(
            value,
            1,
          )}%. Abaixo de 5% significa que o coração se manteve estável do começo ao fim — base aeróbica sólida para o esforço daquele dia.`
        : `No treino de ${shortDate(last.started_at)} a deriva chegou a ${decimal(
            value,
            1,
          )}%: na segunda metade o coração subiu para entregar a mesma velocidade. Costuma indicar esforço acima da base, calor ou hidratação curta.`,
    });
  }

  // Distribuição por zona: é onde a base aeróbica se constrói ou se queima.
  const withZones = chronological.filter((a) => a.hr_zones && a.hr_zones.length > 0);
  if (withZones.length > 0) {
    const last = withZones[withZones.length - 1];
    const z2 = last.hr_zones.find((z) => z.zone === "Z2")?.pct ?? 0;
    const hard = last.hr_zones
      .filter((z) => z.zone === "Z4" || z.zone === "Z5")
      .reduce((sum, z) => sum + z.pct, 0);
    insights.push({
      icon: "🎯",
      title: "Onde o treino aconteceu",
      body: `No último treino, ${decimal(z2, 0)}% do tempo em Zona 2 e ${decimal(
        hard,
        0,
      )}% em Z4 ou acima. Zona 2 é onde a resistência se constrói; manter o forte perto de zero nos treinos longos é o que permite treinar com frequência sem se queimar.`,
    });
  }

  // Consistência: intervalo médio entre treinos.
  if (chronological.length >= 3) {
    const gaps: number[] = [];
    for (let i = 1; i < chronological.length; i++) {
      const days =
        (Date.parse(chronological[i].started_at) - Date.parse(chronological[i - 1].started_at)) /
        86_400_000;
      gaps.push(days);
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    insights.push({
      icon: "🗓️",
      title: "Ritmo de treino",
      body: `Você pedalou ${chronological.length} vezes, com ${decimal(
        avgGap,
        1,
      )} dias de intervalo médio. Constância pesa mais que treino isolado: manter esse espaçamento já sustenta ganho aeróbico.`,
    });
  }

  return insights.slice(0, 3);
}
