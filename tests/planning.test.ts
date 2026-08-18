import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGoalPlan } from "../src/lib/goal.ts";
import { loadState, nextSession, personalRecords } from "../src/lib/planning.ts";
import type { ActivityRow } from "../src/lib/types.ts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);

/** Treino sintético: só os campos que o planejamento realmente consulta. */
function ride(overrides: Partial<ActivityRow> & { daysAgo: number; km: number }): ActivityRow {
  const { daysAgo, km, ...rest } = overrides;
  const movingS = Math.round((km / 15) * 3600);
  return {
    id: `a-${daysAgo}-${km}`,
    user_id: "u",
    name: `Treino de ${km} km`,
    sport: "cycling",
    started_at: new Date(NOW - daysAgo * DAY).toISOString(),
    file_name: null,
    file_hash: `h-${daysAgo}-${km}`,
    storage_path: null,
    distance_m: km * 1000,
    elapsed_s: movingS,
    moving_s: movingS,
    elevation_gain_m: km * 10,
    elevation_loss_m: km * 10,
    avg_speed_kmh: 15,
    max_speed_kmh: 40,
    avg_hr: 140,
    max_hr: 170,
    min_hr: 90,
    avg_cadence: 80,
    avg_power_w: 150,
    np_power_w: 160,
    max_power_w: 400,
    work_kj: (150 * movingS) / 1000,
    tss: (movingS / 3600) * 60,
    intensity_factor: 0.8,
    efficiency_index: 10.7,
    decoupling_pct: 3,
    fade_pct: 5,
    calories: 600,
    hr_zones: [],
    power_zones: [],
    splits: [],
    quarters: [],
    bounds: null,
    polyline: [],
    has_hr: true,
    has_power: false,
    has_cadence: true,
    notes: null,
    created_at: new Date(NOW).toISOString(),
    ...rest,
  } as ActivityRow;
}

/* ------------------------------ carga ------------------------------ */

test("compara o volume da semana com a média das últimas quatro", () => {
  // Quatro semanas iguais: a razão tem que ficar em torno de 1.
  const steady = [0, 7, 14, 21].map((daysAgo) => ride({ daysAgo, km: 30 }));
  const load = loadState(steady, NOW);

  assert.ok(load.ratio !== null);
  assert.ok(
    Math.abs((load.ratio as number) - 1) < 0.15,
    `razão ${load.ratio} deveria estar perto de 1 com volume constante`,
  );
  assert.equal(load.status, "ideal");
  assert.equal(load.weeklyKm, 30);
});

test("acusa risco quando a semana dispara acima da média", () => {
  const spike = [
    ride({ daysAgo: 0, km: 60 }),
    ride({ daysAgo: 2, km: 60 }),
    ride({ daysAgo: 4, km: 60 }),
    ride({ daysAgo: 21, km: 20 }),
  ];
  const load = loadState(spike, NOW);
  assert.equal(load.status, "risco", `razão ${load.ratio} deveria cair em risco`);
});

test("reconhece parada longa", () => {
  const load = loadState([ride({ daysAgo: 20, km: 30 })], NOW);
  assert.equal(load.status, "descanso");
  assert.equal(load.daysSinceLast, 20);
});

/* -------------------------- próximo treino -------------------------- */

test("manda encurtar quando a carga subiu rápido demais", () => {
  const spike = [
    ride({ daysAgo: 0, km: 60 }),
    ride({ daysAgo: 2, km: 60 }),
    ride({ daysAgo: 4, km: 60 }),
    ride({ daysAgo: 21, km: 20 }),
  ];
  const load = loadState(spike, NOW);
  const next = nextSession(spike, { hr_max: 195 }, load);

  assert.ok(next);
  assert.equal(next.kind, "Recuperação");
  assert.ok(next.distanceKm < 60, `deveria propor menos que o de sempre, veio ${next.distanceKm}`);
  // FC alvo tem que ser a zona 2 da FC máxima informada.
  assert.equal(next.hrLow, 117);
  assert.equal(next.hrHigh, 146);
});

test("propõe progressão quando há espaço na semana", () => {
  const easing = [
    ride({ daysAgo: 2, km: 20 }),
    ride({ daysAgo: 10, km: 40 }),
    ride({ daysAgo: 14, km: 40 }),
    ride({ daysAgo: 20, km: 40 }),
  ];
  const load = loadState(easing, NOW);
  const next = nextSession(easing, { hr_max: 195 }, load);

  assert.ok(next);
  assert.equal(load.status, "leve");
  assert.equal(next.kind, "Progressão");
});

/* ------------------------------ meta ------------------------------ */

test("monta a progressão até a meta e chega nela", () => {
  const history = [30, 32, 35].map((km, i) => ride({ daysAgo: i * 7, km }));
  const plan = buildGoalPlan(100, history, { weight_kg: 75, bike_weight_kg: 10 });

  assert.ok(plan);
  assert.equal(plan.alreadyDone, false);
  assert.equal(plan.targetKm, 100);
  assert.equal(plan.longestKm, 35);

  const last = plan.weeks[plan.weeks.length - 1];
  assert.equal(last.reachesGoal, true, "a última semana deveria alcançar a meta");
  assert.equal(last.longRideKm, 100);

  // Progressão de 10% com alívio a cada quarta semana leva mais que 8 semanas
  // de 35 para 100 km, e o plano não pode estourar o teto de 26.
  assert.ok(
    plan.weeksNeeded > 8 && plan.weeksNeeded <= 26,
    `${plan.weeksNeeded} semanas fora do esperado`,
  );

  // Toda quarta semana é de alívio, e alívio nunca sobe carga.
  const recovery = plan.weeks.filter((w) => w.recovery);
  assert.ok(recovery.length >= 1);
  for (const week of recovery) {
    assert.equal(week.week % 4, 0);
  }
});

test("reconhece meta já cumprida", () => {
  const history = [ride({ daysAgo: 3, km: 110 })];
  const plan = buildGoalPlan(100, history, null);
  assert.ok(plan);
  assert.equal(plan.alreadyDone, true);
  assert.ok(plan.warnings.some((w) => /já completou/.test(w)));
});

test("estima ritmo menor para distância bem acima da atual", () => {
  const history = [ride({ daysAgo: 1, km: 35 })];
  const curto = buildGoalPlan(35, history, null);
  const longo = buildGoalPlan(150, history, null);

  assert.ok(curto && longo);
  assert.ok(
    longo.estimate.speedKmh < curto.estimate.speedKmh,
    `${longo.estimate.speedKmh} deveria ser menor que ${curto.estimate.speedKmh}`,
  );
});

/* ---------------------------- nutrição ---------------------------- */

test("escala o carboidrato conforme a duração", () => {
  const history = [ride({ daysAgo: 1, km: 30 })];

  // 15 km a ~15 km/h dá uma hora: estoque próprio dá conta, nada na estrada.
  const curto = buildGoalPlan(15, history, null);
  assert.ok(curto);
  assert.equal(curto.nutrition.carbsPerHour, 0);
  assert.equal(curto.nutrition.schedule.length, 0);

  // 100 km passa de três horas: faixa alta, com cronograma de paradas.
  const longo = buildGoalPlan(100, history, { weight_kg: 75, bike_weight_kg: 10 });
  assert.ok(longo);
  assert.equal(longo.nutrition.carbsPerHour, 80);
  assert.ok(longo.nutrition.schedule.length > 5, "deveria haver várias paradas para comer");

  // O total tem que bater com a taxa por hora vezes a duração.
  const horas = longo.nutrition.durationS / 3600;
  assert.ok(
    Math.abs(longo.nutrition.totalCarbs - 80 * horas) < 1,
    `total ${longo.nutrition.totalCarbs} não bate com 80 g/h por ${horas.toFixed(1)} h`,
  );

  // Líquido e sódio crescem junto com o tempo, não com a distância.
  assert.ok(longo.nutrition.fluidMl > curto.nutrition.fluidMl);
  assert.ok(longo.nutrition.sodiumMg > curto.nutrition.sodiumMg);
});

test("gasto energético fica em faixa fisiológica", () => {
  const history = [ride({ daysAgo: 1, km: 30 })];
  const plan = buildGoalPlan(100, history, { weight_kg: 75, bike_weight_kg: 10 });
  assert.ok(plan);

  // 150 W por ~6,7 h a 22% de eficiência dá perto de 3900 kcal. Um erro comum é
  // esquecer de converter kJ para kcal, o que multiplicaria isso por 4.
  const kcalPorHora = plan.nutrition.calories / (plan.nutrition.durationS / 3600);
  assert.ok(
    kcalPorHora > 300 && kcalPorHora < 900,
    `${Math.round(kcalPorHora)} kcal/h fora da faixa plausível para 150 W`,
  );
});

/* ---------------------------- recordes ---------------------------- */

test("acha o melhor trecho contínuo dentro dos treinos", () => {
  const splits = (times: number[]) =>
    times.map((moving_s, i) => ({
      km: i + 1,
      distance_m: 1000,
      moving_s,
      speed_kmh: 3600 / moving_s,
      elev_gain_m: 0,
      avg_hr: 140,
      avg_power_w: 150,
    }));

  const lento = ride({ daysAgo: 5, km: 6 });
  lento.splits = splits([240, 240, 240, 240, 240, 240]);

  const rapido = ride({ daysAgo: 1, km: 6 });
  // Os 5 km do meio são o melhor trecho, mesmo com pontas lentas.
  rapido.splits = splits([300, 180, 180, 180, 180, 180]);

  const records = personalRecords([lento, rapido], []);
  const best5 = records.find((r) => r.label === "Melhor 5 km");

  assert.ok(best5);
  assert.equal(best5.value, "15:00", `esperava 5×180s, veio ${best5.value}`);
  assert.equal(best5.activityId, rapido.id);
});
