import type { ActivityRow } from "./types";

/* ------------------------------------------------------------------ *
 * Plano de treino para chegar a uma distância
 * ------------------------------------------------------------------ */

/** Acréscimo semanal no treino mais longo que o corpo costuma absorver. */
const WEEKLY_PROGRESSION = 0.1;
/** A cada quatro semanas, uma de alívio: é na recuperação que a adaptação fecha. */
const RECOVERY_EVERY = 4;
const RECOVERY_FACTOR = 0.7;
/** O treino longo costuma valer perto de 45 % do volume da semana. */
const LONG_RIDE_SHARE = 0.45;
const MAX_WEEKS = 26;

export interface WeekPlan {
  week: number;
  longRideKm: number;
  weeklyKm: number;
  sessions: string;
  focus: string;
  recovery: boolean;
  reachesGoal: boolean;
}

export interface Feeding {
  atMinute: number;
  what: string;
  carbs: number;
}

export interface NutritionPlan {
  durationS: number;
  carbsPerHour: number;
  totalCarbs: number;
  fluidMl: number;
  sodiumMg: number;
  calories: number;
  preRide: string;
  duringRide: string;
  postRide: string;
  schedule: Feeding[];
}

export interface GoalPlan {
  targetKm: number;
  longestKm: number;
  currentWeeklyKm: number;
  alreadyDone: boolean;
  weeksNeeded: number;
  weeks: WeekPlan[];
  estimate: {
    speedKmh: number;
    durationS: number;
    elevationM: number | null;
  };
  nutrition: NutritionPlan;
  warnings: string[];
}

/* ------------------------------------------------------------------ *
 * Nutrição
 * ------------------------------------------------------------------ */

/**
 * Carboidrato por hora conforme a duração. Até uma hora e pouco o estoque
 * muscular dá conta sozinho; passando de duas horas e meia o intestino precisa
 * de mistura de glicose com frutose para absorver acima de 60 g/h — por isso a
 * faixa alta pede gel ou isotônico, não só fruta.
 */
function carbsPerHourFor(hours: number): number {
  if (hours < 1.25) return 0;
  if (hours < 2) return 40;
  if (hours < 3) return 60;
  return 80;
}

/** Itens comuns, com o carboidrato que cada um entrega de fato. */
const FOODS = [
  { name: "1 banana prata", carbs: 22 },
  { name: "1 sachê de gel", carbs: 25 },
  { name: "1 pacote de bala de goma", carbs: 25 },
  { name: "1 colher de doce de leite", carbs: 12 },
  { name: "500 ml de isotônico", carbs: 30 },
  { name: "1 pedaço de rapadura", carbs: 25 },
  { name: "1 pão francês com mel", carbs: 34 },
];

function buildSchedule(durationS: number, carbsPerHour: number): Feeding[] {
  const schedule: Feeding[] = [];
  if (carbsPerHour === 0) return schedule;

  const totalMinutes = durationS / 60;
  // Comer a cada 40 minutos mantém o fluxo constante sem pesar o estômago.
  const interval = 40;
  const perFeeding = (carbsPerHour / 60) * interval;

  let index = 0;
  for (let minute = interval; minute <= totalMinutes - 15; minute += interval) {
    // Escolhe o item cujo carboidrato mais se aproxima do necessário na parada,
    // alternando para não repetir o mesmo sabor a viagem inteira.
    const candidates = [...FOODS].sort(
      (a, b) => Math.abs(a.carbs - perFeeding) - Math.abs(b.carbs - perFeeding),
    );
    const choice = candidates[index % Math.min(3, candidates.length)];
    schedule.push({ atMinute: minute, what: choice.name, carbs: choice.carbs });
    index++;
  }
  return schedule;
}

function buildNutrition(durationS: number, weightKg: number, avgPowerW: number | null): NutritionPlan {
  const hours = durationS / 3600;
  const carbsPerHour = carbsPerHourFor(hours);
  const totalCarbs = Math.round(carbsPerHour * hours);

  // Calor do Sul no verão puxa a reposição para a faixa alta.
  const fluidPerHour = 700;
  const sodiumPerHour = 600;

  const calories = avgPowerW
    ? Math.round((avgPowerW * durationS) / 1000 / 0.22 / 4.184)
    : Math.round(hours * 550);

  const preCarbs = Math.round(weightKg * 1.5);
  const postCarbs = Math.round(weightKg * 1.0);

  return {
    durationS,
    carbsPerHour,
    totalCarbs,
    fluidMl: Math.round(fluidPerHour * hours),
    sodiumMg: Math.round(sodiumPerHour * hours),
    calories,
    preRide:
      hours < 1.25
        ? "Café da manhã normal serve. Para treino curto não há necessidade de carregar carboidrato."
        : `${preCarbs} g de carboidrato de 2 a 3 horas antes — algo como 2 pães com mel e 1 banana, ou um prato de mingau de aveia. Evite estrear alimento novo no dia.`,
    duringRide:
      carbsPerHour === 0
        ? "Só água. Abaixo de uma hora e pouco o estoque muscular dá conta sozinho."
        : `${carbsPerHour} g de carboidrato por hora, começando na primeira meia hora — não espere a fome chegar, porque quando ela chega já é tarde. Beba ${fluidPerHour} ml por hora e reponha ${sodiumPerHour} mg de sódio (uma pitada de sal na garrafa resolve).`,
    postRide: `Na primeira hora depois de descer da bike: ${postCarbs} g de carboidrato com 20 a 25 g de proteína. Sanduíche com leite, ou arroz com feijão e ovo, funcionam bem.`,
    schedule: buildSchedule(durationS, carbsPerHour),
  };
}

/* ------------------------------------------------------------------ *
 * Montagem do plano
 * ------------------------------------------------------------------ */

/**
 * Monta o caminho até a distância desejada, subindo o treino longo em 10 % por
 * semana e aliviando a cada quarta. Também estima como será o dia da meta:
 * quanto tempo leva e o que comer para não apagar no final.
 */
export function buildGoalPlan(
  targetKm: number,
  activities: ActivityRow[],
  profile: { weight_kg: number; bike_weight_kg: number } | null,
): GoalPlan | null {
  if (activities.length === 0) return null;

  const distances = activities.map((a) => a.distance_m / 1000);
  const longestKm = Math.max(...distances);

  const now = Date.now();
  const lastWeek = activities.filter(
    (a) => now - Date.parse(a.started_at) <= 7 * 86_400_000,
  );
  const currentWeeklyKm = lastWeek.reduce((sum, a) => sum + a.distance_m, 0) / 1000;

  // A velocidade da meta parte dos treinos mais longos, que é onde o ritmo
  // sustentável aparece. Distância maior derruba um pouco a média.
  const longRides = [...activities]
    .sort((a, b) => b.distance_m - a.distance_m)
    .slice(0, 3)
    .filter((a) => a.avg_speed_kmh !== null);

  const baseSpeed =
    longRides.length > 0
      ? longRides.reduce((sum, a) => sum + (a.avg_speed_kmh as number), 0) / longRides.length
      : 15;

  const stretch = Math.max(1, targetKm / Math.max(longestKm, 1));
  const derate = Math.min(0.18, (stretch - 1) * 0.12);
  const speedKmh = Number((baseSpeed * (1 - derate)).toFixed(1));
  const durationS = Math.round((targetKm / speedKmh) * 3600);

  // Elevação proporcional ao que o terreno dele costuma entregar por quilômetro.
  const totalDistanceKm = distances.reduce((s, d) => s + d, 0);
  const totalGain = activities.reduce((s, a) => s + a.elevation_gain_m, 0);
  const elevationM =
    totalDistanceKm > 0 ? Math.round((totalGain / totalDistanceKm) * targetKm) : null;

  const avgPower =
    activities.filter((a) => a.avg_power_w !== null).length > 0
      ? activities.reduce((s, a) => s + (a.avg_power_w ?? 0), 0) /
        activities.filter((a) => a.avg_power_w !== null).length
      : null;

  const weightKg = profile?.weight_kg ?? 75;
  const nutrition = buildNutrition(durationS, weightKg, avgPower);

  const alreadyDone = longestKm >= targetKm;

  // Progressão semana a semana até o longo alcançar a meta.
  const weeks: WeekPlan[] = [];
  // `peak` é a progressão real e só sobe. A semana de alívio encurta o treino
  // daquela semana sem derrubar o patamar já conquistado — tratá-la como queda
  // permanente faria três semanas de +10% seguidas de -30% darem saldo
  // negativo, e o plano nunca chegaria à meta.
  let peak = alreadyDone ? targetKm : longestKm;
  let week = 0;

  while (week < MAX_WEEKS) {
    week++;
    const isRecovery = week % RECOVERY_EVERY === 0;

    if (!alreadyDone && !isRecovery) {
      peak = peak * (1 + WEEKLY_PROGRESSION);
    }

    const thisWeek = isRecovery ? peak * RECOVERY_FACTOR : peak;
    const capped = Math.min(thisWeek, targetKm);
    const reaches = !alreadyDone && !isRecovery && peak >= targetKm - 0.5;

    weeks.push({
      week,
      longRideKm: Math.round(capped * 2) / 2,
      weeklyKm: Math.round(capped / LONG_RIDE_SHARE),
      sessions: isRecovery
        ? "2 treinos: 1 curto leve + 1 médio"
        : "3 treinos: 1 curto, 1 médio e o longo no fim de semana",
      focus: isRecovery
        ? "Semana de alívio — é na recuperação que a adaptação fecha"
        : reaches
          ? "Semana da meta: o longo é o próprio objetivo"
          : "Zona 2 no longo, sem buscar tempo em subida",
      recovery: isRecovery,
      reachesGoal: reaches,
    });

    if (reaches || alreadyDone) break;
  }

  const warnings: string[] = [];
  if (alreadyDone) {
    warnings.push(
      `Você já completou ${longestKm.toFixed(1)} km, então a distância não é mais a barreira. O plano abaixo vira uma semana de preparação para repetir a distância com mais folga.`,
    );
  }
  if (weeks.length >= MAX_WEEKS) {
    warnings.push(
      "A meta está longe o bastante para o plano passar de seis meses. Vale mirar um alvo intermediário primeiro.",
    );
  }
  if (currentWeeklyKm > 0 && targetKm > currentWeeklyKm * 1.5) {
    warnings.push(
      `A meta de ${targetKm} km é maior que uma semana inteira do seu volume atual (${currentWeeklyKm.toFixed(0)} km). O plano dá conta, mas exige constância — pular semanas empurra tudo para frente.`,
    );
  }
  if (durationS > 4 * 3600) {
    warnings.push(
      "Acima de quatro horas na bike, a alimentação deixa de ser detalhe e vira o fator que decide se você termina. Ensaie a estratégia nos treinos longos antes do dia.",
    );
  }

  return {
    targetKm,
    longestKm: Number(longestKm.toFixed(1)),
    currentWeeklyKm: Number(currentWeeklyKm.toFixed(1)),
    alreadyDone,
    weeksNeeded: weeks.length,
    weeks,
    estimate: { speedKmh, durationS, elevationM },
    nutrition,
    warnings,
  };
}
