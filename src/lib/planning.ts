import type { ActivityRow, ClimbRow } from "./types";

/* ------------------------------------------------------------------ *
 * Carga de treino
 * ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;

/**
 * Carga aguda contra crônica: o volume dos últimos 7 dias comparado com a média
 * semanal das últimas 4 semanas. É a forma mais usada de perceber se o aumento
 * de treino está à frente do que o corpo já absorveu — subir rápido demais é o
 * caminho conhecido para lesão e estagnação.
 */
export interface LoadState {
  acute: number;
  chronic: number;
  ratio: number | null;
  daysSinceLast: number | null;
  weeklyKm: number;
  status: "descanso" | "leve" | "ideal" | "atencao" | "risco";
  reading: string;
}

function loadOf(activity: ActivityRow): number {
  // Sem FC nem potência não há carga calculada; o tempo em movimento serve de
  // aproximação grosseira (uma hora pedalando ≈ 50 de carga).
  return activity.tss ?? (activity.moving_s / 3600) * 50;
}

export function loadState(activities: ActivityRow[], now = Date.now()): LoadState {
  // Estritamente menor: um treino de exatamente 7 dias atrás pertence à semana
  // anterior. Com `<=`, quem treina semanalmente via a carga aguda dobrar,
  // porque o mesmo treino caía na janela de 7 e na de 28 dias como se fossem
  // dois.
  const since = (days: number) =>
    activities.filter((a) => now - Date.parse(a.started_at) < days * DAY_MS);

  const last7 = since(7);
  const last28 = since(28);

  const acute = last7.reduce((sum, a) => sum + loadOf(a), 0);
  const chronic = last28.reduce((sum, a) => sum + loadOf(a), 0) / 4;
  const weeklyKm = last7.reduce((sum, a) => sum + a.distance_m, 0) / 1000;

  const ratio = chronic > 0 ? acute / chronic : null;

  const latest = activities
    .map((a) => Date.parse(a.started_at))
    .sort((a, b) => b - a)[0];
  const daysSinceLast = latest ? Math.floor((now - latest) / DAY_MS) : null;

  let status: LoadState["status"];
  let reading: string;

  if (daysSinceLast !== null && daysSinceLast >= 10) {
    status = "descanso";
    reading = `Faz ${daysSinceLast} dias desde o último treino. A base aeróbica começa a ceder por volta de duas semanas parado — vale retomar com volume menor antes de voltar ao de sempre.`;
  } else if (ratio === null) {
    status = "leve";
    reading = "Ainda não há treinos suficientes para medir carga. A partir de umas três semanas de histórico esta leitura fica confiável.";
  } else if (ratio > 1.5) {
    status = "risco";
    reading = `A semana está ${Math.round((ratio - 1) * 100)}% acima da sua média das últimas quatro. Aumento nessa velocidade é o padrão que precede lesão por excesso — o próximo treino pede ser curto e leve.`;
  } else if (ratio > 1.3) {
    status = "atencao";
    reading = `A semana está ${Math.round((ratio - 1) * 100)}% acima da média recente. Dá para sustentar, mas não é hora de somar mais volume.`;
  } else if (ratio < 0.8) {
    status = "leve";
    reading = "A semana está abaixo da sua média recente. Há espaço para somar volume sem atropelar a adaptação.";
  } else {
    status = "ideal";
    reading = "Volume da semana em linha com a média recente. É nessa faixa que o ganho acontece sem cobrar caro.";
  }

  return {
    acute: Math.round(acute),
    chronic: Math.round(chronic),
    ratio: ratio === null ? null : Number(ratio.toFixed(2)),
    daysSinceLast,
    weeklyKm: Number(weeklyKm.toFixed(1)),
    status,
    reading,
  };
}

/* ------------------------------------------------------------------ *
 * Próximo treino
 * ------------------------------------------------------------------ */

export interface NextSession {
  kind: string;
  distanceKm: number;
  durationS: number;
  hrLow: number | null;
  hrHigh: number | null;
  speedKmh: number;
  why: string;
  howTo: string;
}

/** Média das corridas mais recentes, com peso maior para as últimas. */
function recentAverage(values: number[], count = 3): number | null {
  const list = values.slice(0, count);
  if (list.length === 0) return null;
  let weighted = 0;
  let weights = 0;
  list.forEach((value, i) => {
    const weight = list.length - i;
    weighted += value * weight;
    weights += weight;
  });
  return weighted / weights;
}

/**
 * Sugere o próximo treino a partir do que já foi feito e do quanto de carga o
 * corpo vem absorvendo. A regra de fundo é a progressão de 10% por semana no
 * treino mais longo — devagar o bastante para o corpo acompanhar.
 */
export function nextSession(
  activities: ActivityRow[],
  profile: { hr_max: number } | null,
  load: LoadState,
): NextSession | null {
  if (activities.length === 0) return null;

  const chronological = [...activities].sort((a, b) => b.started_at.localeCompare(a.started_at));
  const distances = chronological.map((a) => a.distance_m / 1000);
  const speeds = chronological
    .map((a) => a.avg_speed_kmh)
    .filter((v): v is number => v !== null);

  const typical = recentAverage(distances) ?? distances[0];
  const longest = Math.max(...distances);
  const speed = recentAverage(speeds) ?? 15;

  const hrMax = profile?.hr_max ?? 195;
  const z2Low = Math.round(hrMax * 0.6);
  const z2High = Math.round(hrMax * 0.75);

  let kind: string;
  let distanceKm: number;
  let why: string;
  let howTo: string;

  if (load.status === "descanso") {
    kind = "Retomada";
    distanceKm = typical * 0.7;
    why = "Depois de mais de dez dias parado, o primeiro treino serve para reativar, não para provar nada.";
    howTo = `Mantenha a FC abaixo de ${z2High} o tempo todo. Se subir numa rampa, alivie e deixe voltar.`;
  } else if (load.status === "risco") {
    kind = "Recuperação";
    distanceKm = typical * 0.5;
    why = "A carga da semana subiu bem acima da sua média. Um treino leve agora protege o ganho que você já construiu.";
    howTo = `Terreno plano, FC abaixo de ${z2Low + 10}. Deve terminar com a sensação de que sobrou perna.`;
  } else if (load.status === "atencao") {
    kind = "Manutenção";
    distanceKm = typical;
    why = "A semana já está acima da média. Repetir a distância de sempre consolida sem somar desgaste.";
    howTo = `Zona 2 do começo ao fim, entre ${z2Low} e ${z2High}. Sem buscar tempo em subida.`;
  } else if (load.status === "leve") {
    kind = "Progressão";
    distanceKm = Math.min(longest * 1.1, typical * 1.25);
    why = "Há espaço na semana para somar volume. O acréscimo de 10% sobre o seu treino mais longo é o passo que o corpo acompanha.";
    howTo = `Comece mais devagar do que a vontade pede: os primeiros 10 km abaixo de ${z2Low + 5}. O ganho está em terminar forte, não em começar rápido.`;
  } else {
    kind = "Base aeróbica";
    distanceKm = typical * 1.05;
    why = "Carga em equilíbrio com a média recente — é a faixa em que dá para treinar com frequência e continuar evoluindo.";
    howTo = `Zona 2 sustentada, entre ${z2Low} e ${z2High}, com o mínimo de paradas.`;
  }

  distanceKm = Math.round(distanceKm * 2) / 2;

  return {
    kind,
    distanceKm,
    durationS: Math.round((distanceKm / speed) * 3600),
    hrLow: z2Low,
    hrHigh: z2High,
    speedKmh: Number(speed.toFixed(1)),
    why,
    howTo,
  };
}

/* ------------------------------------------------------------------ *
 * Recordes
 * ------------------------------------------------------------------ */

export interface Record {
  label: string;
  value: string;
  detail: string;
  activityId: string | null;
}

/**
 * Melhor tempo em cada distância, varrendo janelas de quilômetros consecutivos
 * dentro de cada treino. Usa as parciais já calculadas, então sai sem tocar nas
 * séries completas.
 */
function bestOverDistance(activities: ActivityRow[], km: number) {
  let best: { seconds: number; activity: ActivityRow } | null = null;

  for (const activity of activities) {
    const splits = activity.splits ?? [];
    if (splits.length < km) continue;
    for (let start = 0; start + km <= splits.length; start++) {
      const window = splits.slice(start, start + km);
      // Parcial incompleta no fim do treino distorceria a janela.
      if (window.some((s) => s.distance_m < 900 || s.moving_s === 0)) continue;
      const seconds = window.reduce((sum, s) => sum + s.moving_s, 0);
      if (!best || seconds < best.seconds) best = { seconds, activity };
    }
  }
  return best;
}

export function personalRecords(activities: ActivityRow[], climbs: ClimbRow[]): Record[] {
  const records: Record[] = [];
  if (activities.length === 0) return records;

  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.round(s % 60);
    return h > 0
      ? `${h}h${String(m).padStart(2, "0")}`
      : `${m}:${String(sec).padStart(2, "0")}`;
  };

  for (const km of [5, 10, 20, 40]) {
    const best = bestOverDistance(activities, km);
    if (best) {
      records.push({
        label: `Melhor ${km} km`,
        value: fmtTime(best.seconds),
        detail: `${((km / best.seconds) * 3600).toFixed(1)} km/h de média`,
        activityId: best.activity.id,
      });
    }
  }

  const longest = activities.reduce((a, b) => (b.distance_m > a.distance_m ? b : a));
  records.push({
    label: "Maior distância",
    value: `${(longest.distance_m / 1000).toFixed(1)} km`,
    detail: longest.name,
    activityId: longest.id,
  });

  const climbiest = activities.reduce((a, b) =>
    b.elevation_gain_m > a.elevation_gain_m ? b : a,
  );
  records.push({
    label: "Mais elevação",
    value: `${Math.round(climbiest.elevation_gain_m)} m`,
    detail: climbiest.name,
    activityId: climbiest.id,
  });

  const bestVam = climbs.filter((c) => c.vam > 0).sort((a, b) => b.vam - a.vam)[0];
  if (bestVam) {
    records.push({
      label: "Melhor VAM",
      value: `${Math.round(bestVam.vam)} m/h`,
      detail: `subida de ${Math.round(bestVam.distance_m)} m a ${bestVam.avg_grade.toFixed(1)}%`,
      activityId: bestVam.activity_id,
    });
  }

  const efficient = activities
    .filter((a) => a.efficiency_index !== null)
    .sort((a, b) => (b.efficiency_index as number) - (a.efficiency_index as number))[0];
  if (efficient) {
    records.push({
      label: "Melhor eficiência",
      value: (efficient.efficiency_index as number).toFixed(2),
      detail: `${efficient.avg_speed_kmh} km/h a ${efficient.avg_hr} bpm`,
      activityId: efficient.id,
    });
  }

  return records;
}
